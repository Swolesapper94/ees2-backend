import { createHash } from "crypto";
import { Router } from "express";
import type { UserRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { validateRatingSchemeCoverage, validateSchemeAssignments } from "@/lib/rating-scheme-validation";
import { isRatingEligiblePerson, ratingSchemePopulation } from "@/lib/rating-scheme-population";
import {
  canApproveRatingScheme, canCreateRatingSchemeDraft, canEditRatingSchemeDraft,
  canManageRatingSchemeDelegates, canPublishRatingScheme, canSubmitRatingScheme,
  canViewDraftRatingScheme, canViewPublishedRatingScheme, canViewRatingSchemeAudit,
  approvalBattalionIdForUnit, canInspectUnitRatingScheme, canViewUnitRatingSchemeFormation, currentCommander,
} from "@/lib/rating-scheme-policy";
import { asyncHandler, HttpError } from "@/middleware/error";
import { requireAuth } from "@/middleware/auth";

export const ratingSchemesRouter = Router();
export const ratingSchemeDelegationsRouter = Router();

const schemeInput = z.object({ unitId: z.string().min(1).optional(), effectiveFrom: z.coerce.date(), changeReason: z.string().min(1).max(500) });
const assignmentInput = z.object({
  ratedSoldierId: z.string().min(1), raterId: z.string().min(1), intermediateRaterId: z.string().nullable().optional(),
  seniorRaterId: z.string().min(1), supplementaryReviewerId: z.string().nullable().optional(), unitId: z.string().nullable().optional(),
  effectiveFrom: z.coerce.date(), effectiveTo: z.coerce.date().nullable().optional(), formCategory: z.enum(["NCOER", "OER"]),
  changeReason: z.string().min(1).max(500), exceptionToPolicyId: z.string().nullable().optional(),
  sameGradeCommandException: z.boolean().optional(), hasUniformedArmyAdvisor: z.boolean().default(true), isReliefForCause: z.boolean().default(false),
});
const delegationInput = z.object({
  battalionId: z.string().min(1).optional(), delegateUserId: z.string().min(1), effectiveFrom: z.coerce.date(), effectiveTo: z.coerce.date().nullable().optional(),
  permissions: z.array(z.enum(["CREATE_DRAFT", "EDIT_DRAFT", "IMPORT_ASSIGNMENTS", "RESOLVE_VALIDATION", "SUBMIT_FOR_APPROVAL", "VIEW_AUDIT"])).min(1),
});
const assignmentInclude = { ratedSoldier: true, rater: true, intermediateRater: true, seniorRater: true, supplementaryReviewer: true, unit: true } as const;
const schemeInclude = { unit: true, battalion: true, createdBy: true, submittedBy: true, approvedBy: true, publishedBy: true, assignments: { include: assignmentInclude, orderBy: { effectiveFrom: "asc" } } } as const;

function requireUser(req: { user?: { id: string; unitId: string | null; roles: UserRole[] } }) {
  if (!req.user) throw new HttpError(401, "Not authenticated");
  return req.user;
}

async function loadScheme(id: string | undefined) {
  if (!id) throw new HttpError(404, "Rating scheme not found", "RATING_SCHEME_NOT_FOUND");
  const scheme = await prisma.ratingScheme.findUnique({ where: { id }, include: schemeInclude });
  if (!scheme) throw new HttpError(404, "Rating scheme not found", "RATING_SCHEME_NOT_FOUND");
  return scheme;
}

async function audit(req: any, action: string, schemeId: string, metadata?: Record<string, unknown>) {
  await prisma.auditLog.create({ data: {
    actorId: req.user.id, action, entityType: "RatingScheme", entityId: schemeId, metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : undefined,
    requestId: req.header("x-request-id") ?? undefined, ipAddress: req.ip, userAgent: req.header("user-agent") ?? undefined,
  } });
}

async function validateScheme(scheme: Awaited<ReturnType<typeof loadScheme>>) {
  const assignments = scheme.assignments.map((assignment) => ({ ...assignment, effectiveTo: assignment.effectiveTo ?? null }));
  return [
    ...(await validateSchemeAssignments(assignments)),
    ...(await validateRatingSchemeCoverage(scheme.unitId, assignments)),
  ];
}

function isAssignmentParticipant(actorId: string, assignment: Awaited<ReturnType<typeof loadScheme>>["assignments"][number]) {
  return [
    assignment.ratedSoldierId,
    assignment.raterId,
    assignment.intermediateRaterId,
    assignment.seniorRaterId,
    assignment.supplementaryReviewerId,
  ].includes(actorId);
}

async function withCapabilities(actor: { id: string; unitId: string | null; roles: UserRole[] }, scheme: Awaited<ReturnType<typeof loadScheme>>) {
  const canViewFormation = await canViewUnitRatingSchemeFormation(actor, scheme.unitId);
  const assignments = canViewFormation
    ? scheme.assignments
    : scheme.assignments.filter((assignment) => isAssignmentParticipant(actor.id, assignment));
  const coverage = canViewFormation
    ? await ratingSchemePopulation(scheme.unitId, scheme.assignments.map((assignment) => assignment.ratedSoldierId))
    : { eligiblePersonnel: [], unassignedPersonnel: [] };
  return {
    ...scheme,
    assignments,
    coverage,
    viewScope: canViewFormation ? "FORMATION" : "OWN_RATING_CHAIN",
    capabilities: {
      createDraft: await canCreateRatingSchemeDraft(actor, scheme.battalionId),
      editDraft: await canEditRatingSchemeDraft(actor, scheme),
      submit: await canSubmitRatingScheme(actor, scheme),
      approve: await canApproveRatingScheme(actor, scheme),
      publish: await canPublishRatingScheme(actor, scheme),
      manageDelegates: await canManageRatingSchemeDelegates(actor, scheme.battalionId),
      viewAudit: await canViewRatingSchemeAudit(actor, scheme),
    },
  };
}

ratingSchemesRouter.get("/current", requireAuth, asyncHandler(async (req, res) => {
  const actor = requireUser(req);
  if (!actor.unitId) return res.json(null);
  const now = new Date();
  const scheme = await prisma.ratingScheme.findFirst({
    where: { unitId: actor.unitId, status: "PUBLISHED", effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] },
    include: schemeInclude, orderBy: [{ effectiveFrom: "desc" }],
  });
  if (!scheme) return res.json(null);
  if (!await canViewPublishedRatingScheme(actor, scheme)) throw new HttpError(403, "You are not assigned to this unit rating scheme");
  res.json(await withCapabilities(actor, scheme));
}));

