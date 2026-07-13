import { Router } from "express";
import { z } from "zod";
import {
  DelegationCapability,
  DelegationStatus,
  DelegationType,
  type Delegate,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { asyncHandler, HttpError } from "@/middleware/error";
import { requireAuth } from "@/middleware/auth";
import { notify } from "@/lib/notifications/create";

export const accessGrantsRouter = Router();

const capabilitySchema = z.nativeEnum(DelegationCapability);
const delegationTypeSchema = z.nativeEnum(DelegationType);

const personalCapabilities = new Set<DelegationCapability>([
  "VIEW_WORKFLOW_STATUS",
  "VIEW_SUPPORT_FORM",
  "ADD_DRAFT_SUPPORT_ENTRY",
  "EDIT_OWN_DRAFT_SUPPORT_ENTRY",
  "UPLOAD_ARTIFACT",
  "ORGANIZE_ARTIFACT",
  "REQUEST_SOLDIER_REVIEW",
  "SEND_WORKFLOW_REMINDER",
  "ADD_NON_EVALUATIVE_COMMENT",
]);
const ratingOfficialCapabilities = new Set<DelegationCapability>([
  "VIEW_WORKFLOW_STATUS",
  "VIEW_ADMINISTRATIVE_DATA",
  "RESPOND_TO_ADMIN_RETURN",
  "SEND_WORKFLOW_REMINDER",
  "ADD_NON_EVALUATIVE_COMMENT",
  "REQUEST_RATER_REVIEW",
  "DOWNLOAD_WORKING_COPY",
]);
const servicingAdminCapabilities = new Set<DelegationCapability>([
  "VIEW_WORKFLOW_STATUS",
  "VIEW_ADMINISTRATIVE_DATA",
  "VIEW_SUPPORT_FORM",
  "VIEW_PERMITTED_EVALUATION_DATA",
  "COMPLETE_ADMINISTRATIVE_FIELD",
  "RESPOND_TO_ADMIN_RETURN",
  "SEND_WORKFLOW_REMINDER",
  "DOWNLOAD_WORKING_COPY",
  "ADD_NON_EVALUATIVE_COMMENT",
]);

const createGrantSchema = z.object({
  delegateUserId: z.string().min(1),
  delegationType: delegationTypeSchema,
  evaluationId: z.string().min(1).optional(),
  supportFormId: z.string().min(1).optional(),
  ratingAssignmentId: z.string().min(1).optional(),
  unitId: z.string().min(1).optional(),
  effectiveFrom: z.coerce.date().optional(),
  effectiveTo: z.coerce.date(),
  justification: z.string().max(1000).optional(),
  capabilities: z.array(capabilitySchema).min(1).max(15),
});

const updateGrantSchema = z.object({
  effectiveTo: z.coerce.date().optional(),
  capabilities: z.array(capabilitySchema).min(1).optional(),
  justification: z.string().max(1000).optional(),
});

function displayName(user: { rank: string; firstName: string; lastName: string }) {
  return `${user.rank} ${user.firstName} ${user.lastName}`;
}

function allowedCapabilities(type: DelegationType) {
  if (type === "PERSONAL_ASSISTANT") return personalCapabilities;
  if (type === "RATING_OFFICIAL_ASSISTANT") return ratingOfficialCapabilities;
  return servicingAdminCapabilities;
}

async function resolveScope(input: z.infer<typeof createGrantSchema>, grantor: { id: string; roles: string[] }) {
  const suppliedScopeCount = [input.evaluationId, input.supportFormId, input.ratingAssignmentId, input.unitId]
    .filter(Boolean).length;
  if (suppliedScopeCount !== 1) {
    throw new HttpError(422, "Access grants must be scoped to exactly one evaluation, support form, rating assignment, or unit.", "DELEGATION_SCOPE_MISMATCH");
  }

  if (input.evaluationId) {
    const evaluation = await prisma.evaluation.findUnique({
      where: { id: input.evaluationId },
      include: { ratingChain: true },
    });
    if (!evaluation || evaluation.disposition !== "ACTIVE") throw new HttpError(404, "Evaluation not found.");
    return {
      subjectUserId: evaluation.ratingChain.ratedSoldierId,
      evaluationId: evaluation.id,
      maximumEnd: evaluation.periodEnd,
      directOfficial: [evaluation.ratingChain.raterId, evaluation.ratingChain.seniorRaterId].includes(grantor.id),
    };
  }

  if (input.supportFormId) {
    const form = await prisma.supportForm.findUnique({
      where: { id: input.supportFormId },
      include: { ratingChain: true },
    });
    if (!form || form.disposition !== "ACTIVE" || !form.ratingChain) throw new HttpError(404, "Support form not found.");
    return {
      subjectUserId: form.soldierId,
      supportFormId: form.id,
      ratingAssignmentId: form.ratingSchemeAssignmentId ?? undefined,
      maximumEnd: form.ratingPeriodEnd ?? undefined,
      directOfficial: [form.ratingChain.raterId, form.ratingChain.seniorRaterId].includes(grantor.id),
    };
  }

  if (input.ratingAssignmentId) {
    const assignment = await prisma.ratingSchemeAssignment.findUnique({ where: { id: input.ratingAssignmentId } });
    if (!assignment || assignment.status !== "PUBLISHED") throw new HttpError(404, "Published rating assignment not found.");
    return {
      subjectUserId: assignment.ratedSoldierId,
      ratingAssignmentId: assignment.id,
      maximumEnd: assignment.effectiveTo ?? undefined,
      directOfficial: [assignment.raterId, assignment.seniorRaterId].includes(grantor.id),
    };
  }

  if (!grantor.roles.includes("ADMIN")) throw new HttpError(403, "Only an administrator may create a unit administrative assignment.", "DELEGATION_GRANTOR_NOT_AUTHORIZED");
  const unit = await prisma.unit.findUnique({ where: { id: input.unitId! } });
  if (!unit) throw new HttpError(404, "Unit not found.");
  return { subjectUserId: grantor.id, unitId: unit.id, directOfficial: false, maximumEnd: undefined };
}

function serializeGrant(grant: Delegate & {
  delegateUser?: { id: string; firstName: string; lastName: string; rank: string; email: string };
  grantor?: { id: string; firstName: string; lastName: string; rank: string; email: string } | null;
  subject?: { id: string; firstName: string; lastName: string; rank: string; email: string } | null;
  capabilities?: { capability: DelegationCapability }[];
}) {
  return {
    id: grant.id,
    type: grant.delegationType,
    status: grant.status,
    person: grant.delegateUser ? { id: grant.delegateUser.id, displayName: displayName(grant.delegateUser), email: grant.delegateUser.email } : null,
    grantor: grant.grantor ? { id: grant.grantor.id, displayName: displayName(grant.grantor), email: grant.grantor.email } : null,
    subject: grant.subject ? { id: grant.subject.id, displayName: displayName(grant.subject), email: grant.subject.email } : null,
    scope: { evaluationId: grant.evaluationId, supportFormId: grant.supportFormId, ratingAssignmentId: grant.ratingAssignmentId, unitId: grant.unitId },
    capabilities: grant.capabilities?.map((item) => item.capability) ?? [],
    effectiveFrom: grant.effectiveFrom,
    effectiveTo: grant.effectiveTo,
    justification: grant.justification,
    requiresReview: grant.requiresReview,
    acceptedAt: grant.acceptedAt,
    revokedAt: grant.revokedAt,
    canRevoke: grant.status === "ACTIVE" || grant.status === "PENDING",
  };
}

const grantInclude = {
  delegateUser: { select: { id: true, firstName: true, lastName: true, rank: true, email: true } },
  grantor: { select: { id: true, firstName: true, lastName: true, rank: true, email: true } },
  subject: { select: { id: true, firstName: true, lastName: true, rank: true, email: true } },
  capabilities: { select: { capability: true } },
} as const;

// GET /api/access-grants?view=helping-me|i-assist&status=active
accessGrantsRouter.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.user) throw new HttpError(401, "Not authenticated");
    const view = req.query.view === "i-assist" ? "i-assist" : "helping-me";
    const requestedStatus = typeof req.query.status === "string" ? req.query.status.toUpperCase() : undefined;
    const status = requestedStatus && Object.values(DelegationStatus).includes(requestedStatus as DelegationStatus)
      ? requestedStatus as DelegationStatus
      : undefined;
    const where = {
      ...(view === "i-assist" ? { delegateUserId: req.user.id } : { grantorUserId: req.user.id }),
      ...(status ? { status } : {}),
    };
    const grants = await prisma.delegate.findMany({ where, include: grantInclude, orderBy: { createdAt: "desc" } });
    res.json({ view, grants: grants.map(serializeGrant) });
  }),
);

