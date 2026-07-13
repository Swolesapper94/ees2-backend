import { Router } from "express";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { asyncHandler, HttpError } from "@/middleware/error";
import { requireAuth } from "@/middleware/auth";
import { authorizeDelegatedAction } from "@/lib/access-assistance/authorization";
import { authorizeEvaluationView } from "@/lib/authorization-policies";

export const commentsRouter = Router({ mergeParams: true });

// GET /api/evaluations/:evalId/comments
commentsRouter.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.user) throw new HttpError(401, "Not authenticated");
    const evaluation = await prisma.evaluation.findUnique({ where: { id: req.params.evalId }, include: { ratingChain: true } });
    if (!evaluation || !(await authorizeEvaluationView(req.user, evaluation, evaluation.ratingChain)).allowed) {
      throw new HttpError(404, "Evaluation not found");
    }
    const comments = await prisma.evalComment.findMany({
      include: {
        author: { select: { id: true, firstName: true, lastName: true, rank: true } },
        replies: {
          include: {
            author: { select: { id: true, firstName: true, lastName: true, rank: true } },
          },
          orderBy: { createdAt: "asc" },
        },
      },
      where: { evaluationId: req.params.evalId, parentId: null },
      orderBy: { createdAt: "desc" },
    });
    res.json(comments);
  }),
);

const createCommentSchema = z.object({
  content: z.string().min(1).max(2000),
  sectionKey: z.string().optional(),
  parentId: z.string().optional(),
});

// POST /api/evaluations/:evalId/comments
commentsRouter.post(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = createCommentSchema.parse(req.body);
    if (!req.user) throw new HttpError(401, "Not authenticated");
    const evaluationId = req.params.evalId!;

    const evaluation = await prisma.evaluation.findUnique({
      where: { id: evaluationId },
      include: { ratingChain: true },
    });
    if (!evaluation) throw new HttpError(404, "Evaluation not found");
    const directAccess = await authorizeEvaluationView(req.user, evaluation, evaluation.ratingChain);
    const delegatedAccess = directAccess.allowed
      ? undefined
      : await authorizeDelegatedAction({
          actorUserId: req.user.id,
          subjectUserId: evaluation.ratingChain.ratedSoldierId,
          capability: "ADD_NON_EVALUATIVE_COMMENT",
          evaluationId: evaluation.id,
        });
    if (!directAccess.allowed && !delegatedAccess?.allowed) throw new HttpError(404, "Evaluation not found");

    const comment = await prisma.evalComment.create({
      data: {
        evaluationId,
        authorId: req.user.id,
        content: body.content,
        sectionKey: body.sectionKey as any,
        parentId: body.parentId,
        createdByUserId: req.user.id,
        ...(delegatedAccess?.grant
          ? { onBehalfOfUserId: evaluation.ratingChain.ratedSoldierId, delegationGrantId: delegatedAccess.grant.id }
          : {}),
      },
      include: {
        author: { select: { id: true, firstName: true, lastName: true, rank: true } },
      },
    });
    await prisma.auditLog.create({
      data: {
        actorId: req.user.id,
        subjectUserId: delegatedAccess?.grant ? evaluation.ratingChain.ratedSoldierId : null,
        delegationGrantId: delegatedAccess?.grant?.id ?? null,
        delegationCapability: delegatedAccess?.grant ? "ADD_NON_EVALUATIVE_COMMENT" : null,
        action: "EVALUATION_COMMENT_CREATED",
        entityType: "EvalComment",
        entityId: comment.id,
      },
    });
    res.status(201).json(comment);
  }),
);

const updateCommentSchema = z.object({
  status: z.enum(["OPEN", "RESOLVED", "ACKNOWLEDGED"]).optional(),
  content: z.string().min(1).optional(),
});

// PATCH /api/evaluations/:evalId/comments/:commentId
commentsRouter.patch(
  "/:commentId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = updateCommentSchema.parse(req.body);
    const comment = await prisma.evalComment.findUnique({
      where: { id: req.params.commentId },
    });
    if (!comment) throw new HttpError(404, "Comment not found");
    if (comment.evaluationId !== req.params.evalId) throw new HttpError(404, "Comment not found");
    if (comment.authorId !== req.user?.id) throw new HttpError(403, "Only the comment author may update this comment.");

    const data: Record<string, unknown> = {};
    if (body.content) data.content = body.content;
    if (body.status) {
      data.status = body.status;
      if (body.status === "RESOLVED") {
        data.resolvedById = req.user?.id;
        data.resolvedAt = new Date();
      }
    }

    const updated = await prisma.evalComment.update({
      where: { id: req.params.commentId },
      data,
    });
    res.json(updated);
  }),
);

// DELETE /api/evaluations/:evalId/comments/:commentId
commentsRouter.delete(
  "/:commentId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const comment = await prisma.evalComment.findUnique({
      where: { id: req.params.commentId },
    });
    if (!comment) throw new HttpError(404, "Comment not found");
    if (comment.evaluationId !== req.params.evalId) throw new HttpError(404, "Comment not found");
    if (comment.authorId !== req.user?.id) {
      throw new HttpError(403, "Can only delete your own comments");
    }
    await prisma.evalComment.delete({ where: { id: req.params.commentId } });
    res.status(204).send();
  }),
);