ratingSchemesRouter.get("/history", requireAuth, asyncHandler(async (req, res) => {
  const actor = requireUser(req);
  const schemes = await prisma.ratingScheme.findMany({ where: { unitId: actor.unitId ?? undefined, status: { in: ["PUBLISHED", "SUPERSEDED"] } }, include: schemeInclude, orderBy: { effectiveFrom: "desc" } });
  res.json(schemes);
}));

ratingSchemesRouter.get("/workspace", requireAuth, asyncHandler(async (req, res) => {
  const actor = requireUser(req);
  const unitId = typeof req.query.unitId === "string" ? req.query.unitId : actor.unitId;
  if (!unitId) return res.json({ scheme: null, capabilities: { createDraft: false } });
  if (!await canInspectUnitRatingScheme(actor, unitId)) throw new HttpError(403, "You are not authorized to view this immediate-unit rating scheme");
  const now = new Date();
  const scheme = await prisma.ratingScheme.findFirst({
    where: { unitId, status: "PUBLISHED", effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] },
    include: schemeInclude,
    orderBy: { effectiveFrom: "desc" },
  });
  if (scheme && !await canViewPublishedRatingScheme(actor, scheme)) throw new HttpError(403, "You are not assigned to this unit rating scheme");
  res.json({ scheme: scheme ? await withCapabilities(actor, scheme) : null, capabilities: { createDraft: await canCreateRatingSchemeDraft(actor, await approvalBattalionIdForUnit(unitId)) } });
}));

