import { Router } from "express";
import { AccessReviewStatus, AdministrativeScopeType, ApplicationSupportRole, IdentityExceptionStatus, IdentitySourceSystem, IdentitySyncStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { asyncHandler, HttpError } from "@/middleware/error";
import { administrativeScopeUnitIds, requireApplicationAdministrator, requireAuth } from "@/middleware/auth";
import { isProd } from "@/config/env";

export const identityAccessRouter = Router();

const recordSelect = {
  id: true,
  supabaseId: true,
  email: true,
  firstName: true,
  lastName: true,
  rank: true,
  mos: true,
  unitId: true,
  dodid: true,
  profilePictureUrl: true,
  lastLoginAt: true,
  applicationAccessStatus: true,
  accessReviewStatus: true,
  applicationSupportRole: true,
  suspensionReason: true,
  suspendedAt: true,
  breakGlassEligible: true,
  temporaryAdminExpiresAt: true,
  unit: { select: { id: true, name: true, uic: true } },
  identitySourceRecord: true,
  identityExceptions: { where: { status: { in: [IdentityExceptionStatus.OPEN, IdentityExceptionStatus.ESCALATED] } }, select: { id: true, type: true, status: true, severity: true, summary: true } },
} satisfies Prisma.UserSelect;

const suspendSchema = z.object({ reason: z.string().trim().min(5).max(1000) });
const reconcileSchema = z.object({ resolutionNote: z.string().trim().min(5).max(2000), authoritativePersonId: z.string().trim().min(1).max(200).optional() });
const accessControlSchema = z.object({
  accessReviewStatus: z.nativeEnum(AccessReviewStatus).optional(),
  applicationSupportRole: z.nativeEnum(ApplicationSupportRole).optional(),
  breakGlassEligible: z.boolean().optional(),
  temporaryAdminExpiresAt: z.coerce.date().nullable().optional(),
  notificationPreferences: z.record(z.boolean()).optional(),
}).refine((value) => Object.keys(value).length > 0, "Provide at least one EES access control to update.");
const scopeSchema = z.object({
  unitId: z.string().nullable().optional(),
  scopeType: z.nativeEnum(AdministrativeScopeType),
  expiresAt: z.coerce.date().nullable().optional(),
});

async function scopeWhere(actorId: string) {
  const unitIds = await administrativeScopeUnitIds(actorId);
  return unitIds === null ? {} : { unitId: { in: unitIds } };
}

async function findScopedUser(id: string, actorId: string) {
  const user = await prisma.user.findFirst({ where: { id, ...(await scopeWhere(actorId)) }, select: recordSelect });
  if (!user) throw new HttpError(404, "Identity record not found.");
  return user;
}

function assignmentStatus(assignments: { ratedSoldierId: string; raterId: string; seniorRaterId: string; id: string }[], userId: string) {
  const matched = assignments.filter((assignment) => [assignment.ratedSoldierId, assignment.raterId, assignment.seniorRaterId].includes(userId));
  return matched.length > 0 ? "VALID" : "NO_ACTIVE_ASSIGNMENT";
}

async function activeAssignmentsForUsers(userIds: string[]) {
  const now = new Date();
  return prisma.ratingSchemeAssignment.findMany({
    where: {
      status: "PUBLISHED",
      effectiveFrom: { lte: now },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
      AND: [{ OR: [{ ratedSoldierId: { in: userIds } }, { raterId: { in: userIds } }, { seniorRaterId: { in: userIds } }, { supplementaryReviewerId: { in: userIds } }] }],
    },
    select: { id: true, ratedSoldierId: true, raterId: true, seniorRaterId: true },
  });
}

async function synchronizeDevelopmentRecord(userId: string, actorId: string) {
  if (isProd) throw new HttpError(409, "No authoritative identity connector is configured for this environment.");
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new HttpError(404, "Identity record not found.");
  const now = new Date();
  const source = await prisma.identitySourceRecord.upsert({
    where: { userId },
    update: {
      sourceSystem: IdentitySourceSystem.DEVELOPMENT_SEED,
      authoritativePersonId: user.dodid ?? user.id,
      authoritativeEmail: user.email,
      syncStatus: IdentitySyncStatus.CURRENT,
      lastSyncAttemptAt: now,
      lastSynchronizedAt: now,
      syncError: null,
      sourcePayload: { mode: "development", note: "Development persona seed; not an authoritative personnel source." },
    },
    create: {
      userId,
      sourceSystem: IdentitySourceSystem.DEVELOPMENT_SEED,
      authoritativePersonId: user.dodid ?? user.id,
      authoritativeEmail: user.email,
      syncStatus: IdentitySyncStatus.CURRENT,
      lastSyncAttemptAt: now,
      lastSynchronizedAt: now,
      sourcePayload: { mode: "development", note: "Development persona seed; not an authoritative personnel source." },
    },
  });
  await prisma.identitySyncEvent.create({ data: { userId, sourceSystem: source.sourceSystem, status: "CURRENT", action: "DEVELOPMENT_SYNC_COMPLETED", initiatedById: actorId } });
  await prisma.auditLog.create({ data: { actorId, subjectUserId: userId, action: "IDENTITY_SYNC_COMPLETED", entityType: "IdentitySourceRecord", entityId: source.id, metadata: { sourceSystem: source.sourceSystem } } });
  return source;
}

identityAccessRouter.use(requireAuth, requireApplicationAdministrator);

identityAccessRouter.get("/summary", asyncHandler(async (req, res) => {
  if (!req.user) throw new HttpError(401, "Not authenticated");
  const records = await prisma.user.findMany({ where: await scopeWhere(req.user.id), select: recordSelect });
  const exceptionCount = records.reduce((count, record) => count + record.identityExceptions.length, 0);
  res.json({
    syncedIdentities: records.filter((record) => record.identitySourceRecord?.syncStatus === "CURRENT").length,
    syncExceptions: exceptionCount,
    pendingAccessReviews: records.filter((record) => record.accessReviewStatus !== "CURRENT").length,
    suspendedAccounts: records.filter((record) => record.applicationAccessStatus === "SUSPENDED").length,
    unmatchedPersonnelRecords: records.filter((record) => record.identitySourceRecord?.syncStatus === "UNMATCHED").length,
  });
}));

identityAccessRouter.get("/records", asyncHandler(async (req, res) => {
  if (!req.user) throw new HttpError(401, "Not authenticated");
  const query = typeof req.query.query === "string" ? req.query.query.trim() : "";
  const sourceSystem = typeof req.query.sourceSystem === "string" ? req.query.sourceSystem : undefined;
  const syncStatus = typeof req.query.syncStatus === "string" ? req.query.syncStatus : undefined;
  const accessStatus = typeof req.query.accessStatus === "string" ? req.query.accessStatus : undefined;
  const unitId = typeof req.query.unitId === "string" ? req.query.unitId : undefined;
  const baseScope = await scopeWhere(req.user.id);
  const users = await prisma.user.findMany({
    where: {
      ...baseScope,
      ...(unitId ? { unitId } : {}),
      ...(accessStatus ? { applicationAccessStatus: accessStatus as never } : {}),
      ...(sourceSystem || syncStatus ? { identitySourceRecord: { ...(sourceSystem ? { sourceSystem: sourceSystem as never } : {}), ...(syncStatus ? { syncStatus: syncStatus as never } : {}) } } : {}),
      ...(query ? { OR: [{ firstName: { contains: query, mode: "insensitive" } }, { lastName: { contains: query, mode: "insensitive" } }, { email: { contains: query, mode: "insensitive" } }, { supabaseId: { contains: query, mode: "insensitive" } }, { dodid: { contains: query, mode: "insensitive" } }, { unit: { name: { contains: query, mode: "insensitive" } } }] } : {}),
    },
    select: recordSelect,
    orderBy: { lastName: "asc" },
  });
  const assignments = await activeAssignmentsForUsers(users.map((user) => user.id));
  res.json(users.map((user) => ({
    ...user,
    syncStatus: user.identitySourceRecord?.syncStatus ?? "NOT_CONFIGURED",
    sourceSystem: user.identitySourceRecord?.sourceSystem ?? "NOT_CONFIGURED",
    assignmentStatus: assignmentStatus(assignments, user.id),
    exceptionCount: user.identityExceptions.length,
  })));
}));

identityAccessRouter.get("/records/:id", asyncHandler(async (req, res) => {
  if (!req.user) throw new HttpError(401, "Not authenticated");
  const user = await findScopedUser(req.params.id!, req.user.id);
  const [assignments, grants, scopes, overrides] = await Promise.all([
    prisma.ratingSchemeAssignment.findMany({ where: { OR: [{ ratedSoldierId: user.id }, { raterId: user.id }, { seniorRaterId: user.id }, { supplementaryReviewerId: user.id }] }, include: { ratedSoldier: true, rater: true, seniorRater: true, supplementaryReviewer: true }, orderBy: { effectiveFrom: "desc" } }),
    prisma.delegate.findMany({ where: { OR: [{ grantorUserId: user.id }, { subjectUserId: user.id }, { delegateUserId: user.id }] }, include: { capabilities: true }, orderBy: { createdAt: "desc" } }),
    prisma.administrativeScope.findMany({ where: { administratorId: user.id }, include: { unit: true }, orderBy: { createdAt: "desc" } }),
    prisma.manualOverride.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } }),
  ]);
  res.json({ ...user, assignments, accessGrants: grants, administrativeScopes: scopes, manualOverrides: overrides });
}));

