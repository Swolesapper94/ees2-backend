import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { asyncHandler, HttpError } from "@/middleware/error";
import { requireAuth, requirePlatformAdministrator } from "@/middleware/auth";

export const pilotMetricsRouter = Router();

const DEFAULT_PILOT_ID = "MERIT_MOBILE_PILOT";
const WORKFLOW_TYPES = ["SOLDIER_ENTRY", "RATER_OBSERVATION"] as const;
const EVENT_TYPES = [
  "WORKFLOW_STARTED",
  "EVIDENCE_STEP_REACHED",
  "WORKFLOW_COMPLETED",
  "WORKFLOW_FAILED",
  "DRAFT_RECOVERED",
] as const;
const DIMENSIONS = ["CHARACTER", "PRESENCE", "INTELLECT", "LEADS", "DEVELOPS", "ACHIEVES"] as const;

const eventInput = z.object({
  clientEventId: z.string().uuid(),
  pilotId: z.literal(DEFAULT_PILOT_ID).default(DEFAULT_PILOT_ID),
  workflowId: z.string().trim().min(8).max(100),
  workflowType: z.enum(WORKFLOW_TYPES),
  eventType: z.enum(EVENT_TYPES),
  durationMs: z.number().int().min(0).max(86_400_000).optional(),
  hasEvidence: z.boolean().optional(),
  evidenceCount: z.number().int().min(0).max(3).optional(),
  occurredAt: z.coerce.date(),
}).superRefine((value, context) => {
  if (value.occurredAt.getTime() > Date.now() + 5 * 60 * 1000) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["occurredAt"], message: "Pilot events cannot be dated in the future." });
  }
  if (value.evidenceCount !== undefined && value.hasEvidence !== (value.evidenceCount > 0)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["evidenceCount"], message: "Evidence fields are inconsistent." });
  }
  if (["WORKFLOW_COMPLETED", "WORKFLOW_FAILED"].includes(value.eventType) && value.durationMs === undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["durationMs"], message: "Completed and failed workflows require a duration." });
  }
});

const summaryQuery = z.object({
  pilotId: z.literal(DEFAULT_PILOT_ID).default(DEFAULT_PILOT_ID),
  days: z.coerce.number().int().min(7).max(365).default(30),
  unitId: z.string().trim().min(1).optional(),
});

function requireActor(req: Express.Request) {
  if (!req.user) throw new HttpError(401, "Not authenticated");
  return req.user;
}

async function descendantUnitIds(rootUnitId: string) {
  const units = await prisma.unit.findMany({ select: { id: true, parentId: true } });
  if (!units.some((unit) => unit.id === rootUnitId)) throw new HttpError(404, "Command unit not found.");
  const childrenByParent = new Map<string, string[]>();
  for (const unit of units) {
    if (!unit.parentId) continue;
    const children = childrenByParent.get(unit.parentId) ?? [];
    children.push(unit.id);
    childrenByParent.set(unit.parentId, children);
  }
  const result: string[] = [];
  const queue = [rootUnitId];
  const visited = new Set<string>();
  while (queue.length) {
    const unitId = queue.shift()!;
    if (visited.has(unitId)) continue;
    visited.add(unitId);
    result.push(unitId);
    queue.push(...(childrenByParent.get(unitId) ?? []));
  }
  return result;
}

function percent(numerator: number, denominator: number) {
  return denominator > 0 ? Math.round((numerator / denominator) * 100) : 0;
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[middle]!;
  return Math.round((sorted[middle - 1]! + sorted[middle]!) / 2);
}

function weekStart(date: Date) {
  const result = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const mondayOffset = (result.getUTCDay() + 6) % 7;
  result.setUTCDate(result.getUTCDate() - mondayOffset);
  return result;
}

function weekKey(date: Date) {
  return weekStart(date).toISOString().slice(0, 10);
}

