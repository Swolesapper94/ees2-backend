import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const objectives = await prisma.supportFormEntry.findMany({
    where: { entryType: "OBJECTIVE" },
    include: { supportForm: true },
    orderBy: { createdAt: "asc" },
  });

  let created = 0;
  for (const objective of objectives) {
    const existing = await prisma.goal.findFirst({
      where: { supportFormId: objective.supportFormId, description: objective.rawText, sectionKey: objective.section },
      select: { id: true },
    });
    if (existing) continue;
    await prisma.goal.create({
      data: {
        supportFormId: objective.supportFormId,
        sectionKey: objective.section,
        title: objective.rawText.slice(0, 120),
        description: objective.rawText,
        createdById: objective.createdByUserId ?? objective.supportForm.soldierId,
        createdByRole: objective.authorRoleAtCreation ?? "RATED_SOLDIER",
        approvalStatus: "APPROVED",
        approvedAt: objective.confirmedAt ?? objective.createdAt,
        approvedByRaterId: objective.confirmedById ?? null,
        soldierAssessment: null,
        raterAssessment: null,
      },
    });
    created++;
  }
  console.log(`Migrated ${created} legacy objective entries into approved Goals; ${objectives.length - created} were already represented.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