// GET /api/access-grants/eligible-users?query=
accessGrantsRouter.get(
  "/eligible-users",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.user) throw new HttpError(401, "Not authenticated");
    const query = typeof req.query.query === "string" ? req.query.query.trim().slice(0, 80) : "";
    if (query.length < 2) return res.json({ users: [] });
    const users = await prisma.user.findMany({
      where: {
        id: { not: req.user.id },
        ...(req.user.unitId ? { unitId: req.user.unitId } : {}),
        OR: [
          { email: { contains: query, mode: "insensitive" } },
          { firstName: { contains: query, mode: "insensitive" } },
          { lastName: { contains: query, mode: "insensitive" } },
        ],
      },
      select: { id: true, firstName: true, lastName: true, rank: true, email: true, unit: { select: { name: true } } },
      take: 12,
      orderBy: { lastName: "asc" },
    });
    res.json({ users: users.map((user) => ({ ...user, displayName: displayName(user) })) });
  }),
);

// POST /api/access-grants
accessGrantsRouter.post(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.user) throw new HttpError(401, "Not authenticated");
    const body = createGrantSchema.parse(req.body);
    if (body.delegateUserId === req.user.id) throw new HttpError(422, "A person cannot grant assistance to themselves.");
    const delegate = await prisma.user.findUnique({ where: { id: body.delegateUserId } });
    if (!delegate) throw new HttpError(404, "Eligible user not found.");

    const scope = await resolveScope(body, req.user);
    const allowed = allowedCapabilities(body.delegationType);
    if (body.capabilities.some((capability) => !allowed.has(capability))) {
      throw new HttpError(422, "One or more requested capabilities are not delegable for this assistance type.", "DELEGATION_ACTION_NONDELEGABLE");
    }
    if (body.delegationType === "PERSONAL_ASSISTANT" && scope.subjectUserId !== req.user.id) {
      throw new HttpError(403, "A personal assistant can only be appointed by the assisted person.", "DELEGATION_GRANTOR_NOT_AUTHORIZED");
    }
    if (body.delegationType === "RATING_OFFICIAL_ASSISTANT" && !scope.directOfficial) {
      throw new HttpError(403, "Only the assigned rater or senior rater may appoint a rating-official assistant.", "DELEGATION_GRANTOR_NOT_AUTHORIZED");
    }
    if (body.delegationType === "SERVICING_ADMIN_ASSIGNMENT" && !req.user.roles.includes("ADMIN")) {
      throw new HttpError(403, "Only an administrator may create an administrative assistance assignment.", "DELEGATION_GRANTOR_NOT_AUTHORIZED");
    }

    const effectiveFrom = body.effectiveFrom ?? new Date();
    if (body.effectiveTo <= effectiveFrom) throw new HttpError(422, "Expiration must be after the effective date.");
    if (scope.maximumEnd && body.effectiveTo > scope.maximumEnd) {
      throw new HttpError(422, "Access cannot extend beyond the scoped rating period or assignment.");
    }

    const grant = await prisma.delegate.create({
      data: {
        principalId: req.user.id,
        delegateUserId: delegate.id,
        accessLevel: "VIEW_ONLY",
        effectiveDate: effectiveFrom,
        expiryDate: body.effectiveTo,
        isActive: false,
        appointedReason: body.justification ?? null,
        grantorUserId: req.user.id,
        subjectUserId: scope.subjectUserId,
        delegationType: body.delegationType,
        status: "PENDING",
        effectiveFrom,
        effectiveTo: body.effectiveTo,
        evaluationId: scope.evaluationId,
        supportFormId: scope.supportFormId,
        ratingAssignmentId: scope.ratingAssignmentId,
        unitId: scope.unitId,
        justification: body.justification ?? null,
        createdByUserId: req.user.id,
        capabilities: { create: body.capabilities.map((capability) => ({ capability })) },
      },
      include: grantInclude,
    });
    await prisma.auditLog.create({
      data: {
        actorId: req.user.id,
        subjectUserId: scope.subjectUserId,
        delegationGrantId: grant.id,
        action: "ACCESS_GRANT_CREATED",
        entityType: "DelegationGrant",
        entityId: grant.id,
        metadata: { delegationType: body.delegationType, capabilities: body.capabilities },
      },
    });
    await notify({
      userId: delegate.id,
      category: "DELEGATE",
      title: "Access and Assistance Invitation",
      message: `${displayName(req.user)} requested your assistance. Review the scoped access grant before accepting.`,
      actionUrl: "/access-assistance?view=i-assist",
      actionLabel: "Review invitation",
      evaluationId: scope.evaluationId,
    });
    res.status(201).json(serializeGrant(grant));
  }),
);

