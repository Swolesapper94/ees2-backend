import { PrismaClient } from "@prisma/client";
import { categoryForRank, validateRatingOfficialEligibility } from "../src/lib/rating-chain-validation";

const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");

async function main() {
  const [evaluations, legacySupportForms] = await Promise.all([
    prisma.evaluation.findMany({
    where: { disposition: "ACTIVE" },
    include: {
      ratingSnapshot: true,
      supportForm: true,
      ratingChain: { include: { ratedSoldier: true, rater: true, seniorRater: true } },
    },
    }),
    prisma.supportForm.findMany({
      where: { ratingSchemeAssignmentId: null, disposition: "ACTIVE" },
      select: { id: true },
    }),
  ]);

  const candidates = evaluations.filter((evaluation) => {
    const formType = evaluation.formType.startsWith("NCOER") ? "NCOER" : "OER";
    const eligibility = validateRatingOfficialEligibility({
      ratedPerson: {
        rank: evaluation.ratingChain.ratedSoldier.rank,
        category: evaluation.ratingChain.ratedSoldier.category ?? categoryForRank(evaluation.ratingChain.ratedSoldier.rank),
      },
      rater: {
        rank: evaluation.ratingChain.rater.rank,
        category: evaluation.ratingChain.rater.category ?? categoryForRank(evaluation.ratingChain.rater.rank),
      },
      seniorRater: {
        rank: evaluation.ratingChain.seniorRater.rank,
        category: evaluation.ratingChain.seniorRater.category ?? categoryForRank(evaluation.ratingChain.seniorRater.rank),
      },
      formType,
    });
    return !evaluation.ratingSnapshot || !eligibility.valid;
  });

  const supportFormUse = new Map<string, number>();
  for (const evaluation of evaluations) {
    if (evaluation.supportFormId) {
      supportFormUse.set(evaluation.supportFormId, (supportFormUse.get(evaluation.supportFormId) ?? 0) + 1);
    }
  }
  const evaluationIds = candidates.map((evaluation) => evaluation.id);
  const supportFormIds = [...new Set([
    ...legacySupportForms.map((supportForm) => supportForm.id),
    ...candidates.flatMap((evaluation) => evaluation.supportFormId ? [evaluation.supportFormId] : []),
  ])];

  console.table(candidates.map((evaluation) => ({
    evaluationId: evaluation.id,
    status: evaluation.status,
    reason: !evaluation.ratingSnapshot ? "MISSING_RATING_SNAPSHOT" : "INELIGIBLE_LEGACY_CHAIN",
    supportFormId: evaluation.supportFormId ?? "none",
    duplicateSupportForm: evaluation.supportFormId ? (supportFormUse.get(evaluation.supportFormId) ?? 0) > 1 : false,
  })));
  console.log(`Found ${evaluationIds.length} evaluation and ${supportFormIds.length} support-form quarantine candidates.`);

  if (!apply) {
    console.log("Dry run only. Re-run with --apply to mark candidates QUARANTINED without deleting data.");
    return;
  }

  const remediationActor = await prisma.user.findFirst({
    where: { OR: [{ roles: { has: "ADMIN" } }, { roles: { has: "COMMANDER" } }] },
    select: { id: true },
  });
  if (!remediationActor) throw new Error("No admin or commander exists to attribute the quarantine audit events.");

  await prisma.$transaction(async (tx) => {
    await tx.evaluation.updateMany({ where: { id: { in: evaluationIds } }, data: { disposition: "QUARANTINED" } });
    await tx.supportForm.updateMany({ where: { id: { in: supportFormIds } }, data: { disposition: "QUARANTINED", status: "QUARANTINED", isActive: false } });
    await tx.auditLog.createMany({
      data: evaluationIds.map((evaluationId) => ({
        evaluationId,
        actorId: remediationActor.id,
        action: "LEGACY_RECORD_QUARANTINED",
        entityType: "Evaluation",
        entityId: evaluationId,
        metadata: { source: "scripts/quarantine-legacy-records.ts" },
      })),
    });
  });
  console.log(`Quarantined ${evaluationIds.length} evaluations and ${supportFormIds.length} support forms.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());