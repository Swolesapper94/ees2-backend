import { Router } from "express";
import { prisma } from "@/lib/prisma";
import { asyncHandler, HttpError } from "@/middleware/error";
import { requireAuth } from "@/middleware/auth";
import { resolveFormType } from "@/lib/utils/role-resolver";
import { addDays, differenceInDays, startOfMonth, subMonths, format } from "date-fns";
import type { MilestoneType } from "@prisma/client";

export const dashboardRouter = Router();

/**
 * GET /api/dashboard
 *
 * Returns everything the dashboard needs in a single round-trip:
 *   myChain     — the active chain where the current user IS the rated soldier (Zone A)
 *   myUser      — current user's basic profile
 *   soldierChains — every active chain where current user is the RATER or SENIOR_RATER (Zone B)
 *
 * The client splits these into Zone A and Zone B panels.
 */
dashboardRouter.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;

    // ── Zone A — my own chain (I am the rated soldier) ────────────
    const myChain = await prisma.ratingChain.findFirst({
      where: { ratedSoldierId: userId, isActive: true },
      include: {
        ratedSoldier: true,
        rater: true,
        seniorRater: true,
        reviewer: true,
        evaluations: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: {
            milestones: true,
            sections: { select: { isComplete: true } },
          },
        },
      },
    });

    // Active support form entry count for myself
    const myActiveSupportForm = await prisma.supportForm.findFirst({
      where: { soldierId: userId, isActive: true },
      include: { _count: { select: { entries: true } } },
    });

    // ── Zone B — soldiers I rate or senior rate ───────────────────
    const rawChains = await prisma.ratingChain.findMany({
      where: {
        isActive: true,
        OR: [{ raterId: userId }, { seniorRaterId: userId }],
      },
      include: {
        ratedSoldier: {
          include: {
            supportForms: {
              where: { isActive: true },
              take: 1,
              include: { _count: { select: { entries: true } } },
            },
          },
        },
        rater: true,
        seniorRater: true,
        evaluations: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: {
            milestones: true,
            sections: { select: { isComplete: true } },
          },
        },
      },
    });

    const soldierChains = rawChains
      .map((chain) => {
        const eval_ = chain.evaluations[0] ?? null;
        const sections = eval_?.sections ?? [];
        const completedSections = sections.filter((s) => s.isComplete).length;
        const sectionCount = sections.length;
        const sectionCompletionPercent =
          sectionCount > 0
            ? Math.round((completedSections / sectionCount) * 100)
            : 0;

        // Find the nearest incomplete milestone due date
        const now = new Date();
        const upcomingMilestones = (eval_?.milestones ?? [])
          .filter((m) => m.status !== "COMPLETE" && m.status !== "WAIVED")
          .sort(
            (a, b) =>
              new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime(),
          );
        const nearestMilestone = upcomingMilestones[0] ?? null;
        const overdueMs = nearestMilestone
          ? now.getTime() - new Date(nearestMilestone.dueDate).getTime()
          : null;
        const overdueMilestone =
          nearestMilestone && overdueMs !== null && overdueMs > 0
            ? {
                type: nearestMilestone.type,
                daysOverdue: Math.ceil(overdueMs / 86_400_000),
              }
            : null;

        return {
          chainId: chain.id,
          soldier: chain.ratedSoldier,
          myRole: chain.raterId === userId ? "RATER" : "SENIOR_RATER",
          latestEval: eval_,
          activeSupportFormEntryCount:
            chain.ratedSoldier.supportForms[0]?._count.entries ?? 0,
          sectionCompletionPercent,
          overdueMilestone,
          ...resolveFormType(chain.ratedSoldier.rank),
        };
      })
      // Sort: overdue first, then by nearest milestone due date ascending
      .sort((a, b) => {
        if (a.overdueMilestone && !b.overdueMilestone) return -1;
        if (!a.overdueMilestone && b.overdueMilestone) return 1;
        const aMilestone = a.latestEval?.milestones[0];
        const bMilestone = b.latestEval?.milestones[0];
        if (!aMilestone && !bMilestone) return 0;
        if (!aMilestone) return 1;
        if (!bMilestone) return -1;
        return (
          new Date(aMilestone.dueDate).getTime() -
          new Date(bMilestone.dueDate).getTime()
        );
      });

    res.json({
      myUser: req.user,
      myChain: myChain
        ? {
            ...myChain,
            activeSupportFormEntryCount: myActiveSupportForm?._count.entries ?? 0,
            latestEval: myChain.evaluations[0] ?? null,
            ...resolveFormType(myChain.ratedSoldier.rank),
          }
        : null,
      soldierChains,
    });
  }),
);