identityAccessRouter.get("/records/:id/assignments", asyncHandler(async (req, res) => {
  if (!req.user) throw new HttpError(401, "Not authenticated");
  const user = await findScopedUser(req.params.id!, req.user.id);
  const assignments = await prisma.ratingSchemeAssignment.findMany({ where: { OR: [{ ratedSoldierId: user.id }, { raterId: user.id }, { seniorRaterId: user.id }, { supplementaryReviewerId: user.id }] }, include: { ratedSoldier: true, rater: true, seniorRater: true, supplementaryReviewer: true }, orderBy: { effectiveFrom: "desc" } });
  res.json({ assignments });
}));

identityAccessRouter.get("/records/:id/audit", asyncHandler(async (req, res) => {
  if (!req.user) throw new HttpError(401, "Not authenticated");
  const user = await findScopedUser(req.params.id!, req.user.id);
  const [syncEvents, auditEvents] = await Promise.all([
    prisma.identitySyncEvent.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } }),
    prisma.auditLog.findMany({ where: { OR: [{ subjectUserId: user.id }, { entityId: user.id, entityType: "User" }] }, include: { actor: { select: { firstName: true, lastName: true, rank: true } } }, orderBy: { createdAt: "desc" }, take: 100 }),
  ]);
  res.json({ syncEvents, auditEvents });
}));