ratingSchemesRouter.get("/available-units", requireAuth, asyncHandler(async (req, res) => {
  const actor = requireUser(req);
  if (!actor.unitId) return res.json([]);
  const battalionId = await approvalBattalionIdForUnit(actor.unitId);
  const command = await currentCommander(battalionId);
  if (command?.commanderUserId !== actor.id) {
    const unit = await prisma.unit.findUnique({ where: { id: actor.unitId }, select: { id: true, name: true } });
    return res.json(unit ? [unit] : []);
  }
  const units = await prisma.unit.findMany({ select: { id: true, name: true, parentId: true }, orderBy: { name: "asc" } });
  const parentById = new Map(units.map((unit) => [unit.id, unit.parentId]));
  const isWithinCommand = (unitId: string) => {
    let cursor: string | null | undefined = unitId;
    while (cursor) {
      if (cursor === battalionId) return true;
      cursor = parentById.get(cursor);
    }
    return false;
  };
  res.json(units.filter((unit) => isWithinCommand(unit.id)).map(({ id, name }) => ({ id, name })));
}));

ratingSchemesRouter.post("/", requireAuth, asyncHandler(async (req, res) => {
  const actor = requireUser(req); const body = schemeInput.parse(req.body); const unitId = body.unitId ?? actor.unitId;
  if (!unitId) throw new HttpError(422, "An immediate unit is required for a rating scheme");
  const battalionId = await approvalBattalionIdForUnit(unitId);
  if (!await canCreateRatingSchemeDraft(actor, battalionId)) throw new HttpError(403, "Only the active battalion commander or an active delegate may create a draft");
  if (body.effectiveFrom <= new Date()) throw new HttpError(422, "New schemes must be prospective", "RETROACTIVE_CHANGE_NOT_ALLOWED");
  const latest = await prisma.ratingScheme.findFirst({ where: { unitId }, orderBy: { version: "desc" }, select: { version: true, id: true } });
  const scheme = await prisma.ratingScheme.create({ data: { unitId, battalionId, version: (latest?.version ?? 0) + 1, effectiveFrom: body.effectiveFrom, changeReason: body.changeReason, previousSchemeId: latest?.id, createdByUserId: actor.id }, include: schemeInclude });
  await audit(req, "RATING_SCHEME_CREATED", scheme.id, { unitId, battalionId, version: scheme.version, changeReason: body.changeReason });
  res.status(201).json(scheme);
}));

ratingSchemesRouter.post("/:id/copy", requireAuth, asyncHandler(async (req, res) => {
  const actor = requireUser(req); const source = await loadScheme(req.params.id); const body = schemeInput.pick({ effectiveFrom: true, changeReason: true }).parse(req.body);
  if (!source.unitId) throw new HttpError(409, "This legacy scheme has not been assigned an immediate unit", "RATING_SCHEME_UNIT_NOT_SET");
  if (!await canCreateRatingSchemeDraft(actor, source.battalionId)) throw new HttpError(403, "Draft creation is not authorized");
  if (body.effectiveFrom <= new Date()) throw new HttpError(422, "Replacement schemes must be prospective", "RETROACTIVE_CHANGE_NOT_ALLOWED");
  const latest = await prisma.ratingScheme.findFirst({ where: { unitId: source.unitId }, orderBy: { version: "desc" }, select: { version: true } });
  const draft = await prisma.$transaction(async (tx) => tx.ratingScheme.create({ data: { unitId: source.unitId, battalionId: source.battalionId, version: (latest?.version ?? 0) + 1, effectiveFrom: body.effectiveFrom, changeReason: body.changeReason, previousSchemeId: source.id, createdByUserId: actor.id, assignments: { create: source.assignments.map((assignment) => ({ ratedSoldierId: assignment.ratedSoldierId, raterId: assignment.raterId, intermediateRaterId: assignment.intermediateRaterId, seniorRaterId: assignment.seniorRaterId, supplementaryReviewerId: assignment.supplementaryReviewerId, unitId: source.unitId, formCategory: assignment.formCategory, effectiveFrom: body.effectiveFrom, effectiveTo: null, requiresSupplementaryReview: assignment.requiresSupplementaryReview, changeReason: body.changeReason, createdByUserId: actor.id })) } }, include: schemeInclude }));
  await audit(req, "RATING_SCHEME_COPIED", draft.id, { sourceSchemeId: source.id }); res.status(201).json(draft);
}));

ratingSchemesRouter.get("/:id", requireAuth, asyncHandler(async (req, res) => {
  const actor = requireUser(req); const scheme = await loadScheme(req.params.id);
  const allowed = scheme.status === "PUBLISHED" || scheme.status === "SUPERSEDED" ? await canViewPublishedRatingScheme(actor, scheme) : await canViewDraftRatingScheme(actor, scheme);
  if (!allowed) throw new HttpError(403, "You are not authorized to view this rating scheme"); res.json(await withCapabilities(actor, scheme));
}));

