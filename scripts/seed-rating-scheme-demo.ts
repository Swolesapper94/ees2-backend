import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const unit = await prisma.unit.findUniqueOrThrow({
    where: { uic: "DEV-505" },
    select: { id: true, name: true },
  });
  const commander = await prisma.user.findUniqueOrThrow({
    where: { email: "morgan.reed@army.mil" },
    select: { id: true },
  });

  const effectiveFrom = new Date("2026-07-01T00:00:00.000Z");
  const scheme = await prisma.ratingScheme.upsert({
    where: { unitId_version: { unitId: unit.id, version: 1 } },
    update: {
      battalionId: unit.id,
      status: "PUBLISHED",
      effectiveFrom,
      effectiveTo: null,
      createdByUserId: commander.id,
      submittedByUserId: commander.id,
      submittedAt: effectiveFrom,
      approvedByUserId: commander.id,
      approvedAt: effectiveFrom,
      publishedByUserId: commander.id,
      publishedAt: effectiveFrom,
      approvalComments: "Published demo rating scheme for EES2 workflow rehearsal.",
      changeReason: "Compliant replacement demo rating scheme",
    },
    create: {
      id: "test-rating-scheme-dev-505-v1",
      unitId: unit.id,
      battalionId: unit.id,
      version: 1,
      status: "PUBLISHED",
      effectiveFrom,
      createdByUserId: commander.id,
      submittedByUserId: commander.id,
      submittedAt: effectiveFrom,
      approvedByUserId: commander.id,
      approvedAt: effectiveFrom,
      publishedByUserId: commander.id,
      publishedAt: effectiveFrom,
      approvalComments: "Published demo rating scheme for EES2 workflow rehearsal.",
      changeReason: "Compliant replacement demo rating scheme",
    },
  });

  const assignmentIds = [
    "test-assignment-davis-2026",
    "test-assignment-torres-2026",
    "dashboard-assignment-johnson-current",
  ];
  await prisma.ratingSchemeAssignment.updateMany({
    where: { id: { in: assignmentIds } },
    data: { ratingSchemeId: scheme.id, unitId: unit.id, status: "PUBLISHED" },
  });

  console.log(`Published rating scheme ${scheme.id} for ${unit.name} with ${assignmentIds.length} assignments.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
