import { Router } from "express";
import { prisma } from "@/lib/prisma";
import { asyncHandler, HttpError } from "@/middleware/error";
import { requireAuth } from "@/middleware/auth";
import { differenceInDays } from "date-fns";

export const analyticsRouter = Router();

// GET /api/analytics — processing delay metrics
analyticsRouter.get(
  "/",
  requireAuth,
  asyncHandler(async (_req, res) => {
    const evals = await prisma.evaluation.findMany({
      include: {
        milestones: true,
        signatures: true,
        ratingChain: { include: { ratedSoldier: { include: { unit: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    const now = new Date();

    // Stage metrics — avg days to complete each stage
    const stageGroups: Record<string, number[]> = {
      rater: [],
      senior_rater: [],
      soldier_ack: [],
    };

    for (const ev of evals) {
      const sigs = ev.signatures;
      const raterSig = sigs.find((s) => s.role === "RATER" && s.signedAt);
      const srSig = sigs.find((s) => s.role === "SENIOR_RATER" && s.signedAt);
      const soldierSig = sigs.find((s) => s.role === "SOLDIER" && s.signedAt);

      if (raterSig?.signedAt) {
        stageGroups.rater.push(differenceInDays(raterSig.signedAt, ev.createdAt));
      }
      if (raterSig?.signedAt && srSig?.signedAt) {
        stageGroups.senior_rater.push(differenceInDays(srSig.signedAt, raterSig.signedAt));
      }
      if (srSig?.signedAt && soldierSig?.signedAt) {
        stageGroups.soldier_ack.push(differenceInDays(soldierSig.signedAt, srSig.signedAt));
      }
    }

    const avg = (arr: number[]) =>
      arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;

    const stageMetrics = [
      { stage: "Rater Section", avgDaysToComplete: avg(stageGroups.rater) },
      { stage: "Senior Rater Section", avgDaysToComplete: avg(stageGroups.senior_rater) },
      { stage: "Soldier Acknowledgment", avgDaysToComplete: avg(stageGroups.soldier_ack) },
    ];

    // Overdue milestones by eval
    const overdueMilestones = await prisma.evalMilestone.count({
      where: { dueDate: { lt: now }, status: { not: "COMPLETE" } },
    });

    // Evals at risk — milestones due in next 7 days
    const evalsAtRisk = await prisma.evalMilestone.findMany({
      where: {
        dueDate: { gte: now, lte: new Date(now.getTime() + 7 * 86400000) },
        status: { in: ["UPCOMING", "DUE_SOON"] },
      },
      include: {
        evaluation: {
          include: {
            ratingChain: { include: { ratedSoldier: true } },
          },
        },
      },
      orderBy: { dueDate: "asc" },
    });

    // Counseling compliance
    const counselingSessions = await prisma.counselingSession.findMany({
      where: { type: "INITIAL" },
    });
    const totalChains = await prisma.ratingChain.count({ where: { isActive: true } });
    const counselingRate = totalChains > 0
      ? Math.round((counselingSessions.length / totalChains) * 100)
      : 0;

    // Bottleneck — where are most evals stuck?
    const statusCounts = await prisma.evaluation.groupBy({
      by: ["status"],
      _count: { status: true },
    });

    res.json({
      stageMetrics,
      overdueMilestones,
      evalsAtRisk: evalsAtRisk.slice(0, 10),
      counselingCompliancePercent: counselingRate,
      statusCounts: statusCounts.map((s) => ({ status: s.status, count: s._count.status })),
      totalEvals: evals.length,
    });
  }),
);