ratingSchemesRouter.get("/:id/assignments", requireAuth, asyncHandler(async (req, res) => {
  const actor = requireUser(req); const scheme = await loadScheme(req.params.id);
  const allowed = scheme.status === "PUBLISHED" || scheme.status === "SUPERSEDED" ? await canViewPublishedRatingScheme(actor, scheme) : await canViewDraftRatingScheme(actor, scheme);
  if (!allowed) throw new HttpError(403, "You are not authorized to view these assignments");
  const canViewFormation = await canViewUnitRatingSchemeFormation(actor, scheme.unitId);
  res.json(canViewFormation ? scheme.assignments : scheme.assignments.filter((assignment) => isAssignmentParticipant(actor.id, assignment)));
}));

ratingSchemesRouter.get("/:id/candidates", requireAuth, asyncHandler(async (req, res) => {
  const actor = requireUser(req); const scheme = await loadScheme(req.params.id);
  if (!await canEditRatingSchemeDraft(actor, scheme)) throw new HttpError(403, "Draft editing is not authorized");
  if (!scheme.unitId) throw new HttpError(409, "This legacy scheme has not been assigned an immediate unit", "RATING_SCHEME_UNIT_NOT_SET");
  const candidates = await prisma.user.findMany({ where: { unitId: scheme.unitId, applicationAccessStatus: "ACTIVE" }, select: { id: true, firstName: true, lastName: true, rank: true, mos: true, category: true }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }] });
  res.json(candidates.map((candidate) => ({ ...candidate, ratingEligible: isRatingEligiblePerson(candidate) })));
}));

ratingSchemesRouter.post("/:id/assignments", requireAuth, asyncHandler(async (req, res) => {
  const actor = requireUser(req); const scheme = await loadScheme(req.params.id); const body = assignmentInput.parse(req.body);
  if (!await canEditRatingSchemeDraft(actor, scheme)) throw new HttpError(403, "Draft editing is not authorized");
  if (!scheme.unitId) throw new HttpError(409, "This legacy scheme has not been assigned an immediate unit", "RATING_SCHEME_UNIT_NOT_SET");
  if (body.effectiveFrom < scheme.effectiveFrom) throw new HttpError(422, "Assignment cannot begin before its prospective scheme", "RETROACTIVE_CHANGE_NOT_ALLOWED");
  const ratedSoldier = await prisma.user.findUnique({ where: { id: body.ratedSoldierId }, select: { unitId: true, rank: true, category: true } });
  if (ratedSoldier?.unitId !== scheme.unitId) throw new HttpError(422, "The rated Soldier must belong to this scheme's immediate unit", "RATING_SCHEME_UNIT_MISMATCH");
  if (!isRatingEligiblePerson(ratedSoldier)) throw new HttpError(422, "Only E-5+ NCOs, warrant officers, and commissioned officers may be rated in this scheme", "RATED_PERSON_NOT_ELIGIBLE");
  const proposedAssignments = [...scheme.assignments, body];
  const issues = await validateSchemeAssignments(proposedAssignments);
  if (issues.some((issue) => issue.severity === "ERROR")) throw new HttpError(422, "Resolve validation errors before saving this assignment", "RATING_SCHEME_VALIDATION_FAILED", issues);
  const assignment = await prisma.ratingSchemeAssignment.create({ data: { ...body, unitId: scheme.unitId, ratingSchemeId: scheme.id, createdByUserId: actor.id }, include: assignmentInclude });
  await audit(req, "RATING_SCHEME_ASSIGNMENT_ADDED", scheme.id, { assignmentId: assignment.id, ratedSoldierId: assignment.ratedSoldierId }); res.status(201).json(assignment);
}));

