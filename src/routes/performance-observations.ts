import { Router } from "express";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { asyncHandler, HttpError } from "@/middleware/error";
import { requireAuth } from "@/middleware/auth";

export const performanceObservationsRouter = Router();

const SECTION_KEYS = ["CHARACTER", "PRESENCE", "INTELLECT", "LEADS", "DEVELOPS", "ACHIEVES"] as const;
const FEEDBACK_TYPES = ["POSITIVE", "DEVELOPMENTAL", "NEUTRAL"] as const;

const observationInput = z.object({
  goalId: z.string().min(1).nullable().optional(),
  sectionKey: z.enum(SECTION_KEYS),
  feedbackType: z.enum(FEEDBACK_TYPES),
  factualNote: z.string().trim().min(1).max(2000),
  tags: z.array(z.string().trim().min(1).max(40)).max(2).default([]),
  occurredAt: z.coerce.date().optional(),
});

const releaseInput = z.object({
  counselingSessionId: z.string().min(1),
});

const counselingSessionInput = z.object({
  type: z.enum(["INITIAL", "QUARTERLY"]).default("QUARTERLY"),
  sessionDate: z.coerce.date().optional(),
  notes: z.string().trim().max(1000).optional(),
  officialRecordReference: z.string().trim().max(500).optional(),
  officialRecordUrl: z.string().url().max(2000).optional(),
});

async function loadForm(formId: string) {
  const form = await prisma.supportForm.findUnique({
    where: { id: formId },
    include: { ratingChain: true, soldier: { select: { id: true, firstName: true, lastName: true, rank: true } } },
  });
  if (!form || !form.ratingChain || form.disposition !== "ACTIVE") {
    throw new HttpError(404, "Support form not found.");
  }
  return form;
}

function requireActor(req: Express.Request) {
  if (!req.user) throw new HttpError(401, "Not authenticated");
  return req.user;
}

function isCurrentRater(actorId: string, form: Awaited<ReturnType<typeof loadForm>>) {
  return actorId === form.ratingChain!.raterId;
}

function canRead(actorId: string, form: Awaited<ReturnType<typeof loadForm>>) {
  return [form.soldierId, form.ratingChain!.raterId, form.ratingChain!.seniorRaterId].includes(actorId);
}

async function audit(input: {
  actorId: string;
  action: string;
  observationId: string;
  supportFormId: string;
  metadata?: Record<string, unknown>;
}) {
  await prisma.auditLog.create({
    data: {
      actorId: input.actorId,
      action: input.action,
      entityType: "PerformanceObservation",
      entityId: input.observationId,
      metadata: { supportFormId: input.supportFormId, ...input.metadata },
    },
  });
}

performanceObservationsRouter.post(
  "/:formId/counseling-sessions",
  requireAuth,
  asyncHandler(async (req, res) => {
    const actor = requireActor(req);
    const form = await loadForm(req.params.formId!);
    if (!isCurrentRater(actor.id, form)) {
      throw new HttpError(403, "Only the assigned rater may record a counseling session.");
    }
    const body = counselingSessionInput.parse(req.body);
    const session = await prisma.counselingSession.create({
      data: {
        ratingChainId: form.ratingChainId!,
        type: body.type,
        sessionDate: body.sessionDate ?? new Date(),
        notes: body.notes ?? null,
        officialRecordReference: body.officialRecordReference ?? null,
        officialRecordUrl: body.officialRecordUrl ?? null,
      },
    });
    await prisma.auditLog.create({
      data: {
        actorId: actor.id,
        action: "COUNSELING_SESSION_RECORDED",
        entityType: "CounselingSession",
        entityId: session.id,
        metadata: { supportFormId: form.id, type: session.type, sessionDate: session.sessionDate.toISOString(), officialRecordReference: session.officialRecordReference, officialRecordUrl: session.officialRecordUrl },
      },
    });
    res.status(201).json(session);
  }),
);

