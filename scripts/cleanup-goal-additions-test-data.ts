import { prisma } from "@/lib/prisma";

const editGoalId = "test-goal-edit-source-2028";
const carrySourceGoalId = "test-goal-carry-source-2028";
const carryTargetFormId = "test-goal-carry-target-2028";

async function main() {
  await prisma.supportForm.deleteMany({ where: { id: carryTargetFormId } });
  await prisma.goal.deleteMany({ where: { id: { in: [editGoalId, carrySourceGoalId] } } });
  console.log("Removed disposable Goal workflow fixtures; immutable audit logs are retained.");
}

main().finally(() => prisma.$disconnect());