ratingSchemesRouter.patch("/:id/assignments/:assignmentId", requireAuth, asyncHandler(async (req, res) => {
  const actor = requireUser(req); const scheme = await loadScheme(req.params.id); const updates = assignmentInput.partial().parse(req.body);
  if (!await canEditRatingSchemeDraft(actor, scheme)) throw new HttpError(403, "Draft editing is not authorized");
  if (!scheme.unitId) throw new HttpError(409, "This legacy scheme has not been assigned an immediate unit", "RATING_SCHEME_UNIT_NOT_SET");
  const assignment = await prisma.ratingSchemeAssignment.findFirst({ where: { id: req.params.assignmentId, ratingSchemeId: scheme.id } });
  if (!assignment) throw new HttpError(404, "Rating scheme assignment not found");
  const merged = { ...assignment, ...updates };
  const ratedSoldier = await prisma.user.findUnique({ where: { id: merged.ratedSoldierId }, select: { unitId: true, rank: true, category: true } });
  if (ratedSoldier?.unitId !== scheme.unitId) throw new HttpError(422, "The rated Soldier must belong to this scheme's immediate unit", "RATING_SCHEME_UNIT_MISMATCH");
  if (!isRatingEligiblePerson(ratedSoldier)) throw new HttpError(422, "Only E-5+ NCOs, warrant officers, and commissioned officers may be rated in this scheme", "RATED_PERSON_NOT_ELIGIBLE");
  const proposedAssignments = [...scheme.assignments.filter((candidate) => candidate.id !== assignment.id), merged];
  const issues = await validateSchemeAssignments(proposedAssignments);
  if (issues.some((issue) => issue.severity === "ERROR")) throw new HttpError(422, "Resolve validation errors before saving this assignment", "RATING_SCHEME_VALIDATION_FAILED", issues);
  const updated = await prisma.ratingSchemeAssignment.update({ where: { id: assignment.id }, data: updates, include: assignmentInclude });
  await audit(req, "RATING_SCHEME_ASSIGNMENT_UPDATED", scheme.id, { assignmentId: assignment.id, previousValue: assignment, newValue: updates }); res.json(updated);
}));

ratingSchemesRouter.delete("/:id/assignments/:assignmentId", requireAuth, asyncHandler(async (req, res) => {
  const actor = requireUser(req); const scheme = await loadScheme(req.params.id);
  if (!await canEditRatingSchemeDraft(actor, scheme)) throw new HttpError(403, "Draft editing is not authorized");
  const assignment = await prisma.ratingSchemeAssignment.findFirst({ where: { id: req.params.assignmentId, ratingSchemeId: scheme.id } });
  if (!assignment) throw new HttpError(404, "Rating scheme assignment not found");
  await prisma.ratingSchemeAssignment.delete({ where: { id: assignment.id } }); await audit(req, "RATING_SCHEME_ASSIGNMENT_REMOVED", scheme.id, { assignmentId: assignment.id }); res.status(204).end();
}));

ratingSchemesRouter.post("/:id/validate", requireAuth, asyncHandler(async (req, res) => {
  const actor = requireUser(req); const scheme = await loadScheme(req.params.id);
  if (!await canViewDraftRatingScheme(actor, scheme)) throw new HttpError(403, "Validation details are restricted");
  const issues = await validateScheme(scheme); await audit(req, "RATING_SCHEME_VALIDATED", scheme.id, { errorCount: issues.filter((issue) => issue.severity === "ERROR").length }); res.json({ issues, valid: !issues.some((issue) => issue.severity === "ERROR") });
}));

ratingSchemesRouter.post("/:id/submit", requireAuth, asyncHandler(async (req, res) => {
  const actor = requireUser(req); const scheme = await loadScheme(req.params.id); if (!await canSubmitRatingScheme(actor, scheme)) throw new HttpError(403, "Submission is not authorized");
  const issues = await validateScheme(scheme); if (issues.some((issue) => issue.severity === "ERROR")) throw new HttpError(422, "Resolve validation errors before submitting", "RATING_SCHEME_VALIDATION_FAILED", issues);
  const updated = await prisma.ratingScheme.update({ where: { id: scheme.id }, data: { status: "PENDING_APPROVAL", submittedByUserId: actor.id, submittedAt: new Date() }, include: schemeInclude }); await audit(req, "RATING_SCHEME_SUBMITTED", scheme.id, { submittedByUserId: actor.id }); res.json(updated);
}));

ratingSchemesRouter.post("/:id/withdraw", requireAuth, asyncHandler(async (req, res) => {
  const actor = requireUser(req); const scheme = await loadScheme(req.params.id); if (scheme.status !== "PENDING_APPROVAL" || scheme.submittedByUserId !== actor.id) throw new HttpError(403, "Only the submitting delegate may withdraw this pending scheme");
  const updated = await prisma.ratingScheme.update({ where: { id: scheme.id }, data: { status: "DRAFT", submittedAt: null, submittedByUserId: null }, include: schemeInclude }); await audit(req, "RATING_SCHEME_WITHDRAWN", scheme.id); res.json(updated);
}));