accessGrantsRouter.get(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.user) throw new HttpError(401, "Not authenticated");
    const grant = await prisma.delegate.findUnique({ where: { id: req.params.id }, include: grantInclude });
    if (!grant) throw new HttpError(404, "Access grant not found.");
    const authorized = req.user.roles.includes("ADMIN") || [grant.grantorUserId, grant.delegateUserId, grant.subjectUserId].includes(req.user.id);
    if (!authorized) throw new HttpError(404, "Access grant not found.");
    res.json(serializeGrant(grant));
  }),
);

async function transitionInvitation(id: string, actorId: string, status: DelegationStatus) {
  const grant = await prisma.delegate.findUnique({ where: { id }, include: grantInclude });
  if (!grant) throw new HttpError(404, "Access grant not found.");
  if (grant.delegateUserId !== actorId) throw new HttpError(403, "Only the invited person may respond to this grant.");
  if (grant.status !== "PENDING") throw new HttpError(409, "This access grant is no longer pending.");
  if (!grant.effectiveFrom || !grant.effectiveTo || grant.effectiveTo <= new Date()) {
    throw new HttpError(409, "This access grant is no longer within its effective period.", "DELEGATION_EXPIRED");
  }
  const updated = await prisma.delegate.update({
    where: { id },
    data: { status, isActive: status === "ACTIVE", acceptedAt: status === "ACTIVE" ? new Date() : null },
    include: grantInclude,
  });
  await prisma.auditLog.create({
    data: {
      actorId,
      subjectUserId: grant.subjectUserId,
      delegationGrantId: grant.id,
      action: status === "ACTIVE" ? "ACCESS_GRANT_ACCEPTED" : "ACCESS_GRANT_DECLINED",
      entityType: "DelegationGrant",
      entityId: grant.id,
    },
  });
  if (grant.grantorUserId) {
    await notify({
      userId: grant.grantorUserId,
      category: "DELEGATE",
      title: status === "ACTIVE" ? "Access and Assistance Accepted" : "Access and Assistance Declined",
      message: status === "ACTIVE" ? "Your scoped assistance invitation was accepted." : "Your scoped assistance invitation was declined.",
      actionUrl: "/access-assistance?view=helping-me",
      actionLabel: "View access grants",
      evaluationId: grant.evaluationId ?? undefined,
    });
  }
  return updated;
}

