import { addDays } from "date-fns";
import type { MilestoneType } from "@prisma/client";

// ─────────────────────────────────────────────────────────────────
// Milestone Auto-Generation (Delta Section 4)
// AR 623-3 counseling cadence + section due dates relative to the
// rating period. Called inside the eval creation flow immediately after
// the Evaluation row is created.
// ─────────────────────────────────────────────────────────────────

export interface GeneratedMilestone {
  evaluationId: string;
  type: MilestoneType;
  dueDate: Date;
}

/**
 * Produces the standard set of eight milestones for an evaluation, with
 * due dates derived from the rating period. The result is ready to pass
 * straight to `prisma.evalMilestone.createMany({ data })`.
 */
export function generateMilestones(
  evaluationId: string,
  periodStart: Date,
  periodEnd: Date
): GeneratedMilestone[] {
  return [
    { evaluationId, type: "INITIAL_COUNSELING_DUE", dueDate: addDays(periodStart, 30) },
    { evaluationId, type: "QUARTERLY_COUNSELING_1", dueDate: addDays(periodStart, 90) },
    { evaluationId, type: "QUARTERLY_COUNSELING_2", dueDate: addDays(periodStart, 180) },
    { evaluationId, type: "QUARTERLY_COUNSELING_3", dueDate: addDays(periodStart, 270) },
    { evaluationId, type: "RATER_SECTION_DUE", dueDate: addDays(periodEnd, -14) },
    { evaluationId, type: "SENIOR_RATER_DUE", dueDate: addDays(periodEnd, -7) },
    { evaluationId, type: "SOLDIER_ACK_DUE", dueDate: addDays(periodEnd, -3) },
    { evaluationId, type: "EVAL_SUBMISSION_DUE", dueDate: periodEnd },
  ];
}