ratingSchemesRouter.post("/:id/return", requireAuth, asyncHandler(async (req, res) => {
  const actor = requireUser(req); const scheme = await loadScheme(req.params.id); const body = z.object({ comments: z.string().min(1).max(2000) }).parse(req.body); if (!await canApproveRatingScheme(actor, scheme)) throw new HttpError(403, "Only the active battalion commander may return this scheme");
  const updated = await prisma.ratingScheme.update({ where: { id: scheme.id }, data: { status: "RETURNED", returnedByUserId: actor.id, returnedAt: new Date(), returnComments: body.comments }, include: schemeInclude }); await audit(req, "RATING_SCHEME_RETURNED", scheme.id, { comments: body.comments }); res.json(updated);
}));

ratingSchemesRouter.post("/:id/approve", requireAuth, asyncHandler(async (req, res) => {
  const actor = requireUser(req); const scheme = await loadScheme(req.params.id); const body = z.object({ comments: z.string().max(2000).optional() }).parse(req.body); if (!await canApproveRatingScheme(actor, scheme)) throw new HttpError(403, "Only the active battalion commander may approve this scheme");
  const issues = await validateScheme(scheme); if (issues.some((issue) => issue.severity === "ERROR")) throw new HttpError(422, "Approval is blocked by validation errors", "RATING_SCHEME_VALIDATION_FAILED", issues);
  const authority = await currentCommander(scheme.battalionId); const versionHash = createHash("sha256").update(JSON.stringify(scheme.assignments.map(({ id, ratedSoldierId, raterId, intermediateRaterId, seniorRaterId, supplementaryReviewerId, effectiveFrom, effectiveTo }) => ({ id, ratedSoldierId, raterId, intermediateRaterId, seniorRaterId, supplementaryReviewerId, effectiveFrom, effectiveTo })))).digest("hex");
  const updated = await prisma.ratingScheme.update({ where: { id: scheme.id }, data: { status: "APPROVED", approvedByUserId: actor.id, approvedAt: new Date(), approvalAuthorityPositionId: authority!.id, approvalComments: body.comments ?? null, versionHash }, include: schemeInclude }); await audit(req, "RATING_SCHEME_APPROVED", scheme.id, { approvalAuthorityPositionId: authority!.id, versionHash }); res.json(updated);
}));

ratingSchemesRouter.post("/:id/publish", requireAuth, asyncHandler(async (req, res) => {
  const actor = requireUser(req); const scheme = await loadScheme(req.params.id); if (!await canPublishRatingScheme(actor, scheme)) throw new HttpError(403, "Only the active battalion commander may publish this scheme"); if (scheme.effectiveFrom < new Date()) throw new HttpError(422, "Retroactive publication is not allowed", "RETROACTIVE_PUBLICATION_NOT_ALLOWED");
  const publishedAt = new Date(); const updated = await prisma.$transaction(async (tx) => { if (scheme.previousSchemeId) await tx.ratingScheme.update({ where: { id: scheme.previousSchemeId }, data: { status: "SUPERSEDED", effectiveTo: scheme.effectiveFrom } }); await tx.ratingSchemeAssignment.updateMany({ where: { ratingSchemeId: scheme.id }, data: { status: "PUBLISHED", approvedByUserId: scheme.approvedByUserId, approvedAt: scheme.approvedAt, publishedByUserId: actor.id, publishedAt } }); return tx.ratingScheme.update({ where: { id: scheme.id }, data: { status: "PUBLISHED", publishedByUserId: actor.id, publishedAt }, include: schemeInclude }); }); await audit(req, "RATING_SCHEME_PUBLISHED", scheme.id, { effectiveFrom: scheme.effectiveFrom }); res.json(updated);
}));