// POST /api/pilot-metrics/events — append-only, content-free workflow telemetry.
pilotMetricsRouter.post(
  "/events",
  requireAuth,
  asyncHandler(async (req, res) => {
    const actor = requireActor(req);
    if (!actor.unitId) throw new HttpError(422, "A unit assignment is required for pilot measurement.");
    if (req.get("X-MERIT-CLIENT") !== "mobile") {
      throw new HttpError(422, "This pilot event endpoint accepts MERIT Mobile events only.");
    }
    const body = eventInput.parse(req.body);
    const existing = await prisma.pilotMetricEvent.findUnique({ where: { clientEventId: body.clientEventId } });
    if (existing) {
      if (existing.actorId !== actor.id || existing.workflowId !== body.workflowId) {
        throw new HttpError(409, "This pilot event identifier is already in use.");
      }
      res.json(existing);
      return;
    }
    const existingMilestone = await prisma.pilotMetricEvent.findUnique({
      where: {
        actorId_workflowId_eventType: {
          actorId: actor.id,
          workflowId: body.workflowId,
          eventType: body.eventType,
        },
      },
    });
    if (existingMilestone) {
      res.json(existingMilestone);
      return;
    }
    if (body.eventType === "WORKFLOW_COMPLETED") {
      const domainRecord = body.workflowType === "SOLDIER_ENTRY"
        ? await prisma.supportFormEntry.findFirst({
            where: { clientRequestId: body.workflowId, createdByUserId: actor.id, submissionSource: "MOBILE_CAPTURE", withdrawnAt: null },
            select: { id: true },
          })
        : await prisma.performanceObservation.findFirst({
            where: { clientRequestId: body.workflowId, observerId: actor.id, captureSource: "MOBILE_CAPTURE" },
            select: { id: true },
          });
      if (!domainRecord) throw new HttpError(409, "A completed workflow must match a saved MERIT Mobile record.");
    }

    try {
      const event = await prisma.pilotMetricEvent.create({
        data: {
          ...body,
          actorId: actor.id,
          unitId: actor.unitId,
          client: "MERIT_MOBILE",
        },
      });
      res.status(201).json(event);
    } catch (cause) {
      if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === "P2002") {
        const racedEvent = await prisma.pilotMetricEvent.findFirst({
          where: {
            OR: [
              { clientEventId: body.clientEventId },
              { actorId: actor.id, workflowId: body.workflowId, eventType: body.eventType },
            ],
          },
        });
        if (racedEvent?.actorId === actor.id && racedEvent.workflowId === body.workflowId) {
          res.json(racedEvent);
          return;
        }
      }
      throw cause;
    }
  }),
);

