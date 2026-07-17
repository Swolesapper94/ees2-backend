import { prisma } from "@/lib/prisma";

const sourceFormId = "test-sf-davis-1783951336663";
const editGoalId = "test-goal-edit-source-2028";
const carrySourceGoalId = "test-goal-carry-source-2028";
const carryTargetFormId = "test-goal-carry-target-2028";

async function main() {
  const sourceForm = await prisma.supportForm.findUniqueOrThrow({
    where: { id: sourceFormId },
    include: { ratingChain: true },
  });
  if (!sourceForm.ratingChainId || !sourceForm.ratingChain) throw new Error("Davis source support form lacks a rating chain.");

  const targetForm = await prisma.supportForm.upsert({
    where: { id: carryTargetFormId },
    update: { isActive: true, disposition: "ACTIVE", status: "DRAFT" },
    create: {
      id: carryTargetFormId,
      soldierId: sourceForm.soldierId,
      ratingChainId: sourceForm.ratingChainId,
      ratingSchemeAssignmentId: sourceForm.ratingSchemeAssignmentId,
      evalCategory: sourceForm.evalCategory,
      ratingPeriodStart: new Date("2028-07-01T00:00:00.000Z"),
      ratingPeriodEnd: new Date("2029-06-30T00:00:00.000Z"),
      dutyTitle: sourceForm.dutyTitle,
      dutyMosc: sourceForm.dutyMosc,
      dailyDutiesScope: sourceForm.dailyDutiesScope,
      status: "DRAFT",
      initiatedByUserId: sourceForm.soldierId,
    },
  });

  await prisma.goal.upsert({
    where: { id: editGoalId },
    update: {
      supportFormId: sourceForm.id,
      sectionKey: "LEADS",
      title: "Fixture draft goal for correction-loop validation",
      description: "A disposable Soldier-authored goal used only to validate the edit and resubmission controls.",
      category: "PERSONAL_DEVELOPMENT",
      targetDate: new Date("2028-08-15T00:00:00.000Z"),
      createdById: sourceForm.soldierId,
      createdByRole: "RATED_SOLDIER",
      approvalStatus: "DRAFT",
      approvedByRaterId: null,
      approvedAt: null,
      revisionNote: null,
    },
    create: {
      id: editGoalId,
      supportFormId: sourceForm.id,
      sectionKey: "LEADS",
      title: "Fixture draft goal for correction-loop validation",
      description: "A disposable Soldier-authored goal used only to validate the edit and resubmission controls.",
      category: "PERSONAL_DEVELOPMENT",
      targetDate: new Date("2028-08-15T00:00:00.000Z"),
      createdById: sourceForm.soldierId,
      createdByRole: "RATED_SOLDIER",
    },
  });

  await prisma.goal.upsert({
    where: { id: carrySourceGoalId },
    update: {
      supportFormId: sourceForm.id,
      sectionKey: "LEADS",
      title: "Fixture in-progress goal for carry-forward validation",
      description: "A disposable approved goal used only to validate carry-forward lineage.",
      category: "ROUTINE",
      targetDate: new Date("2028-07-15T00:00:00.000Z"),
      createdById: sourceForm.soldierId,
      createdByRole: "RATED_SOLDIER",
      approvalStatus: "APPROVED",
      approvedByRaterId: sourceForm.ratingChain.raterId,
      approvedAt: new Date("2028-07-01T00:00:00.000Z"),
      raterAssessment: "IN_PROGRESS",
      raterAssessmentById: sourceForm.ratingChain.raterId,
      raterAssessmentAt: new Date("2028-07-01T00:00:00.000Z"),
    },
    create: {
      id: carrySourceGoalId,
      supportFormId: sourceForm.id,
      sectionKey: "LEADS",
      title: "Fixture in-progress goal for carry-forward validation",
      description: "A disposable approved goal used only to validate carry-forward lineage.",
      category: "ROUTINE",
      targetDate: new Date("2028-07-15T00:00:00.000Z"),
      createdById: sourceForm.soldierId,
      createdByRole: "RATED_SOLDIER",
      approvalStatus: "APPROVED",
      approvedByRaterId: sourceForm.ratingChain.raterId,
      approvedAt: new Date("2028-07-01T00:00:00.000Z"),
      raterAssessment: "IN_PROGRESS",
      raterAssessmentById: sourceForm.ratingChain.raterId,
      raterAssessmentAt: new Date("2028-07-01T00:00:00.000Z"),
    },
  });

  console.log(JSON.stringify({ sourceFormId: sourceForm.id, targetFormId: targetForm.id, editGoalId, carrySourceGoalId }));
}

main().finally(() => prisma.$disconnect());
