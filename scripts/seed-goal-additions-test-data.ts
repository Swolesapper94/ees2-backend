import { prisma } from "@/lib/prisma";

async function main() {
  const sourceForm = await prisma.supportForm.findFirstOrThrow({
    where: { soldier: { email: "james.davis@army.mil" }, isActive: true, disposition: "ACTIVE" },
    include: { ratingChain: true },
    orderBy: { createdAt: "desc" },
  });
  if (!sourceForm.ratingChainId || !sourceForm.ratingChain) throw new Error("Davis source support form lacks a rating chain.");

  const targetForm = await prisma.supportForm.upsert({
    where: { id: "test-goal-carry-target-2028" },
    update: { isActive: true, disposition: "ACTIVE", status: "DRAFT" },
    create: {
      id: "test-goal-carry-target-2028",
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

  const sourceGoal = await prisma.goal.findFirstOrThrow({
    where: { supportFormId: sourceForm.id, raterAssessment: { in: ["IN_PROGRESS", "NOT_ACHIEVED", "PARTIALLY_ACHIEVED"] } },
    orderBy: { updatedAt: "desc" },
  });
  await prisma.goal.update({ where: { id: sourceGoal.id }, data: { targetDate: new Date(Date.now() + 7 * 86_400_000), raterAssessment: null } });

  console.log(JSON.stringify({ sourceFormId: sourceForm.id, targetFormId: targetForm.id, sourceGoalId: sourceGoal.id }));
}

main().finally(() => prisma.$disconnect());