// GET /api/pilot-metrics/summary — platform-administrator aggregate only. No names,
// individual rankings, accomplishment text, evidence, or rating content.
pilotMetricsRouter.get(
  "/summary",
  requireAuth,
  requirePlatformAdministrator,
  asyncHandler(async (req, res) => {
    requireActor(req);
    const { pilotId, days, unitId } = summaryQuery.parse(req.query);
    const unitIds = unitId
      ? await descendantUnitIds(unitId)
      : (await prisma.unit.findMany({ select: { id: true } })).map((unit) => unit.id);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [events, entries, observations] = await Promise.all([
      prisma.pilotMetricEvent.findMany({
        where: { pilotId, unitId: { in: unitIds }, occurredAt: { gte: since } },
        select: { actorId: true, workflowId: true, workflowType: true, eventType: true, durationMs: true, occurredAt: true },
      }),
      prisma.supportFormEntry.findMany({
        where: {
          submissionSource: "MOBILE_CAPTURE",
          createdAt: { gte: since },
          withdrawnAt: null,
          supportForm: { soldier: { unitId: { in: unitIds } } },
        },
        select: {
          id: true,
          createdAt: true,
          section: true,
          confirmationStatus: true,
          confirmedAt: true,
          usedInEvalId: true,
          artifacts: { select: { id: true } },
          goalLinks: { select: { id: true } },
        },
      }),
      prisma.performanceObservation.findMany({
        where: {
          captureSource: "MOBILE_CAPTURE",
          createdAt: { gte: since },
          ratedSoldier: { unitId: { in: unitIds } },
        },
        select: {
          id: true,
          createdAt: true,
          sectionKey: true,
          feedbackType: true,
          goalId: true,
          releaseState: true,
        },
      }),
    ]);

    const startedWorkflows = new Set(events.filter((event) => event.eventType === "WORKFLOW_STARTED").map((event) => event.workflowId));
    const completionByWorkflow = new Map<string, (typeof events)[number]>();
    for (const event of events) {
      if (event.eventType === "WORKFLOW_COMPLETED" && !completionByWorkflow.has(event.workflowId)) {
        completionByWorkflow.set(event.workflowId, event);
      }
    }
    const completedEvents = [...completionByWorkflow.values()];
    const completedWorkflows = new Set(completedEvents.map((event) => event.workflowId));
    const failedWorkflows = new Set(events.filter((event) => event.eventType === "WORKFLOW_FAILED").map((event) => event.workflowId));
    const completedStartedWorkflows = [...completedWorkflows].filter((workflowId) => startedWorkflows.has(workflowId)).length;
    const unresolvedFailedWorkflows = [...failedWorkflows].filter((workflowId) => !completedWorkflows.has(workflowId)).length;
    const activeParticipants = new Set(events.map((event) => event.actorId));
    const actorCompletions = new Map<string, Set<string>>();
    for (const event of completedEvents) {
      const workflows = actorCompletions.get(event.actorId) ?? new Set<string>();
      workflows.add(event.workflowId);
      actorCompletions.set(event.actorId, workflows);
    }
    const repeatParticipants = [...actorCompletions.values()].filter((workflows) => workflows.size >= 2).length;
    const captureDurations = completedEvents.flatMap((event) => event.durationMs === null ? [] : [event.durationMs]);

    const reviewedEntries = entries.filter((entry) => entry.confirmationStatus !== "UNREVIEWED");
    const evidenceBackedEntries = entries.filter((entry) => entry.artifacts.length > 0);
    const goalLinkedRecords = entries.filter((entry) => entry.goalLinks.length > 0).length + observations.filter((observation) => observation.goalId).length;
    const usedInEvaluation = entries.filter((entry) => entry.usedInEvalId).length;
    const releasedObservations = observations.filter((observation) => observation.releaseState === "RELEASED_IN_COUNSELING").length;
    const reviewLagHours = reviewedEntries.flatMap((entry) => entry.confirmedAt
      ? [(entry.confirmedAt.getTime() - entry.createdAt.getTime()) / (60 * 60 * 1000)]
      : []);
    const mobileRecords = entries.length + observations.length;

    const dimensionCounts = new Map<string, number>(DIMENSIONS.map((dimension) => [dimension, 0]));
    for (const entry of entries) dimensionCounts.set(entry.section, (dimensionCounts.get(entry.section) ?? 0) + 1);
    for (const observation of observations) dimensionCounts.set(observation.sectionKey, (dimensionCounts.get(observation.sectionKey) ?? 0) + 1);

    const weeklyCounts = new Map<string, { entries: number; observations: number }>();
    for (const entry of entries) {
      const key = weekKey(entry.createdAt);
      const bucket = weeklyCounts.get(key) ?? { entries: 0, observations: 0 };
      bucket.entries += 1;
      weeklyCounts.set(key, bucket);
    }
    for (const observation of observations) {
      const key = weekKey(observation.createdAt);
      const bucket = weeklyCounts.get(key) ?? { entries: 0, observations: 0 };
      bucket.observations += 1;
      weeklyCounts.set(key, bucket);
    }
    const currentWeek = weekStart(new Date());
    const weeklyTrend = Array.from({ length: Math.min(8, Math.max(1, Math.ceil(days / 7))) }, (_, index) => {
      const start = new Date(currentWeek);
      start.setUTCDate(start.getUTCDate() - (Math.min(8, Math.max(1, Math.ceil(days / 7))) - 1 - index) * 7);
      const key = start.toISOString().slice(0, 10);
      const bucket = weeklyCounts.get(key) ?? { entries: 0, observations: 0 };
      return { weekStart: key, entries: bucket.entries, observations: bucket.observations, records: bucket.entries + bucket.observations };
    });

    res.json({
      dataStatus: "LIVE_AGGREGATE",
      pilotId,
      period: { days, since: since.toISOString(), through: new Date().toISOString() },
      scope: { unitCount: unitIds.length },
      adoption: {
        activeParticipants: activeParticipants.size,
        repeatParticipants,
        workflowsStarted: startedWorkflows.size,
        workflowsCompleted: completedWorkflows.size,
        workflowsFailed: unresolvedFailedWorkflows,
        completionRate: percent(completedStartedWorkflows, startedWorkflows.size),
        draftRecoveries: events.filter((event) => event.eventType === "DRAFT_RECOVERED").length,
      },
      speed: {
        medianCaptureSeconds: captureDurations.length ? Math.round(median(captureDurations)! / 1000) : null,
        measuredCompletions: captureDurations.length,
        timeSavings: {
          status: "BASELINE_REQUIRED",
          savedHours: null,
          message: "Capture duration is measured. Hours saved require a pre-pilot baseline using the same workflow definition.",
        },
      },
      outcomes: {
        mobileRecords,
        soldierEntries: entries.length,
        raterObservations: observations.length,
        reviewedRecords: reviewedEntries.length + releasedObservations,
        usedInEvaluation,
        releasedObservations,
        positiveObservations: observations.filter((observation) => observation.feedbackType === "POSITIVE").length,
      },
      quality: {
        evidenceBackedEntries: evidenceBackedEntries.length,
        evidenceBackedPercent: percent(evidenceBackedEntries.length, entries.length),
        goalLinkedRecords,
        goalLinkedPercent: percent(goalLinkedRecords, mobileRecords),
        confirmed: entries.filter((entry) => entry.confirmationStatus === "CONFIRMED").length,
        needsClarification: entries.filter((entry) => entry.confirmationStatus === "NEEDS_CLARIFICATION").length,
        notUsed: entries.filter((entry) => entry.confirmationStatus === "NOT_USED").length,
        awaitingReview: entries.filter((entry) => entry.confirmationStatus === "UNREVIEWED").length,
        medianReviewLagHours: median(reviewLagHours),
        measuredReviews: reviewLagHours.length,
      },
      dimensionCoverage: DIMENSIONS.map((dimension) => ({
        dimension,
        records: dimensionCounts.get(dimension) ?? 0,
        percent: percent(dimensionCounts.get(dimension) ?? 0, mobileRecords),
      })),
      weeklyTrend,
      sampleSize: { telemetryEvents: events.length, mobileRecords },
      privacy: {
        aggregationOnly: true,
        message: "This view intentionally excludes names, individual rankings, accomplishment text, evidence, and rating content.",
      },
    });
  }),
);
