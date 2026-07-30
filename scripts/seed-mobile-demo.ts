import { prisma } from "@/lib/prisma";

const formId = "dev-sf-davis-mobile-2026";
const assignmentId = "demo-assignment-davis-2026";
const periodStart = new Date("2026-03-01T00:00:00Z");
const periodEnd = new Date("2027-02-28T23:59:59Z");

async function main() {
  const [davis, johnson, chain, assignment] = await Promise.all([
    prisma.user.findUnique({ where: { email: "james.davis@army.mil" } }),
    prisma.user.findUnique({ where: { email: "marcus.johnson@army.mil" } }),
    prisma.ratingChain.findUnique({ where: { id: "dev-chain-davis" } }),
    prisma.ratingSchemeAssignment.findUnique({ where: { id: assignmentId } }),
  ]);
  if (!davis || !johnson || !chain || !assignment || assignment.status !== "PUBLISHED") {
    throw new Error("Seed the core Davis/Johnson demo identities and published assignment first.");
  }

  const form = await prisma.supportForm.upsert({
    where: { id: formId },
    update: { ratingChainId: chain.id, ratingSchemeAssignmentId: assignment.id, ratingPeriodStart: periodStart, ratingPeriodEnd: periodEnd, status: "ACTIVE", isActive: true },
    create: { id: formId, soldierId: davis.id, ratingChainId: chain.id, ratingSchemeAssignmentId: assignment.id, evalCategory: "NCOER", ratingPeriodStart: periodStart, ratingPeriodEnd: periodEnd, dutyTitle: "Team Leader", dutyMosc: "11B2O", dailyDutiesScope: "Leads a four-Soldier fire team and maintains personnel, training, and equipment readiness.", areasOfEmphasis: "Small-unit readiness, accountability, and leader development.", appointedDuties: "Team equipment custodian", ssdNcoesMet: true, status: "ACTIVE", initiatedByUserId: davis.id },
  });

  await Promise.all([
    prisma.goal.upsert({
      where: { id: "dev-goal-davis-mobile-leads" },
      update: { supportFormId: form.id },
      create: { id: "dev-goal-davis-mobile-leads", supportFormId: form.id, sectionKey: "LEADS", title: "Build a disciplined, ready team", description: "Lead a four-Soldier team that meets readiness and accountability requirements.", category: "ROUTINE", targetDate: periodEnd, createdById: davis.id, createdByRole: "RATED_SOLDIER", approvalStatus: "APPROVED", approvedByRaterId: johnson.id, approvedAt: periodStart },
    }),
    prisma.goal.upsert({
      where: { id: "dev-goal-davis-mobile-develops" },
      update: { supportFormId: form.id },
      create: { id: "dev-goal-davis-mobile-develops", supportFormId: form.id, sectionKey: "DEVELOPS", title: "Develop junior Soldiers", description: "Coach junior Soldiers so they can assume greater responsibility.", category: "PERSONAL_DEVELOPMENT", targetDate: periodEnd, createdById: davis.id, createdByRole: "RATED_SOLDIER", approvalStatus: "APPROVED", approvedByRaterId: johnson.id, approvedAt: periodStart },
    }),
  ]);

  console.log(`Mobile demo support form ready: ${form.id}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());