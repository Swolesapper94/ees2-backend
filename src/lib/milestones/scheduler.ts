import { prisma } from "@/lib/prisma";
import { Notifications } from "@/lib/notifications/create";
import { differenceInDays } from "date-fns";
import type { MilestoneType } from "@prisma/client";

// Who gets nudged for each milestone type. Counseling + rater-section
// milestones fall to the RATER (they conduct counseling and own Part IV);
// the SR-section milestone falls to the SENIOR_RATER; the ack milestone
// falls to the rated SOLDIER. EVAL_SUBMISSION_DUE is a simplification —
// nudging the rater to chase it down, since admin/HRC submission has no
// dedicated owner field on the chain.
const RESPONSIBLE_ROLE: Record<MilestoneType, "RATER" | "SENIOR_RATER" | "SOLDIER"> = {
  INITIAL_COUNSELING_DUE: "RATER",
  QUARTERLY_COUNSELING_1: "RATER",
  QUARTERLY_COUNSELING_2: "RATER",
  QUARTERLY_COUNSELING_3: "RATER",
  RATER_SECTION_DUE: "RATER",
  SENIOR_RATER_DUE: "SENIOR_RATER",
  SOLDIER_ACK_DUE: "SOLDIER",
  EVAL_SUBMISSION_DUE: "RATER",
};

// Only nudge for evaluations still actively moving through the workflow —
// SUBMITTED/ACCEPTED/RETURNED are excluded so a long-finished or archived
// evaluation's stale milestone rows never generate noise.
const ACTIVE_STATUSES = [
  "DRAFT",
  "RATER_IN_PROGRESS",
  "PENDING_SENIOR_RATER",
  "PENDING_SOLDIER_ACK",
  "PENDING_SUPPLEMENTARY_REVIEW",
  "COMPLETE",
] as const;

// Don't re-notify the same milestone more than once per day even if the
// sweep runs more often than that.
const RENOTIFY_INTERVAL_HOURS = 24;

/**
 * Scans for milestones that are past due and not yet COMPLETE/WAIVED, flips
 * their status to OVERDUE, and sends a proactive nudge to whoever is
 * responsible — at most once per RENOTIFY_INTERVAL_HOURS per milestone.
 *
 * Closes a real gap: `Notifications.milestoneOverdue()` already existed,
 * but the only caller anywhere in the codebase was a manual dev-test route
 * (`routes/dev.ts`) — nothing scanned for overdue milestones automatically.
 * Intended to run on an interval (see index.ts), not just reactively.
 */
export async function runMilestoneNudgeSweep(): Promise<{ scanned: number; notified: number }> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - RENOTIFY_INTERVAL_HOURS * 60 * 60 * 1000);

  const candidates = await prisma.evalMilestone.findMany({
    where: {
      dueDate: { lt: now },
      status: { notIn: ["COMPLETE", "WAIVED"] },
      OR: [{ notifiedAt: null }, { notifiedAt: { lt: cutoff } }],
      evaluation: { status: { in: [...ACTIVE_STATUSES] } },
    },
    include: {
      evaluation: {
        include: {
          ratingChain: {
            include: { ratedSoldier: true, rater: true, seniorRater: true },
          },
        },
      },
    },
  });

  let notified = 0;
  for (const m of candidates) {
    const chain = m.evaluation.ratingChain;
    const role = RESPONSIBLE_ROLE[m.type];
    const recipient =
      role === "RATER" ? chain.rater : role === "SENIOR_RATER" ? chain.seniorRater : chain.ratedSoldier;
    if (!recipient) continue;

    const daysOverdue = Math.max(1, differenceInDays(now, m.dueDate));
    const soldierName = `${chain.ratedSoldier.rank} ${chain.ratedSoldier.lastName}`;

    await Notifications.milestoneOverdue(recipient.id, m.evaluationId, soldierName, m.type, daysOverdue);

    await prisma.evalMilestone.update({
      where: { id: m.id },
      data: { status: "OVERDUE", notifiedAt: now },
    });
    notified++;
  }

  return { scanned: candidates.length, notified };
}
