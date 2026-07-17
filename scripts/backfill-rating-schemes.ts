import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const now = new Date();
  const unscopedSchemes = await prisma.ratingScheme.findMany({
    where: { unitId: null },
    include: { assignments: { where: { status: "PUBLISHED" }, select: { unitId: true, ratedSoldier: { select: { unitId: true } } } } },
  });
  for (const scheme of unscopedSchemes) {
    const unitIds = [...new Set(scheme.assignments.map((assignment) => assignment.unitId ?? assignment.ratedSoldier.unitId).filter((unitId): unitId is string => Boolean(unitId)))];
    if (unitIds.length !== 1) {
      throw new Error(`Cannot assign immediate-unit scope to scheme ${scheme.id}: it contains assignments from ${unitIds.length} units.`);
    }
    await prisma.ratingScheme.update({ where: { id: scheme.id }, data: { unitId: unitIds[0] } });
    console.log(`Assigned immediate-unit scope ${unitIds[0]} to existing scheme ${scheme.id}.`);
  }

  const activeAssignments = await prisma.ratingSchemeAssignment.findMany({
    where: {
      status: "PUBLISHED",
      ratingSchemeId: null,
      effectiveFrom: { lte: now },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
    },
    orderBy: { effectiveFrom: "asc" },
  });

  const byBattalion = new Map<string, typeof activeAssignments>();
  for (const assignment of activeAssignments) {
    const battalionId = assignment.unitId ?? (await prisma.user.findUniqueOrThrow({ where: { id: assignment.ratedSoldierId }, select: { unitId: true } })).unitId;
    if (!battalionId) continue;
    byBattalion.set(battalionId, [...(byBattalion.get(battalionId) ?? []), assignment]);
  }

  for (const [battalionId, assignments] of byBattalion) {
    const commander = await prisma.user.findFirst({ where: { unitId: battalionId, roles: { has: "COMMANDER" } }, orderBy: { createdAt: "asc" } });
    if (!commander) throw new Error(`Cannot backfill ${battalionId}: no current commander candidate is assigned to the unit.`);

    let command = await prisma.battalionCommandAssignment.findFirst({ where: { battalionId, status: "ACTIVE", effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] } });
    if (!command) command = await prisma.battalionCommandAssignment.create({ data: { battalionId, commanderUserId: commander.id, effectiveFrom: assignments[0]!.effectiveFrom } });

    const existing = await prisma.ratingScheme.findFirst({ where: { battalionId, status: "PUBLISHED", effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] } });
    const scheme = existing
      ? await prisma.ratingScheme.update({ where: { id: existing.id }, data: { unitId: battalionId } })
      : await prisma.ratingScheme.create({
      data: {
        unitId: battalionId,
        battalionId,
        version: 1,
        status: "PUBLISHED",
        effectiveFrom: assignments[0]!.effectiveFrom,
        createdByUserId: commander.id,
        approvedByUserId: commander.id,
        approvedAt: now,
        approvalAuthorityPositionId: command.id,
        approvalComments: "Historical published assignments adopted during rating-scheme migration.",
        publishedByUserId: commander.id,
        publishedAt: now,
        changeReason: "Historical rating scheme adoption",
      },
    });

    await prisma.$transaction([
      prisma.ratingSchemeAssignment.updateMany({ where: { id: { in: assignments.map((assignment) => assignment.id) } }, data: { ratingSchemeId: scheme.id } }),
      prisma.auditLog.create({ data: { actorId: commander.id, action: "RATING_SCHEME_HISTORICAL_BACKFILL", entityType: "RatingScheme", entityId: scheme.id, metadata: { assignmentIds: assignments.map((assignment) => assignment.id) } } }),
    ]);
    console.log(`Adopted ${assignments.length} published assignments into rating scheme ${scheme.id} for ${battalionId}.`);
  }
}

main().finally(() => prisma.$disconnect());