identityAccessRouter.get("/exceptions", asyncHandler(async (req, res) => {
  if (!req.user) throw new HttpError(401, "Not authenticated");
  const status = typeof req.query.status === "string" ? req.query.status as IdentityExceptionStatus : "OPEN";
  const scopedUsers = await scopeWhere(req.user.id);
  const exceptions = await prisma.identityException.findMany({
    where: { status, ...(Object.keys(scopedUsers).length > 0 ? { user: scopedUsers } : {}) },
    include: { user: { select: { id: true, firstName: true, lastName: true, rank: true, email: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json({ exceptions });
}));

identityAccessRouter.post("/sync", asyncHandler(async (req, res) => {
  if (!req.user) throw new HttpError(401, "Not authenticated");
  const users = await prisma.user.findMany({ where: await scopeWhere(req.user.id), select: { id: true } });
  if (isProd) throw new HttpError(409, "Identity source integration is not configured in this environment.");
  await Promise.all(users.map((user) => synchronizeDevelopmentRecord(user.id, req.user!.id)));
  res.status(202).json({ synchronized: users.length, sourceSystem: "DEVELOPMENT_SEED" });
}));

identityAccessRouter.post("/records/:id/retry-sync", asyncHandler(async (req, res) => {
  if (!req.user) throw new HttpError(401, "Not authenticated");
  await findScopedUser(req.params.id!, req.user.id);
  const source = await synchronizeDevelopmentRecord(req.params.id!, req.user.id);
  res.status(202).json({ source });
}));

identityAccessRouter.post("/records/:id/suspend", asyncHandler(async (req, res) => {
  if (!req.user) throw new HttpError(401, "Not authenticated");
  const body = suspendSchema.parse(req.body);
  const target = await findScopedUser(req.params.id!, req.user.id);
  if (target.id === req.user.id) throw new HttpError(422, "Administrators cannot suspend their own active session.");
  const updated = await prisma.user.update({ where: { id: target.id }, data: { applicationAccessStatus: "SUSPENDED", accessReviewStatus: "PENDING_REVIEW", suspensionReason: body.reason, suspendedAt: new Date(), suspendedByUserId: req.user.id } });
  await prisma.auditLog.create({ data: { actorId: req.user.id, subjectUserId: target.id, action: "IDENTITY_ACCESS_SUSPENDED", entityType: "User", entityId: target.id, metadata: { reason: body.reason } } });
  res.json(updated);
}));

identityAccessRouter.post("/records/:id/reactivate", asyncHandler(async (req, res) => {
  if (!req.user) throw new HttpError(401, "Not authenticated");
  const target = await findScopedUser(req.params.id!, req.user.id);
  const updated = await prisma.user.update({ where: { id: target.id }, data: { applicationAccessStatus: "ACTIVE", accessReviewStatus: "CURRENT", suspensionReason: null, suspendedAt: null, suspendedByUserId: null } });
  await prisma.auditLog.create({ data: { actorId: req.user.id, subjectUserId: target.id, action: "IDENTITY_ACCESS_REACTIVATED", entityType: "User", entityId: target.id } });
  res.json(updated);
}));

identityAccessRouter.patch("/records/:id/access", asyncHandler(async (req, res) => {
  if (!req.user) throw new HttpError(401, "Not authenticated");
  const body = accessControlSchema.parse(req.body);
  const target = await findScopedUser(req.params.id!, req.user.id);
  const updated = await prisma.user.update({
    where: { id: target.id },
    data: {
      ...(body.accessReviewStatus ? { accessReviewStatus: body.accessReviewStatus } : {}),
      ...(body.applicationSupportRole ? { applicationSupportRole: body.applicationSupportRole } : {}),
      ...(body.breakGlassEligible !== undefined ? { breakGlassEligible: body.breakGlassEligible } : {}),
      ...(body.temporaryAdminExpiresAt !== undefined ? { temporaryAdminExpiresAt: body.temporaryAdminExpiresAt } : {}),
      ...(body.notificationPreferences !== undefined ? { notificationPreferences: body.notificationPreferences } : {}),
    },
  });
  await prisma.auditLog.create({ data: { actorId: req.user.id, subjectUserId: target.id, action: "IDENTITY_ACCESS_CONTROL_UPDATED", entityType: "User", entityId: target.id, metadata: body } });
  res.json(updated);
}));

identityAccessRouter.post("/records/:id/scopes", asyncHandler(async (req, res) => {
  if (!req.user) throw new HttpError(401, "Not authenticated");
  const body = scopeSchema.parse(req.body);
  const target = await findScopedUser(req.params.id!, req.user.id);
  if (body.unitId) {
    const unit = await prisma.unit.findUnique({ where: { id: body.unitId }, select: { id: true } });
    if (!unit) throw new HttpError(404, "Administrative scope unit not found.");
  }
  const scope = await prisma.administrativeScope.create({ data: { administratorId: target.id, unitId: body.unitId ?? null, scopeType: body.scopeType, expiresAt: body.expiresAt ?? null, createdById: req.user.id }, include: { unit: true } });
  await prisma.auditLog.create({ data: { actorId: req.user.id, subjectUserId: target.id, action: "ADMINISTRATIVE_SCOPE_ASSIGNED", entityType: "AdministrativeScope", entityId: scope.id, metadata: { scopeType: body.scopeType, unitId: body.unitId ?? null, expiresAt: body.expiresAt ?? null } } });
  res.status(201).json(scope);
}));

identityAccessRouter.delete("/scopes/:scopeId", asyncHandler(async (req, res) => {
  if (!req.user) throw new HttpError(401, "Not authenticated");
  const scope = await prisma.administrativeScope.findUnique({ where: { id: req.params.scopeId } });
  if (!scope) throw new HttpError(404, "Administrative scope not found.");
  await findScopedUser(scope.administratorId, req.user.id);
  await prisma.administrativeScope.delete({ where: { id: scope.id } });
  await prisma.auditLog.create({ data: { actorId: req.user.id, subjectUserId: scope.administratorId, action: "ADMINISTRATIVE_SCOPE_REMOVED", entityType: "AdministrativeScope", entityId: scope.id, metadata: { scopeType: scope.scopeType, unitId: scope.unitId } } });
  res.status(204).send();
}));

identityAccessRouter.post("/exceptions/:id/resolve", asyncHandler(async (req, res) => {
  if (!req.user) throw new HttpError(401, "Not authenticated");
  const body = z.object({ resolutionNote: z.string().trim().min(3).max(2000) }).parse(req.body);
  const exception = await prisma.identityException.findUnique({ where: { id: req.params.id }, include: { user: true } });
  if (!exception) throw new HttpError(404, "Identity exception not found.");
  if (exception.user) await findScopedUser(exception.user.id, req.user.id);
  const updated = await prisma.identityException.update({ where: { id: exception.id }, data: { status: "RESOLVED", resolvedAt: new Date(), resolvedById: req.user.id, resolutionNote: body.resolutionNote } });
  await prisma.auditLog.create({ data: { actorId: req.user.id, subjectUserId: exception.userId, action: "IDENTITY_EXCEPTION_RESOLVED", entityType: "IdentityException", entityId: exception.id, metadata: { resolutionNote: body.resolutionNote } } });
  res.json(updated);
}));

identityAccessRouter.post("/records/:id/reconcile", asyncHandler(async (req, res) => {
  if (!req.user) throw new HttpError(401, "Not authenticated");
  const body = reconcileSchema.parse(req.body);
  const target = await findScopedUser(req.params.id!, req.user.id);
  const source = await prisma.identitySourceRecord.upsert({ where: { userId: target.id }, update: { ...(body.authoritativePersonId ? { authoritativePersonId: body.authoritativePersonId } : {}), syncStatus: "PENDING" }, create: { userId: target.id, sourceSystem: isProd ? "NOT_CONFIGURED" : "DEVELOPMENT_SEED", authoritativePersonId: body.authoritativePersonId, syncStatus: "PENDING" } });
  await prisma.manualOverride.create({ data: { userId: target.id, field: "IDENTITY_RECONCILIATION", value: { sourceRecordId: source.id, authoritativePersonId: body.authoritativePersonId ?? null }, reason: body.resolutionNote, createdById: req.user.id } });
  await prisma.auditLog.create({ data: { actorId: req.user.id, subjectUserId: target.id, action: "IDENTITY_RECONCILIATION_REQUESTED", entityType: "IdentitySourceRecord", entityId: source.id, metadata: { resolutionNote: body.resolutionNote } } });
  res.status(202).json({ source, reconciliationRequested: true });
}));