accessGrantsRouter.post("/:id/accept", requireAuth, asyncHandler(async (req, res) => {
  if (!req.user) throw new HttpError(401, "Not authenticated");
  res.json(serializeGrant(await transitionInvitation(req.params.id!, req.user.id, "ACTIVE")));
}));

accessGrantsRouter.post("/:id/decline", requireAuth, asyncHandler(async (req, res) => {
  if (!req.user) throw new HttpError(401, "Not authenticated");
  res.json(serializeGrant(await transitionInvitation(req.params.id!, req.user.id, "DECLINED")));
}));

accessGrantsRouter.post(
  "/:id/revoke",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.user) throw new HttpError(401, "Not authenticated");
    const reason = z.object({ reason: z.string().max(1000).optional() }).parse(req.body).reason;
    const grant = await prisma.delegate.findUnique({ where: { id: req.params.id }, include: grantInclude });
    if (!grant) throw new HttpError(404, "Access grant not found.");
    const authorized = req.user.roles.includes("ADMIN") || [grant.grantorUserId, grant.subjectUserId].includes(req.user.id);
    if (!authorized) throw new HttpError(403, "You are not authorized to revoke this grant.");
    const updated = await prisma.delegate.update({
      where: { id: grant.id },
      data: { status: "REVOKED", isActive: false, revokedAt: new Date(), revokedByUserId: req.user.id, revocationReason: reason ?? null },
      include: grantInclude,
    });
    await prisma.auditLog.create({
      data: { actorId: req.user.id, subjectUserId: grant.subjectUserId, delegationGrantId: grant.id, action: "ACCESS_GRANT_REVOKED", entityType: "DelegationGrant", entityId: grant.id, metadata: { reason } },
    });
    await notify({ userId: grant.delegateUserId, category: "DELEGATE", title: "Access and Assistance Revoked", message: "Your scoped assistance access was revoked.", actionUrl: "/access-assistance?view=i-assist", actionLabel: "View access grants", evaluationId: grant.evaluationId ?? undefined });
    res.json(serializeGrant(updated));
  }),
);

