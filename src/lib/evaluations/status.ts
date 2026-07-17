/**
 * Evaluation status transition (MVP audit 5.12).
 *
 * Previously `Evaluation.status` never moved off its `DRAFT` default
 * anywhere in the codebase except a single manual write to `SUBMITTED` in
 * the submit-to-hdqa route. Every real evaluation stayed "Draft" forever
 * regardless of actual section/signature progress, which silently broke
 * status display and made the submit-to-hdqa gate unreachable in practice.
 *
 * This derives status from real, canonical state (section completion +
 * signature collection) rather than trusting a field nobody writes to.
 * Call `recomputeEvalStatus()` after anything that could move the needle:
 * a section PATCH (isComplete flips) or a sign/decline action.
 */

import { prisma } from "@/lib/prisma";
import type { EvalStatus } from "@prisma/client";

const PART_IV_SECTIONS = [
  "CHARACTER",
  "PRESENCE",
  "INTELLECT",
  "LEADS",
  "DEVELOPS",
  "ACHIEVES",
];

// Terminal / HRC-managed states — once here, this function must not
// silently revert an evaluation (HRC returns/acceptance are separate,
// admin-driven actions outside this derivation).
const TERMINAL_STATUSES = new Set<EvalStatus>(["SUBMITTED", "ACCEPTED", "RETURNED"]);

/**
 * Recomputes and (if changed) persists `Evaluation.status` from current
 * section-completion + signature state. Returns the resulting status, or
 * null if the evaluation doesn't exist. Audits the transition when it
 * actually changes the stored value.
 */
export async function recomputeEvalStatus(
  evaluationId: string,
  actorId: string,
): Promise<EvalStatus | null> {
  const evaluation = await prisma.evaluation.findUnique({
    where: { id: evaluationId },
    include: { sections: true, signatures: true },
  });
  if (!evaluation) return null;
  if (TERMINAL_STATUSES.has(evaluation.status)) return evaluation.status;

  const partIV = evaluation.sections.filter((s) =>
    PART_IV_SECTIONS.includes(s.section),
  );
  const anyComplete = partIV.some((s) => s.isComplete);
  const allComplete = partIV.length > 0 && partIV.every((s) => s.isComplete);

  const sigByRole = new Map(evaluation.signatures.map((s) => [s.role, s]));
  const isSigned = (role: string) => sigByRole.get(role as never)?.status === "SIGNED";

  let next: EvalStatus;
  if (!anyComplete) {
    next = "DRAFT";
  } else if (!allComplete || !isSigned("RATER")) {
    next = "RATER_IN_PROGRESS";
  } else if (!isSigned("SENIOR_RATER")) {
    next = "PENDING_SENIOR_RATER";
  } else if (!isSigned("SOLDIER")) {
    next = "PENDING_SOLDIER_ACK";
  } else if (evaluation.requiresSupplementaryReview && !isSigned("REVIEWER")) {
    next = "PENDING_SUPPLEMENTARY_REVIEW";
  } else {
    next = "PENDING_FINAL_FORM_REVIEW";
  }

  if (next !== evaluation.status) {
    await prisma.evaluation.update({
      where: { id: evaluationId },
      data: { status: next },
    });
    await prisma.auditLog.create({
      data: {
        evaluationId,
        actorId,
        action: "EVALUATION_STATUS_CHANGED",
        entityType: "Evaluation",
        entityId: evaluationId,
        metadata: { from: evaluation.status, to: next },
      },
    });
  }

  return next;
}
