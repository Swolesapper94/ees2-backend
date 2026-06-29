import { Router } from "express";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { asyncHandler, HttpError } from "@/middleware/error";
import { requireAuth } from "@/middleware/auth";

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
    const milestone = await prisma.evalMilestone.findUnique({
      where: { id: req.params.id },
    });
    if (!milestone) throw new HttpError(404, "Milestone not found");

    const updated = await prisma.evalMilestone.update({
      where: { id: req.params.id },
      data: {
        status: "COMPLETE",
        completedAt: new Date(),
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
    const { reason } = waiveSchema.parse(req.body);
    const milestone = await prisma.evalMilestone.findUnique({
      where: { id: req.params.id },
    });
    if (!milestone) throw new HttpError(404, "Milestone not found");

    const updated = await prisma.evalMilestone.update({
      where: { id: req.params.id },
      data: {
        status: "WAIVED",
        waivedAt: new Date(),
        waivedById: req.user?.id,
        waivedReason: reason,
      },
    });
    res.json(updated);
  }),
);
