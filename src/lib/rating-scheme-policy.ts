import { AdministrativeScopeType, RatingSchemeDelegationPermission, RatingSchemeStatus, type RatingScheme, type User } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type Actor = Pick<User, "id" | "unitId">;

export async function approvalBattalionIdForUnit(unitId: string): Promise<string> {
  const initialUnit = await prisma.unit.findUnique({ where: { id: unitId }, select: { id: true, parentId: true } });
  if (!initialUnit) throw new Error("Rating scheme unit was not found");
  let unit: { id: string; parentId: string | null } = initialUnit;
  while (unit.parentId) {
    const parent = await prisma.unit.findUnique({ where: { id: unit.parentId }, select: { id: true, parentId: true } });
    if (!parent) break;
    unit = parent;
  }
  return unit.id;
}

async function isWithinBattalion(unitId: string | null, battalionId: string) {
  if (!unitId) return false;
  return (await approvalBattalionIdForUnit(unitId)) === battalionId;
}

async function currentCommander(battalionId: string) {
  const now = new Date();
  return prisma.battalionCommandAssignment.findFirst({
    where: {
      battalionId,
      status: "ACTIVE",
      effectiveFrom: { lte: now },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
    },
    orderBy: { effectiveFrom: "desc" },
  });
}

async function activeDelegation(actor: Actor, battalionId: string, permission: RatingSchemeDelegationPermission) {
  const now = new Date();
  const command = await currentCommander(battalionId);
  if (!command || !await isWithinBattalion(actor.unitId, battalionId)) return null;
  return prisma.ratingSchemeDelegation.findFirst({
    where: {
      battalionId,
      commanderUserId: command.commanderUserId,
      delegateUserId: actor.id,
      status: "ACTIVE",
      permissions: { has: permission },
      effectiveFrom: { lte: now },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
    },
  });
}

async function hasServicingScope(actor: Actor, battalionId: string) {
  const now = new Date();
  return Boolean(await prisma.administrativeScope.findFirst({
    where: {
      administratorId: actor.id,
      unitId: battalionId,
      scopeType: AdministrativeScopeType.SERVICING_ADMINISTRATION,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
  }));
}

export async function canInspectUnitRatingScheme(actor: Actor, unitId: string) {
  if (actor.unitId === unitId || await hasServicingScope(actor, unitId)) return true;
  const battalionId = await approvalBattalionIdForUnit(unitId);
  return (await currentCommander(battalionId))?.commanderUserId === actor.id;
}

export async function canViewPublishedRatingScheme(actor: Actor, scheme: Pick<RatingScheme, "unitId">) {
  return canInspectUnitRatingScheme(actor, scheme.unitId);
}

export async function canViewDraftRatingScheme(actor: Actor, scheme: Pick<RatingScheme, "battalionId" | "unitId">) {
  const command = await currentCommander(scheme.battalionId);
  return command?.commanderUserId === actor.id || Boolean(await activeDelegation(actor, scheme.battalionId, RatingSchemeDelegationPermission.VIEW_AUDIT)) || Boolean(scheme.unitId && await hasServicingScope(actor, scheme.unitId));
}

export async function canCreateRatingSchemeDraft(actor: Actor, battalionId: string) {
  const command = await currentCommander(battalionId);
  return command?.commanderUserId === actor.id || Boolean(await activeDelegation(actor, battalionId, RatingSchemeDelegationPermission.CREATE_DRAFT));
}

export async function canEditRatingSchemeDraft(actor: Actor, scheme: Pick<RatingScheme, "battalionId" | "status">) {
  if (scheme.status !== RatingSchemeStatus.DRAFT && scheme.status !== RatingSchemeStatus.RETURNED) return false;
  const command = await currentCommander(scheme.battalionId);
  return command?.commanderUserId === actor.id || Boolean(await activeDelegation(actor, scheme.battalionId, RatingSchemeDelegationPermission.EDIT_DRAFT));
}

export async function canSubmitRatingScheme(actor: Actor, scheme: Pick<RatingScheme, "battalionId" | "status">) {
  if (scheme.status !== RatingSchemeStatus.DRAFT && scheme.status !== RatingSchemeStatus.RETURNED) return false;
  const command = await currentCommander(scheme.battalionId);
  return command?.commanderUserId === actor.id || Boolean(await activeDelegation(actor, scheme.battalionId, RatingSchemeDelegationPermission.SUBMIT_FOR_APPROVAL));
}

export async function canApproveRatingScheme(actor: Actor, scheme: Pick<RatingScheme, "battalionId" | "status">) {
  if (scheme.status !== RatingSchemeStatus.PENDING_APPROVAL) return false;
  return (await currentCommander(scheme.battalionId))?.commanderUserId === actor.id;
}

export async function canPublishRatingScheme(actor: Actor, scheme: Pick<RatingScheme, "battalionId" | "status">) {
  if (scheme.status !== RatingSchemeStatus.APPROVED) return false;
  return (await currentCommander(scheme.battalionId))?.commanderUserId === actor.id;
}

export async function canManageRatingSchemeDelegates(actor: Actor, battalionId: string) {
  return (await currentCommander(battalionId))?.commanderUserId === actor.id;
}

export async function canViewRatingSchemeAudit(actor: Actor, scheme: Pick<RatingScheme, "battalionId" | "unitId">) {
  return canViewDraftRatingScheme(actor, scheme);
}

export { currentCommander };