performanceObservationsRouter.get(
  "/:formId/counseling-workspace",
  requireAuth,
  asyncHandler(async (req, res) => {
    const actor = requireActor(req);
    const form = await loadForm(req.params.formId!);
    if (!canRead(actor.id, form)) throw new HttpError(403, "You are not authorized to view this counseling workspace.");

    const sessions = await prisma.counselingSession.findMany({
      where: { ratingChainId: form.ratingChainId! },
      orderBy: { sessionDate: "desc" },
    });
    const requestedSessionId = typeof req.query.sessionId === "string" ? req.query.sessionId : undefined;
    const currentSession = requestedSessionId
      ? sessions.find((session) => session.id === requestedSessionId) ?? null
      : sessions[0] ?? null;
    if (requestedSessionId && !currentSession) {
      throw new HttpError(404, "Counseling session not found for this rating relationship.");
    }
    const priorSession = currentSession
      ? sessions.filter((session) => session.sessionDate < currentSession.sessionDate)[0] ?? null
      : null;
    const periodStart = priorSession?.sessionDate ?? form.ratingPeriodStart;
    const periodEnd = currentSession?.sessionDate ?? new Date();
    const soldierView = actor.id === form.soldierId;

    const [goals, entries, observations] = await Promise.all([
      prisma.goal.findMany({
        where: { supportFormId: form.id, approvalStatus: "APPROVED" },
        include: {
          linkedEntries: { include: { supportFormEntry: { include: { artifacts: true } } } },
          counselingDiscussions: currentSession ? { where: { counselingSessionId: currentSession.id } } : false,
        },
        orderBy: [{ sectionKey: "asc" }, { createdAt: "asc" }],
      }),
      prisma.supportFormEntry.findMany({
        where: {
          supportFormId: form.id,
          entryDate: { gt: periodStart, lte: periodEnd },
        },
        include: { artifacts: true, goalLinks: { include: { goal: { select: { id: true, title: true } } } } },
        orderBy: { entryDate: "desc" },
      }),
      prisma.performanceObservation.findMany({
        where: {
          supportFormId: form.id,
          occurredAt: { gt: periodStart, lte: periodEnd },
          ...(soldierView ? { releaseState: "RELEASED_IN_COUNSELING" } : {}),
        },
        include: {
          observer: { select: { id: true, firstName: true, lastName: true, rank: true } },
          goal: { select: { id: true, title: true, description: true } },
          discussedInCounselingSession: { select: { id: true, type: true, sessionDate: true } },
        },
        orderBy: { occurredAt: "desc" },
      }),
    ]);

    const approvedGoalCount = goals.length;
    res.json({
      currentSession,
      priorSession,
      sessions,
      periodStart,
      periodEnd,
      goals,
      entries,
      observations,
      canManage: isCurrentRater(actor.id, form),
      focusAdvisory: approvedGoalCount < 3 || approvedGoalCount > 5
        ? { approvedGoalCount, message: "Focus works best with 3-5 approved active goals. This is advisory and never blocks the rating workflow." }
        : null,
    });
  }),
);

performanceObservationsRouter.get(
  "/:formId/observations",
  requireAuth,
  asyncHandler(async (req, res) => {
    const actor = requireActor(req);
    const form = await loadForm(req.params.formId!);
    if (!canRead(actor.id, form)) throw new HttpError(403, "You are not authorized to view performance observations.");

    const soldierView = actor.id === form.soldierId;
    const observations = await prisma.performanceObservation.findMany({
      where: {
        supportFormId: form.id,
        ...(soldierView ? { releaseState: "RELEASED_IN_COUNSELING" } : {}),
      },
      include: {
        observer: { select: { id: true, firstName: true, lastName: true, rank: true } },
        goal: { select: { id: true, title: true, description: true, approvalStatus: true } },
        discussedInCounselingSession: { select: { id: true, type: true, sessionDate: true } },
      },
      orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
    });
    res.json({ observations, visibility: soldierView ? "COUNSELING_RELEASED_ONLY" : "RATER_VIEW" });
  }),
);

performanceObservationsRouter.post(
  "/:formId/observations",
  requireAuth,
  asyncHandler(async (req, res) => {
    const actor = requireActor(req);
    const form = await loadForm(req.params.formId!);
    if (!isCurrentRater(actor.id, form)) {
      throw new HttpError(403, "Only the assigned rater may record a performance observation.");
    }
    const body = observationInput.parse(req.body);

    if (body.goalId) {
      const goal = await prisma.goal.findFirst({
        where: { id: body.goalId, supportFormId: form.id, approvalStatus: "APPROVED" },
        select: { id: true },
      });
      if (!goal) throw new HttpError(422, "Observation goals must be approved goals on this support form.");
    }

    const observation = await prisma.performanceObservation.create({
      data: {
        supportFormId: form.id,
        ratedSoldierId: form.soldierId,
        observerId: actor.id,
        goalId: body.goalId ?? null,
        sectionKey: body.sectionKey,
        feedbackType: body.feedbackType,
        factualNote: body.factualNote,
        tags: body.tags,
        occurredAt: body.occurredAt ?? new Date(),
      },
      include: {
        observer: { select: { id: true, firstName: true, lastName: true, rank: true } },
        goal: { select: { id: true, title: true, description: true, approvalStatus: true } },
      },
    });
    await audit({
      actorId: actor.id,
      action: "PERFORMANCE_OBSERVATION_RECORDED",
      observationId: observation.id,
      supportFormId: form.id,
      metadata: { feedbackType: observation.feedbackType, sectionKey: observation.sectionKey, goalId: observation.goalId },
    });
    res.status(201).json(observation);
  }),
);