// ─────────────────────────────────────────────────────────────────
// ANALYTICS ENDPOINTS — Dashboard Analytics Header
// All scoped to the authenticated user's own rating activity.
// ─────────────────────────────────────────────────────────────────

const NCO_RANKS = ["SGT","SSG","SFC","MSG","FIRST_SERGEANT","SGM","CSM","SMA"];
const WO_RANKS  = ["WO1","CW2","CW3","CW4","CW5"];

function isNcoGrade(rank: string): boolean { return NCO_RANKS.includes(rank); }
function isOfficerOrWo(rank: string): boolean {
  return WO_RANKS.includes(rank) || (!isNcoGrade(rank) && !["PVT","PV2","PFC","SPC","CPL"].includes(rank));
}

// Grade sort order for display
const GRADE_SORT: Record<string, number> = {
  PVT:1, PV2:2, PFC:3, SPC:4, CPL:5,
  SGT:6, SSG:7, SFC:8, MSG:9, FIRST_SERGEANT:10, SGM:11, CSM:12, SMA:13,
  WO1:14, CW2:15, CW3:16, CW4:17, CW5:18,
  SECOND_LT:19, FIRST_LT:20, CPT:21, MAJ:22, LTC:23, COL:24,
  BG:25, MG:26, LTG:27, GEN:28, GA:29,
};

