import { prisma } from "@/lib/prisma";

async function main() {
  await prisma.supportForm.update({
    where: { id: "test-goal-carry-target-2028" },
    data: { isActive: false, status: "ARCHIVED", disposition: "ARCHIVED" },
  });
  console.log("Archived temporary goal carry-forward support form.");
}

main().finally(() => prisma.$disconnect());
