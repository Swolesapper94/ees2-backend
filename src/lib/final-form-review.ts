import crypto from "crypto";
import { prisma } from "@/lib/prisma";

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`).join(",")}}`;
}

export async function loadFinalFormReviewData(evaluationId: string) {
  return prisma.evaluation.findUnique({
    where: { id: evaluationId },
    include: {
      sections: true,
      ratingSnapshot: true,
      ratingChain: {
        include: { ratedSoldier: { include: { unit: true } }, rater: true, seniorRater: true, reviewer: true },
      },
    },
  });
}

export async function computeFinalFormContentHash(evaluationId: string): Promise<string> {
  const evaluation = await loadFinalFormReviewData(evaluationId);
  if (!evaluation) throw new Error("Evaluation not found for final-form review.");
  const rated = evaluation.ratingChain.ratedSoldier;
  const sections = [...evaluation.sections]
    .sort((left, right) => left.section.localeCompare(right.section))
    .map((section) => ({
      section: section.section,
      ratingBinary: section.ratingBinary,
      ratingFourLevel: section.ratingFourLevel,
      finalBullets: [...section.finalBullets],
    }));
  const payload = {
    formType: evaluation.formType,
    periodStart: evaluation.periodStart.toISOString(),
    periodEnd: evaluation.periodEnd.toISOString(),
    ratedMonths: evaluation.ratedMonths,
    nonRatedMonths: evaluation.nonRatedMonths,
    nonRatedCodes: evaluation.nonRatedCodes,
    reasonForSubmission: evaluation.reasonForSubmission,
    statusCode: evaluation.statusCode,
    numberOfEnclosures: evaluation.numberOfEnclosures,
    principalDutyTitle: evaluation.principalDutyTitle,
    dutyMosc: evaluation.dutyMosc,
    dailyDutiesScope: evaluation.dailyDutiesScope,
    areasOfSpecialEmphasis: evaluation.areasOfSpecialEmphasis,
    appointedDuties: evaluation.appointedDuties,
    seniorRaterRating: evaluation.seniorRaterRating,
    successiveAssignment1: evaluation.successiveAssignment1,
    successiveAssignment2: evaluation.successiveAssignment2,
    broadeningAssignment: evaluation.broadeningAssignment,
    rated: { rank: rated.rank, name: `${rated.lastName}, ${rated.firstName}`, mos: rated.mos, unit: rated.unit?.name ?? "" },
    rater: { rank: evaluation.ratingChain.rater.rank, name: `${evaluation.ratingChain.rater.lastName}, ${evaluation.ratingChain.rater.firstName}` },
    seniorRater: { rank: evaluation.ratingChain.seniorRater.rank, name: `${evaluation.ratingChain.seniorRater.lastName}, ${evaluation.ratingChain.seniorRater.firstName}` },
    snapshot: evaluation.ratingSnapshot ? {
      ratedRank: evaluation.ratingSnapshot.ratedRank,
      raterRank: evaluation.ratingSnapshot.raterRank,
      seniorRaterRank: evaluation.ratingSnapshot.seniorRaterRank,
      supplementaryReviewerId: evaluation.ratingSnapshot.supplementaryReviewerId,
      formCategory: evaluation.ratingSnapshot.formCategory,
    } : null,
    sections,
  };
  return crypto.createHash("sha256").update(canonicalize(payload), "utf8").digest("hex");
}

export function finalReviewRatedSoldierId(evaluation: NonNullable<Awaited<ReturnType<typeof loadFinalFormReviewData>>>) {
  return evaluation.ratingSnapshot?.ratedSoldierId ?? evaluation.ratingChain.ratedSoldierId;
}

export async function invalidateFinalFormReviews(evaluationId: string, actorId: string) {
  const invalidated = await prisma.finalFormReview.updateMany({
    where: { evaluationId, outcome: "CONFIRMED", supersededAt: null },
    data: { supersededAt: new Date() },
  });
  if (invalidated.count > 0) {
    await prisma.evaluation.update({ where: { id: evaluationId }, data: { status: "PENDING_FINAL_FORM_REVIEW" } });
    await prisma.auditLog.create({ data: { evaluationId, actorId, action: "FINAL_FORM_REVIEW_SUPERSEDED", entityType: "FinalFormReview", entityId: evaluationId, metadata: { reason: "FORM_CONTENT_CHANGED" } } });
  }
  return invalidated.count;
}