// ── GET /api/dashboard/analytics ─ KPI Strip values ──────────────
dashboardRouter.get(
  "/analytics",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const now = new Date();
    const days90 = subMonths(now, 3);
    const days180 = subMonths(now, 6);

    // ── 1. Avg HRC processing (rolling 90-day avg of accepted_at - submitted_at) ──
    const recentAccepted = await prisma.evaluation.findMany({
      where: {
        status: "ACCEPTED",
        submittedAt: { not: null, gte: days90 },
        acceptedAt: { not: null },
        ratingChain: { OR: [{ raterId: userId }, { seniorRaterId: userId }] },
      },
      select: { submittedAt: true, acceptedAt: true },
    });
    const processingDays = recentAccepted
      .filter((e) => e.submittedAt && e.acceptedAt)
      .map((e) => differenceInDays(e.acceptedAt!, e.submittedAt!));
    const avgHrcProcessing =
      processingDays.length > 0
        ? Math.round(processingDays.reduce((a, b) => a + b, 0) / processingDays.length)
        : null;

    // Prior 90-day window (90-180 days ago) for delta
    const priorAccepted = await prisma.evaluation.findMany({
      where: {
        status: "ACCEPTED",
        submittedAt: { gte: days180, lt: days90 },
        acceptedAt: { not: null },
        ratingChain: { OR: [{ raterId: userId }, { seniorRaterId: userId }] },
      },
      select: { submittedAt: true, acceptedAt: true },
    });
    const priorDays = priorAccepted
      .filter((e) => e.submittedAt && e.acceptedAt)
      .map((e) => differenceInDays(e.acceptedAt!, e.submittedAt!));
    const priorAvgHrc =
      priorDays.length > 0
        ? Math.round(priorDays.reduce((a, b) => a + b, 0) / priorDays.length)
        : null;
    const hrcProcessingDelta =
      avgHrcProcessing !== null && priorAvgHrc !== null
        ? avgHrcProcessing - priorAvgHrc
        : null;

    // ── 2. Late eval rate ─────────────────────────────────────────
    // Late = submitted after THRU + 90 days
    const allSubmitted = await prisma.evaluation.findMany({
      where: {
        status: { in: ["SUBMITTED", "ACCEPTED", "RETURNED"] },
        submittedAt: { not: null },
        ratingChain: { OR: [{ raterId: userId }, { seniorRaterId: userId }] },
      },
      select: { periodEnd: true, submittedAt: true },
    });
    const lateCount = allSubmitted.filter(
      (e) => e.submittedAt && differenceInDays(e.submittedAt, e.periodEnd) > 90,
    ).length;
    const lateEvalRate =
      allSubmitted.length > 0 ? Math.round((lateCount / allSubmitted.length) * 100) : 0;

    // ── 3. Due in 30 days ─────────────────────────────────────────
    const activeChains = await prisma.ratingChain.findMany({
      where: {
        isActive: true,
        OR: [{ raterId: userId }, { seniorRaterId: userId }],
      },
      include: {
        ratedSoldier: true,
        evaluations: {
          where: { status: { in: ["ACCEPTED", "COMPLETE"] }, reasonForSubmission: { contains: "Annual" } },
          orderBy: { periodEnd: "desc" },
          take: 1,
          select: { periodEnd: true, reasonForSubmission: true },
        },
      },
    });

    const dueIn30 = activeChains.filter((chain) => {
      const lastAnnual = chain.evaluations[0];
      const anchor = lastAnnual
        ? new Date(lastAnnual.periodEnd)
        : chain.effectiveDate;
      const nextDue = addDays(anchor, 365);
      const daysUntil = differenceInDays(nextDue, now);
      return daysUntil >= 0 && daysUntil <= 30;
    }).length;

    // ── 4. Counseling compliance ──────────────────────────────────
    const counselingTypes: MilestoneType[] = [
      "INITIAL_COUNSELING_DUE",
      "QUARTERLY_COUNSELING_1",
      "QUARTERLY_COUNSELING_2",
      "QUARTERLY_COUNSELING_3",
    ];

    const counselingMilestones = await prisma.evalMilestone.findMany({
      where: {
        type: { in: counselingTypes },
        evaluation: {
          ratingChain: { raterId: userId, isActive: true },
        },
      },
      select: { type: true, status: true },
    });

    const totalCounseling = counselingMilestones.length;
    const completeCounseling = counselingMilestones.filter(
      (m) => m.status === "COMPLETE",
    ).length;
    const overdueCounseling = counselingMilestones.filter(
      (m) => m.status === "OVERDUE",
    ).length;
    const counselingCompliancePct =
      totalCounseling > 0
        ? Math.round((completeCounseling / totalCounseling) * 100)
        : 100;

    // ── 5. HRC returns (lifetime) ─────────────────────────────────
    const returnedEvals = await prisma.evaluation.findMany({
      where: {
        returns: { some: {} },
        ratingChain: { OR: [{ raterId: userId }, { seniorRaterId: userId }] },
      },
      select: { id: true },
    });
    const totalSubmittedLifetime = await prisma.evaluation.count({
      where: {
        status: { in: ["SUBMITTED", "ACCEPTED", "RETURNED"] },
        ratingChain: { OR: [{ raterId: userId }, { seniorRaterId: userId }] },
      },
    });
    const returnCount = returnedEvals.length;
    const returnRatePct =
      totalSubmittedLifetime > 0
        ? Math.round((returnCount / totalSubmittedLifetime) * 100)
        : 0;

    // Unit-wide return rate for comparison
    const unitReturnCount = await prisma.evaluation.count({
      where: {
        returns: { some: {} },
        ratingChain: { rater: { unitId: req.user!.unitId ?? undefined } },
      },
    });
    const unitTotalSubmitted = await prisma.evaluation.count({
      where: {
        status: { in: ["SUBMITTED", "ACCEPTED", "RETURNED"] },
        ratingChain: { rater: { unitId: req.user!.unitId ?? undefined } },
      },
    });
    const unitReturnRatePct =
      unitTotalSubmitted > 0
        ? Math.round((unitReturnCount / unitTotalSubmitted) * 100)
        : 0;

    res.json({
      avgHrcProcessing,
      hrcProcessingDelta,
      lateEvalRate,
      dueIn30,
      counselingCompliancePct,
      overdueCounseling,
      returnCount,
      totalSubmitted: totalSubmittedLifetime,
      returnRatePct,
      unitReturnRatePct,
    });
  }),
);