accessGrantsRouter.patch(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.user) throw new HttpError(401, "Not authenticated");
    const changes = updateGrantSchema.parse(req.body);
    const grant = await prisma.delegate.findUnique({ where: { id: req.params.id }, include: { capabilities: true } });
    if (!grant) throw new HttpError(404, "Access grant not found.");
    if (grant.grantorUserId !== req.user.id && !req.user.roles.includes("ADMIN")) throw new HttpError(403, "Forbidden");
    const existing = new Set(grant.capabilities.map((item) => item.capability));
    if (changes.capabilities && changes.capabilities.some((capability) => !existing.has(capability))) {
      throw new HttpError(409, "Increasing access requires a new grant and delegate acceptance.");
    }
    if (changes.effectiveTo && grant.effectiveTo && changes.effectiveTo > grant.effectiveTo) {
      throw new HttpError(409, "Extending access requires a new grant and delegate acceptance.");
    }
    const updated = await prisma.$transaction(async (transaction) => {
      if (changes.capabilities) {
        await transaction.delegationCapabilityGrant.deleteMany({ where: { delegationGrantId: grant.id, capability: { notIn: changes.capabilities } } });
      }
      return transaction.delegate.update({
        where: { id: grant.id },
        data: { effectiveTo: changes.effectiveTo, justification: changes.justification },
        include: grantInclude,
      });
    });
    await prisma.auditLog.create({
      data: {
        actorId: req.user.id,
        subjectUserId: grant.subjectUserId,
        delegationGrantId: grant.id,
        action: "ACCESS_GRANT_REDUCED",
        entityType: "DelegationGrant",
        entityId: grant.id,
        metadata: { capabilities: changes.capabilities, effectiveTo: changes.effectiveTo?.toISOString() },
      },
    });
    await notify({
      userId: grant.delegateUserId,
      category: "DELEGATE",
      title: "Access and Assistance Updated",
      message: "A scoped assistance grant was reduced or shortened. Review the remaining access before continuing work.",
      actionUrl: "/access-assistance?view=i-assist",
      actionLabel: "View access grant",
      evaluationId: grant.evaluationId ?? undefined,
    });
    res.json(serializeGrant(updated));
  }),
);

accessGrantsRouter.get(
  "/:id/activity",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.user) throw new HttpError(401, "Not authenticated");
    const grant = await prisma.delegate.findUnique({ where: { id: req.params.id } });
    if (!grant) throw new HttpError(404, "Access grant not found.");
    if (!req.user.roles.includes("ADMIN") && ![grant.grantorUserId, grant.delegateUserId, grant.subjectUserId].includes(req.user.id)) {
      throw new HttpError(404, "Access grant not found.");
    }
    const activity = await prisma.auditLog.findMany({
      where: { delegationGrantId: grant.id },
      include: { actor: { select: { id: true, firstName: true, lastName: true, rank: true } } },
      orderBy: { createdAt: "desc" },
    });
    res.json({ activity });
  }),
);
