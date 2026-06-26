import { Router } from "express";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { asyncHandler } from "@/middleware/error";
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
  asyncHandler(async (_req, res) => {
    const chains = await prisma.ratingChain.findMany({
      include: {
        ratedSoldier: true,
        rater: true,
        seniorRater: true,
        reviewer: true,
      },
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