// ── GET /api/dashboard/hrc-trend ─ 8-month rolling avg ───────────
dashboardRouter.get(
  "/hrc-trend",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const now = new Date();
    const months: { month: string; ncoeravg: number | null; oeravg: number | null }[] = [];

    for (let i = 7; i >= 0; i--) {
      const monthStart = startOfMonth(subMonths(now, i));
      const monthEnd = startOfMonth(subMonths(now, i - 1));

      const evals = await prisma.evaluation.findMany({
        where: {
          status: "ACCEPTED",
          submittedAt: { gte: monthStart, lt: monthEnd },
          acceptedAt: { not: null },
          ratingChain: { OR: [{ raterId: userId }, { seniorRaterId: userId }] },
        },
        select: { formType: true, submittedAt: true, acceptedAt: true },
      });

      const ncoerDays = evals
        .filter((e) => e.formType.startsWith("NCOER") && e.submittedAt && e.acceptedAt)
        .map((e) => differenceInDays(e.acceptedAt!, e.submittedAt!));
      const oerDays = evals
        .filter((e) => e.formType.startsWith("OER") && e.submittedAt && e.acceptedAt)
        .map((e) => differenceInDays(e.acceptedAt!, e.submittedAt!));

      months.push({
        month: format(monthStart, "MMM"),
        ncoeravg:
          ncoerDays.length > 0
            ? Math.round(ncoerDays.reduce((a, b) => a + b, 0) / ncoerDays.length)
            : null,
        oeravg:
          oerDays.length > 0
            ? Math.round(oerDays.reduce((a, b) => a + b, 0) / oerDays.length)
            : null,
      });
    }

    res.json({ months });
  }),
);

// ── GET /api/dashboard/due-windows ─ 30/60/90-day buckets ────────
dashboardRouter.get(
  "/due-windows",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const now = new Date();

    const chains = await prisma.ratingChain.findMany({
      where: {
        isActive: true,
        OR: [{ raterId: userId }, { seniorRaterId: userId }],
      },
      select: {
        id: true,
        raterId: true,
        seniorRaterId: true,
        effectiveDate: true,
        evaluations: {
          where: {
            status: { in: ["ACCEPTED", "COMPLETE"] },
            reasonForSubmission: { contains: "Annual" },
          },
          orderBy: { periodEnd: "desc" },
          take: 1,
          select: { periodEnd: true },
        },
      },
    });

    const buckets = { b30: 0, b60: 0, b90: 0, b30r: 0, b30sr: 0, b60r: 0, b60sr: 0, b90r: 0, b90sr: 0 };

    for (const chain of chains) {
      const lastAnnual = chain.evaluations[0];
      const anchor = lastAnnual ? new Date(lastAnnual.periodEnd) : chain.effectiveDate;
      const nextDue = addDays(anchor, 365);
      const daysUntil = differenceInDays(nextDue, now);
      const isRater = chain.raterId === userId;
      const isSr = chain.seniorRaterId === userId;

      if (daysUntil >= 0 && daysUntil <= 30) {
        buckets.b30++;
        if (isRater) buckets.b30r++;
        if (isSr) buckets.b30sr++;
      } else if (daysUntil > 30 && daysUntil <= 60) {
        buckets.b60++;
        if (isRater) buckets.b60r++;
        if (isSr) buckets.b60sr++;
      } else if (daysUntil > 60 && daysUntil <= 90) {
        buckets.b90++;
        if (isRater) buckets.b90r++;
        if (isSr) buckets.b90sr++;
      }
    }

    res.json({
      window30: { count: buckets.b30, asRater: buckets.b30r, asSr: buckets.b30sr },
      window60: { count: buckets.b60, asRater: buckets.b60r, asSr: buckets.b60sr },
      window90: { count: buckets.b90, asRater: buckets.b90r, asSr: buckets.b90sr },
    });
  }),
);

