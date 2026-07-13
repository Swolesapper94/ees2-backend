import { Router } from "express";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { asyncHandler, HttpError } from "@/middleware/error";
import { requireAuth, requireRole } from "@/middleware/auth";

export const ratingChainsRouter = Router();

const createChainSchema = z.object({
  ratedSoldierId: z.string().min(1),
  raterId: z.string().min(1),
  seniorRaterId: z.string().min(1),
  reviewerId: z.string().optional(),
  effectiveDate: z.coerce.date(),
  endDate: z.coerce.date().optional(),
});

ratingChainsRouter.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.user) throw new HttpError(401, "Not authenticated");
    if (req.query.purpose === "evaluation-creation") {
      const role = req.query.role === "soldier" ? "soldier" : "rater";
      const now = new Date();
      const assignments = await prisma.ratingSchemeAssignment.findMany({
        where: {
          status: "PUBLISHED",
          effectiveFrom: { lte: now },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
          ...(req.user.roles.includes("ADMIN")
            ? {}
            : role === "soldier"
              ? { ratedSoldierId: req.user.id }
              : { raterId: req.user.id }),
        },
        include: {
          ratedSoldier: true,
          rater: true,
          seniorRater: true,
          supplementaryReviewer: true,
        },
        orderBy: { effectiveFrom: "desc" },
      });
      const chains = await prisma.ratingChain.findMany({
        where: { isActive: true },
        include: {
          ratedSoldier: true,
          rater: true,
          seniorRater: true,
          reviewer: true,
        },
      });
      const candidates = assignments.flatMap((assignment) => {
        const chain = chains.find((candidate) =>
          candidate.ratedSoldierId === assignment.ratedSoldierId &&
          candidate.raterId === assignment.raterId &&
          candidate.seniorRaterId === assignment.seniorRaterId &&
          (candidate.reviewerId ?? null) === (assignment.supplementaryReviewerId ?? null),
        );
        return chain
          ? [{
              ...chain,
              ratingSchemeAssignmentId: assignment.id,
              formCategory: assignment.formCategory,
              effectiveFrom: assignment.effectiveFrom,
              effectiveTo: assignment.effectiveTo,
            }]
          : [];
      });
      res.json(candidates);
      return;
    }

    const chains = await prisma.ratingChain.findMany({
      where: {
        isActive: true,
        ...(req.user.roles.includes("ADMIN")
          ? {}
          : { OR: [{ ratedSoldierId: req.user.id }, { raterId: req.user.id }, { seniorRaterId: req.user.id }, { reviewerId: req.user.id }] }),
      },
      include: { ratedSoldier: true, rater: true, seniorRater: true, reviewer: true },
      orderBy: { createdAt: "desc" },
    });
    res.json(chains);
  }),
);

ratingChainsRouter.post(
  "/",
  requireAuth,
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const body = createChainSchema.parse(req.body);
    const chain = await prisma.ratingChain.create({ data: body });
    res.status(201).json(chain);
  }),
);
