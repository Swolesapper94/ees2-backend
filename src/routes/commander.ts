import { Router } from "express";
import { prisma } from "@/lib/prisma";
import { asyncHandler, HttpError } from "@/middleware/error";
import { requireAuth } from "@/middleware/auth";

export const commanderRouter = Router();

// GET /api/commander/formation — all soldiers in unit + subordinate units
commanderRouter.get(
  "/formation",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.user) throw new HttpError(401, "Not authenticated");
    if (!req.user.roles.includes("COMMANDER")) {
      throw new HttpError(403, "Commander role required");
    }

    const commander = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { unit: { include: { children: true } } },
    });
    if (!commander?.unit) throw new HttpError(404, "Commander's unit not found");

    const unitIds = [
      commander.unitId,
      ...(commander.unit.children?.map((u: { id: string }) => u.id) ?? []),
    ].filter(Boolean) as string[];

    const soldiers = await prisma.user.findMany({
      where: {
        unitId: { in: unitIds },
        roles: { has: "SOLDIER" },
      },
      include: {
        unit: { select: { name: true } },
        ratedOnChains: {
          where: { isActive: true },
          include: {
            evaluations: {
              orderBy: { createdAt: "desc" },
              take: 1,
              include: { milestones: true },
            },
            rater: { select: { firstName: true, lastName: true, rank: true } },
            seniorRater: { select: { firstName: true, lastName: true, rank: true } },
          },
          take: 1,
        },
      },
      orderBy: [{ lastName: "asc" }],
    });

    // Compute overdue + due-soon for each soldier
    const now = new Date();
    const formation = soldiers.map((s) => {
      const chain = s.ratedOnChains[0];
      const latestEval = chain?.evaluations[0];
      const overdueMilestones =
        latestEval?.milestones.filter(
          (m: { status: string; dueDate: Date }) => m.dueDate < now && m.status !== "COMPLETE",
        ) ?? [];

      return {
        id: s.id,
        rank: s.rank,
        firstName: s.firstName,
        lastName: s.lastName,
        mos: s.mos,
        unitName: s.unit?.name,
        rater: chain?.rater,
        seniorRater: chain?.seniorRater,
        evalStatus: latestEval?.status ?? "NOT_STARTED",
        evalId: latestEval?.id ?? null,
        periodEnd: latestEval ? chain?.evaluations[0] : null,
        overdueMilestoneCount: overdueMilestones.length,
        isOverdue: overdueMilestones.length > 0,
      };
    });

    // Sort: overdue first, then by lastName
    formation.sort((a, b) => {
      if (a.isOverdue && !b.isOverdue) return -1;
      if (!a.isOverdue && b.isOverdue) return 1;
      return a.lastName.localeCompare(b.lastName);
    });

    const totalSoldiers = formation.length;
    const completeCount = formation.filter(
      (s) => s.evalStatus === "COMPLETE" || s.evalStatus === "SUBMITTED" || s.evalStatus === "ACCEPTED",
    ).length;
    const overdueCount = formation.filter((s) => s.isOverdue).length;

    res.json({
      formation,
      stats: {
        totalSoldiers,
        completeCount,
        completePercent: totalSoldiers > 0 ? Math.round((completeCount / totalSoldiers) * 100) : 0,
        overdueCount,
      },
    });
  }),
);