// ── GET /api/dashboard/chain-velocity ─ Avg days per stage ───────
dashboardRouter.get(
  "/chain-velocity",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;

    const completedEvals = await prisma.evaluation.findMany({
      where: {
        status: { in: ["COMPLETE", "SUBMITTED", "ACCEPTED"] },
        ratingChain: { OR: [{ raterId: userId }, { seniorRaterId: userId }] },
      },
      include: {
        signatures: { select: { role: true, signedAt: true } },
      },
      take: 50,
      orderBy: { updatedAt: "desc" },
    });

    const raterDays: number[] = [];
    const srDays: number[] = [];
    const ackDays: number[] = [];

    for (const ev of completedEvals) {
      const raterSig = ev.signatures.find((s) => s.role === "RATER" && s.signedAt);
      const srSig = ev.signatures.find((s) => s.role === "SENIOR_RATER" && s.signedAt);
      const soldierSig = ev.signatures.find((s) => s.role === "SOLDIER" && s.signedAt);

      if (raterSig?.signedAt) {
        raterDays.push(differenceInDays(raterSig.signedAt, ev.createdAt));
      }
      if (raterSig?.signedAt && srSig?.signedAt) {
        srDays.push(differenceInDays(srSig.signedAt, raterSig.signedAt));
      }
      if (srSig?.signedAt && soldierSig?.signedAt) {
        ackDays.push(differenceInDays(soldierSig.signedAt, srSig.signedAt));
      }
    }

    const avg = (arr: number[]) =>
      arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;

    const raterAvg = avg(raterDays);
    const srAvg = avg(srDays);
    const ackAvg = avg(ackDays);

    res.json({
      raterStageDays: raterAvg,
      srStageDays: srAvg,
      ackStageDays: ackAvg,
      sampleSize: completedEvals.length,
    });
  }),
);

// ── GET /api/dashboard/counseling ─ Milestone compliance ─────────
dashboardRouter.get(
  "/counseling",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;

    const types: MilestoneType[] = [
      "INITIAL_COUNSELING_DUE",
      "QUARTERLY_COUNSELING_1",
      "QUARTERLY_COUNSELING_2",
      "QUARTERLY_COUNSELING_3",
    ];

    const milestones = await prisma.evalMilestone.findMany({
      where: {
        type: { in: types },
        evaluation: {
          ratingChain: { raterId: userId, isActive: true },
        },
      },
      include: {
        evaluation: {
          include: {
            ratingChain: {
              include: { ratedSoldier: { select: { firstName: true, lastName: true, rank: true } } },
            },
          },
        },
      },
    });

    const byType: Record<string, { complete: number; total: number }> = {
      INITIAL_COUNSELING_DUE:   { complete: 0, total: 0 },
      QUARTERLY_COUNSELING_1:   { complete: 0, total: 0 },
      QUARTERLY_COUNSELING_2:   { complete: 0, total: 0 },
      QUARTERLY_COUNSELING_3:   { complete: 0, total: 0 },
    };

    const overdueSoldiers: { name: string; type: string }[] = [];

    for (const m of milestones) {
      const key = m.type as keyof typeof byType;
      if (byType[key]) {
        byType[key].total++;
        if (m.status === "COMPLETE") byType[key].complete++;
        if (m.status === "OVERDUE") {
          const soldier = m.evaluation.ratingChain.ratedSoldier;
          overdueSoldiers.push({
            name: `${soldier.rank} ${soldier.lastName}`,
            type: m.type,
          });
        }
      }
    }

    const total = Object.values(byType).reduce((a, v) => a + v.total, 0);
    const complete = Object.values(byType).reduce((a, v) => a + v.complete, 0);

    res.json({
      overallPct: total > 0 ? Math.round((complete / total) * 100) : 100,
      byType,
      overdueSoldiers: overdueSoldiers.slice(0, 3), // limit to first 3 for callout
    });
  }),
);

// ── GET /api/dashboard/returns ─ Return counts by reason ─────────
dashboardRouter.get(
  "/returns",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;

    const returns = await prisma.evaluationReturn.findMany({
      where: {
        evaluation: {
          ratingChain: { OR: [{ raterId: userId }, { seniorRaterId: userId }] },
        },
      },
      select: { returnReason: true, evaluationId: true },
    });

    // Count distinct evals per reason
    const byReason: Record<string, Set<string>> = {};
    for (const r of returns) {
      if (!byReason[r.returnReason]) byReason[r.returnReason] = new Set();
      byReason[r.returnReason]!.add(r.evaluationId);
    }

    const allReasons = [
      "ADMIN_ERROR",
      "PROHIBITED_LANGUAGE",
      "MISSING_SIGNATURE",
      "RATING_PERIOD_ERROR",
      "OTHER",
    ];

    const breakdown = allReasons.map((reason) => ({
      reason,
      count: byReason[reason]?.size ?? 0,
    }));

    const totalReturned = new Set(returns.map((r) => r.evaluationId)).size;

    // Total submitted for rate calculation
    const totalSubmitted = await prisma.evaluation.count({
      where: {
        status: { in: ["SUBMITTED", "ACCEPTED", "RETURNED"] },
        ratingChain: { OR: [{ raterId: userId }, { seniorRaterId: userId }] },
      },
    });

    // Unit avg
    const unitReturns = await prisma.evaluationReturn.findMany({
      where: {
        evaluation: {
          ratingChain: { rater: { unitId: req.user!.unitId ?? undefined } },
        },
      },
      select: { evaluationId: true },
    });
    const unitTotalSubmitted = await prisma.evaluation.count({
      where: {
        status: { in: ["SUBMITTED", "ACCEPTED", "RETURNED"] },
        ratingChain: { rater: { unitId: req.user!.unitId ?? undefined } },
      },
    });
    const unitReturnedCount = new Set(unitReturns.map((r) => r.evaluationId)).size;
    const unitReturnRatePct =
      unitTotalSubmitted > 0
        ? Math.round((unitReturnedCount / unitTotalSubmitted) * 100)
        : 0;

    res.json({
      totalReturned,
      totalSubmitted,
      returnRatePct:
        totalSubmitted > 0 ? Math.round((totalReturned / totalSubmitted) * 100) : 0,
      unitReturnRatePct,
      breakdown,
    });
  }),
);