ratingSchemesRouter.post("/:id/cancel", requireAuth, asyncHandler(async (req, res) => {
  const actor = requireUser(req); const scheme = await loadScheme(req.params.id); if (!["DRAFT", "RETURNED", "PENDING_APPROVAL", "APPROVED"].includes(scheme.status) || !await canManageRatingSchemeDelegates(actor, scheme.battalionId)) throw new HttpError(403, "Only the active battalion commander may cancel an unpublished scheme");
  const updated = await prisma.ratingScheme.update({ where: { id: scheme.id }, data: { status: "CANCELLED" }, include: schemeInclude }); await audit(req, "RATING_SCHEME_CANCELLED", scheme.id); res.json(updated);
}));

ratingSchemesRouter.get("/:id/audit", requireAuth, asyncHandler(async (req, res) => { const actor = requireUser(req); const scheme = await loadScheme(req.params.id); if (!await canViewRatingSchemeAudit(actor, scheme)) throw new HttpError(403, "Audit history is restricted"); res.json(await prisma.auditLog.findMany({ where: { entityType: "RatingScheme", entityId: scheme.id }, include: { actor: { select: { firstName: true, lastName: true, rank: true } } }, orderBy: { createdAt: "desc" } })); }));
ratingSchemesRouter.get("/:id/changes", requireAuth, asyncHandler(async (req, res) => { const actor = requireUser(req); const scheme = await loadScheme(req.params.id); if (!await canViewDraftRatingScheme(actor, scheme)) throw new HttpError(403, "Change details are restricted"); res.json(await prisma.auditLog.findMany({ where: { entityType: "RatingScheme", entityId: scheme.id, action: { startsWith: "RATING_SCHEME_ASSIGNMENT" } }, orderBy: { createdAt: "desc" } })); }));

ratingSchemeDelegationsRouter.get("/", requireAuth, asyncHandler(async (req, res) => { const actor = requireUser(req); const battalionId = String(req.query.battalionId ?? actor.unitId ?? ""); if (!await canManageRatingSchemeDelegates(actor, battalionId)) throw new HttpError(403, "Delegate management is restricted to the active battalion commander"); res.json(await prisma.ratingSchemeDelegation.findMany({ where: { battalionId }, include: { commander: true, delegate: true }, orderBy: { createdAt: "desc" } })); }));
ratingSchemeDelegationsRouter.post("/", requireAuth, asyncHandler(async (req, res) => { const actor = requireUser(req); const body = delegationInput.parse(req.body); const battalionId = body.battalionId ?? actor.unitId; if (!battalionId || !await canManageRatingSchemeDelegates(actor, battalionId)) throw new HttpError(403, "Only the active battalion commander may grant a delegate"); if (body.effectiveTo && body.effectiveTo <= body.effectiveFrom) throw new HttpError(422, "Delegation expiration must follow its effective date"); const delegate = await prisma.user.findUnique({ where: { id: body.delegateUserId } }); if (!delegate || delegate.unitId !== battalionId) throw new HttpError(422, "Delegate must be assigned to this battalion"); const delegation = await prisma.ratingSchemeDelegation.create({ data: { battalionId, commanderUserId: actor.id, delegateUserId: body.delegateUserId, effectiveFrom: body.effectiveFrom, effectiveTo: body.effectiveTo ?? null, permissions: body.permissions, grantedByUserId: actor.id }, include: { delegate: true } }); await prisma.auditLog.create({ data: { actorId: actor.id, action: "RATING_SCHEME_DELEGATION_GRANTED", entityType: "RatingSchemeDelegation", entityId: delegation.id, subjectUserId: body.delegateUserId, metadata: { battalionId, permissions: body.permissions } } }); res.status(201).json(delegation); }));
ratingSchemeDelegationsRouter.post("/:id/revoke", requireAuth, asyncHandler(async (req, res) => { const actor = requireUser(req); const delegation = await prisma.ratingSchemeDelegation.findUnique({ where: { id: req.params.id } }); if (!delegation) throw new HttpError(404, "Rating scheme delegation not found"); if (!await canManageRatingSchemeDelegates(actor, delegation.battalionId)) throw new HttpError(403, "Only the active battalion commander may revoke a delegate"); const revoked = await prisma.ratingSchemeDelegation.update({ where: { id: delegation.id }, data: { status: "REVOKED", revokedByUserId: actor.id, revokedAt: new Date() } }); await prisma.auditLog.create({ data: { actorId: actor.id, action: "RATING_SCHEME_DELEGATION_REVOKED", entityType: "RatingSchemeDelegation", entityId: delegation.id, subjectUserId: delegation.delegateUserId } }); res.json(revoked); }));