performanceObservationsRouter.patch(
  "/:formId/observations/:observationId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const actor = requireActor(req);
    const form = await loadForm(req.params.formId!);
    if (!isCurrentRater(actor.id, form)) {
      throw new HttpError(403, "Only the assigned rater may edit a performance observation.");
    }
    const observation = await prisma.performanceObservation.findFirst({
      where: { id: req.params.observationId!, supportFormId: form.id, observerId: actor.id },
    });
    if (!observation) throw new HttpError(404, "Performance observation not found.");
    const body = observationInput.partial().parse(req.body);

    if (body.goalId) {
      const goal = await prisma.goal.findFirst({
        where: { id: body.goalId, supportFormId: form.id, approvalStatus: "APPROVED" },
        select: { id: true },
      });
      if (!goal) throw new HttpError(422, "Observation goals must be approved goals on this support form.");
    }

    const updated = await prisma.performanceObservation.update({
      where: { id: observation.id },
      data: {
        ...body,
        ...(body.goalId === null ? { goalId: null } : {}),
        lastEditedAt: new Date(),
        lastEditedById: actor.id,
      },
      include: {
        observer: { select: { id: true, firstName: true, lastName: true, rank: true } },
        goal: { select: { id: true, title: true, description: true, approvalStatus: true } },
      },
    });
    await audit({ actorId: actor.id, action: "PERFORMANCE_OBSERVATION_EDITED", observationId: observation.id, supportFormId: form.id, metadata: { fields: Object.keys(body) } });
    res.json(updated);
  }),
);

performanceObservationsRouter.delete(
  "/:formId/observations/:observationId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const actor = requireActor(req);
    const form = await loadForm(req.params.formId!);
    if (!isCurrentRater(actor.id, form)) {
      throw new HttpError(403, "Only the assigned rater may delete a performance observation.");
    }
    const observation = await prisma.performanceObservation.findFirst({
      where: { id: req.params.observationId!, supportFormId: form.id, observerId: actor.id },
    });
    if (!observation) throw new HttpError(404, "Performance observation not found.");
    await prisma.performanceObservation.delete({ where: { id: observation.id } });
    await audit({ actorId: actor.id, action: "PERFORMANCE_OBSERVATION_DELETED", observationId: observation.id, supportFormId: form.id });
    res.status(204).end();
  }),
);

performanceObservationsRouter.post(
  "/:formId/observations/:observationId/release",
  requireAuth,
  asyncHandler(async (req, res) => {
    const actor = requireActor(req);
    const form = await loadForm(req.params.formId!);
    if (!isCurrentRater(actor.id, form)) {
      throw new HttpError(403, "Only the assigned rater may release an observation through counseling.");
    }
    const observation = await prisma.performanceObservation.findFirst({
      where: { id: req.params.observationId!, supportFormId: form.id, observerId: actor.id },
    });
    if (!observation) throw new HttpError(404, "Performance observation not found.");
    const body = releaseInput.parse(req.body);
    const session = await prisma.counselingSession.findFirst({
      where: { id: body.counselingSessionId, ratingChainId: form.ratingChainId! },
    });
    if (!session) throw new HttpError(422, "Counseling session does not belong to this rating relationship.");

    const released = await prisma.performanceObservation.update({
      where: { id: observation.id },
      data: {
        releaseState: "RELEASED_IN_COUNSELING",
        discussedAt: new Date(),
        discussedInCounselingSessionId: session.id,
      },
      include: { discussedInCounselingSession: { select: { id: true, type: true, sessionDate: true } } },
    });
    await audit({
      actorId: actor.id,
      action: "PERFORMANCE_OBSERVATION_RELEASED_IN_COUNSELING",
      observationId: observation.id,
      supportFormId: form.id,
      metadata: { counselingSessionId: session.id, counselingDate: session.sessionDate.toISOString() },
    });
    res.json(released);
  }),
);
