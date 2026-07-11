import { Router } from "express";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { asyncHandler, HttpError } from "@/middleware/error";
import { requireAuth } from "@/middleware/auth";
import { requireEvalChainRole } from "@/lib/utils/chain-auth";

export const milestonesRouter = Router();

// GET /api/milestones?evaluationId=xxx
milestonesRouter.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { evaluationId } = req.query;
    const where = evaluationId ? { evaluationId: String(evaluationId) } : {};
    const milestones = await prisma.evalMilestone.findMany({
      where,
      orderBy: { dueDate: "asc" },
    });
    res.json(milestones);
  }),
);

// PATCH /api/milestones/:id/complete
milestonesRouter.patch(
  "/:id/complete",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.user) throw new HttpError(401, "Not authenticated");
    const milestone = await prisma.evalMilestone.findUnique({
      where: { id: req.params.id },
    });
    if (!milestone) throw new HttpError(404, "Milestone not found");

    // Only the rating chain's rater/senior rater/reviewer (or an ADMIN) may
    // mark a milestone complete — previously any authenticated user could
    // complete any milestone on any evaluation (MVP audit 5.11).
    await requireEvalChainRole(milestone.evaluationId, req.user, [
      "RATER",
      "SENIOR_RATER",
      "REVIEWER",
    ]);

    const updated = await prisma.evalMilestone.update({
      where: { id: req.params.id },
      data: {
        status: "COMPLETE",
        completedAt: new Date(),
      },
    });

    await prisma.auditLog.create({
      data: {
        evaluationId: milestone.evaluationId,
        actorId: req.user.id,
        action: "MILESTONE_COMPLETED",
        entityType: "EvalMilestone",
        entityId: milestone.id,
        metadata: { type: milestone.type },
      },
    });

    res.json(updated);
  }),
);

// PATCH /api/milestones/:id/waive
const waiveSchema = z.object({ reason: z.string().min(1) });

milestonesRouter.patch(
  "/:id/waive",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.user) throw new HttpError(401, "Not authenticated");
    const { reason } = waiveSchema.parse(req.body);
    const milestone = await prisma.evalMilestone.findUnique({
      where: { id: req.params.id },
    });
    if (!milestone) throw new HttpError(404, "Milestone not found");

    await requireEvalChainRole(milestone.evaluationId, req.user, [
      "RATER",
      "SENIOR_RATER",
      "REVIEWER",
    ]);

    const updated = await prisma.evalMilestone.update({
      where: { id: req.params.id },
      data: {
        status: "WAIVED",
        waivedAt: new Date(),
        waivedById: req.user.id,
        waivedReason: reason,
      },
    });

    await prisma.auditLog.create({
      data: {
        evaluationId: milestone.evaluationId,
        actorId: req.user.id,
        action: "MILESTONE_WAIVED",
        entityType: "EvalMilestone",
        entityId: milestone.id,
        metadata: { type: milestone.type, reason },
      },
    });

    res.json(updated);
  }),
);