// ── GET /api/dashboard/sr-profile ─ SR distribution by grade ─────
dashboardRouter.get(
  "/sr-profile",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;

    if (!req.user!.roles.includes("SENIOR_RATER")) {
      throw new HttpError(403, "SR profile is only accessible to Senior Raters");
    }

    // All evals where user is SR and at a terminal/submitted state
    const srEvals = await prisma.evaluation.findMany({
      where: {
        status: { in: ["SUBMITTED", "ACCEPTED", "COMPLETE"] },
        ratingChain: { seniorRaterId: userId },
        seniorRaterRating: { not: null },
      },
      include: {
        ratingChain: {
          include: { ratedSoldier: { select: { rank: true } } },
        },
        signatures: { select: { role: true, signedAt: true } },
      },
    });

    // Group by grade
    const gradeMap: Record<string, { MQ: number; HQ: number; Q: number; NQ: number }> = {};

    for (const ev of srEvals) {
      const grade = ev.ratingChain.ratedSoldier.rank;
      if (!gradeMap[grade]) gradeMap[grade] = { MQ: 0, HQ: 0, Q: 0, NQ: 0 };
      const r = ev.seniorRaterRating;
      if (r === "MOST_QUALIFIED")   gradeMap[grade].MQ++;
      if (r === "HIGHLY_QUALIFIED") gradeMap[grade].HQ++;
      if (r === "QUALIFIED")        gradeMap[grade].Q++;
      if (r === "NOT_QUALIFIED")    gradeMap[grade].NQ++;
    }

    // Build per-grade distribution with misfire status
    const grades = Object.entries(gradeMap)
      .sort(([a], [b]) => (GRADE_SORT[a] ?? 99) - (GRADE_SORT[b] ?? 99))
      .map(([grade, counts]) => {
        const total = counts.MQ + counts.HQ + counts.Q + counts.NQ;
        const mqPct = total > 0 ? Math.round((counts.MQ / total) * 100) : 0;
        const isNco = isNcoGrade(grade);
        const cap = isNco ? 24 : 50; // hard cap
        const recommended = isNco ? 24 : 33; // recommended cap
        const cushion = Math.max(0, recommended - mqPct);
        const misfire = mqPct > cap;
        const approaching = !misfire && mqPct > (recommended - 5);

        return {
          grade,
          isNco,
          counts,
          total,
          mqPct,
          cap,
          recommended,
          cushion,
          misfire,
          approaching,
          newProfile: total < 3,
        };
      });

    // Lifetime summary stats
    const totalRendered = srEvals.length;
    const onTime = srEvals.filter((ev) => {
      const srSig = ev.signatures.find((s) => s.role === "SENIOR_RATER" && s.signedAt);
      if (!srSig?.signedAt) return false;
      return differenceInDays(srSig.signedAt, ev.periodEnd) <= 90;
    }).length;

    // Count misfire events = grades where mqPct > cap
    const misfireCount = grades.filter((g) => g.misfire).length;

    res.json({
      grades,
      totalRendered,
      onTime,
      onTimePct: totalRendered > 0 ? Math.round((onTime / totalRendered) * 100) : 100,
      misfireCount,
    });
  }),
);
