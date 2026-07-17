import { Router } from "express";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { asyncHandler, HttpError } from "@/middleware/error";
import { requireAuth } from "@/middleware/auth";
import { documentationSignalsForForm } from "@/lib/support-form/signals";

export const supportFormGoalsRouter = Router();

const goalInput = z.object({
  sectionKey: z.enum(["CHARACTER", "PRESENCE", "INTELLECT", "LEADS", "DEVELOPS", "ACHIEVES"]),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(5000),
  category: z.enum(["ROUTINE", "PROBLEM_SOLVING", "INNOVATIVE", "PERSONAL_DEVELOPMENT", "OTHER"]).optional(),
  targetDate: z.coerce.date().optional(),
});
const revisionSchema = z.object({ revisionNote: z.string().trim().min(1).max(1000) });
const assessmentSchema = z.object({ assessment: z.enum(["NOT_STARTED", "IN_PROGRESS", "ACHIEVED", "PARTIALLY_ACHIEVED", "NOT_ACHIEVED"]), note: z.string().trim().max(1000).optional() });
const linkSchema = z.object({ supportFormEntryId: z.string().min(1) });
const counselingSchema = z.object({ counselingSessionId: z.string().min(1), note: z.string().trim().max(2000).optional(), percentAchieved: z.number().int().min(0).max(100).optional() });
const carryForwardSchema = z.object({ targetSupportFormId: z.string().min(1) });
const contextNoteSchema = z.object({ raterContextNote: z.string().trim().min(1).max(2000) });

async function loadForm(formId: string) {
  const form = await prisma.supportForm.findUnique({ where: { id: formId }, include: { ratingChain: true, soldier: { select: { unitId: true } } } });
  if (!form) throw new HttpError(404, "Support form not found");
  if (!form.ratingChain) throw new HttpError(409, "Support form is not linked to a rating chain");
  return form;
}

function requireActor(req: Express.Request) {
  if (!req.user) throw new HttpError(401, "Not authenticated");
  return req.user;
}

function requireSoldier(actorId: string, soldierId: string) {
  if (actorId !== soldierId) throw new HttpError(403, "Only the rated Soldier may perform this goal action");
}

function requireRater(actorId: string, raterId: string) {
  if (actorId !== raterId) throw new HttpError(403, "Only the assigned rater may perform this goal action");
}

function requireGoalReader(actorId: string, form: Awaited<ReturnType<typeof loadForm>>) {
  if (![form.soldierId, form.ratingChain!.raterId, form.ratingChain!.seniorRaterId].includes(actorId)) {
    throw new HttpError(403, "You are not authorized to view goals for this support form");
  }
}

function requireSignalReader(actor: NonNullable<Express.Request["user"]>, form: Awaited<ReturnType<typeof loadForm>>) {
  if ([form.ratingChain!.raterId, form.ratingChain!.seniorRaterId].includes(actor.id) || actor.roles.includes("ADMIN")) return;
  if (actor.roles.includes("COMMANDER") && actor.unitId && actor.unitId === form.soldier.unitId) return;
  throw new HttpError(403, "You are not authorized to view documentation signals for this support form");
}

async function loadGoal(formId: string, goalId: string) {
  const goal = await prisma.goal.findFirst({ where: { id: goalId, supportFormId: formId } });
  if (!goal) throw new HttpError(404, "Goal not found");
  return goal;
}

async function audit(actorId: string, action: string, goalId: string, metadata?: Record<string, unknown>) {
  await prisma.auditLog.create({ data: { actorId, action, entityType: "Goal", entityId: goalId, metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : undefined } });
}

supportFormGoalsRouter.get("/:formId/goals", requireAuth, asyncHandler(async (req, res) => {
  const actor = requireActor(req); const form = await loadForm(req.params.formId!); requireGoalReader(actor.id, form);
  const goals = await prisma.goal.findMany({
    where: { supportFormId: form.id },
    include: { _count: { select: { linkedEntries: true } } },
    orderBy: [{ sectionKey: "asc" }, { createdAt: "asc" }],
  });
  res.json(goals);
}));

supportFormGoalsRouter.post("/:formId/goals", requireAuth, asyncHandler(async (req, res) => {
  const actor = requireActor(req); const form = await loadForm(req.params.formId!); requireSoldier(actor.id, form.soldierId);
  const body = goalInput.parse(req.body);
  const goal = await prisma.goal.create({ data: { supportFormId: form.id, ...body, createdById: actor.id, createdByRole: "RATED_SOLDIER" } });
  await audit(actor.id, "GOAL_CREATED", goal.id, { sectionKey: goal.sectionKey }); res.status(201).json(goal);
}));

supportFormGoalsRouter.patch("/:formId/goals/:goalId", requireAuth, asyncHandler(async (req, res) => {
  const actor = requireActor(req); const form = await loadForm(req.params.formId!); requireSoldier(actor.id, form.soldierId);
  const goal = await loadGoal(form.id, req.params.goalId!);
  if (!["DRAFT", "NEEDS_REVISION"].includes(goal.approvalStatus)) throw new HttpError(409, "Submitted or approved goals cannot be edited");
  const body = goalInput.partial().parse(req.body);
  const updated = await prisma.goal.update({ where: { id: goal.id }, data: { ...body, lastEditedById: actor.id, lastEditedAt: new Date(), revisionNote: body.description !== undefined ? null : undefined } });
  await audit(actor.id, "GOAL_EDITED", goal.id, { fields: Object.keys(body) }); res.json(updated);
}));

supportFormGoalsRouter.post("/:formId/goals/:goalId/submit-for-review", requireAuth, asyncHandler(async (req, res) => {
  const actor = requireActor(req); const form = await loadForm(req.params.formId!); requireSoldier(actor.id, form.soldierId);
  const goal = await loadGoal(form.id, req.params.goalId!);
  if (!["DRAFT", "NEEDS_REVISION"].includes(goal.approvalStatus)) throw new HttpError(409, "Goal is not ready for rater review");
  const updated = await prisma.goal.update({ where: { id: goal.id }, data: { approvalStatus: "PENDING_RATER_REVIEW", revisionNote: null } });
  await audit(actor.id, "GOAL_SUBMITTED_FOR_REVIEW", goal.id); res.json(updated);
}));

supportFormGoalsRouter.post("/:formId/goals/:goalId/approve", requireAuth, asyncHandler(async (req, res) => {
  const actor = requireActor(req); const form = await loadForm(req.params.formId!); requireRater(actor.id, form.ratingChain!.raterId);
  const goal = await loadGoal(form.id, req.params.goalId!);
  if (goal.approvalStatus !== "PENDING_RATER_REVIEW") throw new HttpError(409, "Goal is not awaiting rater review");
  const body = z.object({ counselingSessionId: z.string().min(1).optional() }).parse(req.body);
  if (body.counselingSessionId) {
    const session = await prisma.counselingSession.findFirst({ where: { id: body.counselingSessionId, ratingChainId: form.ratingChainId! } });
    if (!session) throw new HttpError(422, "Counseling session does not belong to this rating chain");
  }
  const updated = await prisma.goal.update({ where: { id: goal.id }, data: { approvalStatus: "APPROVED", approvedByRaterId: actor.id, approvedAt: new Date(), establishedAtCounselingSessionId: body.counselingSessionId ?? null, revisionNote: null } });
  await audit(actor.id, "GOAL_APPROVED", goal.id, { counselingSessionId: body.counselingSessionId ?? null }); res.json(updated);
}));

supportFormGoalsRouter.post("/:formId/goals/:goalId/request-revision", requireAuth, asyncHandler(async (req, res) => {
  const actor = requireActor(req); const form = await loadForm(req.params.formId!); requireRater(actor.id, form.ratingChain!.raterId);
  const goal = await loadGoal(form.id, req.params.goalId!); const body = revisionSchema.parse(req.body);
  if (goal.approvalStatus !== "PENDING_RATER_REVIEW") throw new HttpError(409, "Goal is not awaiting rater review");
  const updated = await prisma.goal.update({ where: { id: goal.id }, data: { approvalStatus: "NEEDS_REVISION", revisionNote: body.revisionNote } });
  await audit(actor.id, "GOAL_REVISION_REQUESTED", goal.id); res.json(updated);
}));

supportFormGoalsRouter.get("/:formId/goals/:goalId/progress", requireAuth, asyncHandler(async (req, res) => {
  const actor = requireActor(req); const form = await loadForm(req.params.formId!); requireGoalReader(actor.id, form);
  const goal = await prisma.goal.findFirst({ where: { id: req.params.goalId, supportFormId: form.id }, include: {
    linkedEntries: { include: { supportFormEntry: { include: { artifacts: true } } }, orderBy: { linkedAt: "asc" } },
    counselingDiscussions: { include: { counselingSession: true }, orderBy: { counselingSession: { sessionDate: "asc" } } },
  } });
  if (!goal) throw new HttpError(404, "Goal not found");
  res.json({ ...goal, progressTrend: goal.counselingDiscussions.map((discussion) => ({ sessionDate: discussion.counselingSession.sessionDate, percentAchieved: discussion.percentAchieved })) });
}));

supportFormGoalsRouter.post("/:formId/goals/:goalId/carry-forward", requireAuth, asyncHandler(async (req, res) => {
  const actor = requireActor(req); const sourceForm = await loadForm(req.params.formId!); const goal = await loadGoal(sourceForm.id, req.params.goalId!); const body = carryForwardSchema.parse(req.body);
  const targetForm = await loadForm(body.targetSupportFormId);
  if (targetForm.soldierId !== sourceForm.soldierId) throw new HttpError(422, "Goals can only be carried forward for the same rated Soldier");
  if (!targetForm.isActive || targetForm.disposition !== "ACTIVE" || ["CONSUMED", "ARCHIVED", "QUARANTINED"].includes(targetForm.status)) throw new HttpError(409, "Carry-forward requires an active next-period support form");
  if (!["IN_PROGRESS", "NOT_ACHIEVED"].includes(goal.raterAssessment ?? goal.soldierAssessment ?? "")) throw new HttpError(409, "Only in-progress or not-achieved goals may be carried forward");
  if (![targetForm.soldierId, targetForm.ratingChain!.raterId].includes(actor.id)) throw new HttpError(403, "Only the rated Soldier or new rater may carry a goal forward");
  const created = await prisma.goal.create({ data: { supportFormId: targetForm.id, sectionKey: goal.sectionKey, title: goal.title, description: goal.description, category: goal.category, targetDate: goal.targetDate, createdById: actor.id, createdByRole: actor.id === targetForm.soldierId ? "RATED_SOLDIER" : "RATER", carriedForwardFromGoalId: goal.id } });
  await audit(actor.id, "GOAL_CARRIED_FORWARD", created.id, { sourceGoalId: goal.id, targetSupportFormId: targetForm.id }); res.status(201).json(created);
}));

supportFormGoalsRouter.get("/:formId/documentation-signals", requireAuth, asyncHandler(async (req, res) => {
  const actor = requireActor(req); const form = await loadForm(req.params.formId!); requireSignalReader(actor, form);
  res.json(await documentationSignalsForForm(form.id));
}));

supportFormGoalsRouter.post("/:formId/context-note", requireAuth, asyncHandler(async (req, res) => {
  const actor = requireActor(req); const form = await loadForm(req.params.formId!); requireRater(actor.id, form.ratingChain!.raterId); const body = contextNoteSchema.parse(req.body);
  const updated = await prisma.supportForm.update({ where: { id: form.id }, data: { raterContextNote: body.raterContextNote, raterContextNoteSetById: actor.id, raterContextNoteSetAt: new Date() } });
  await prisma.auditLog.create({ data: { actorId: actor.id, action: "SUPPORT_FORM_CONTEXT_NOTE_SET", entityType: "SupportForm", entityId: form.id } }); res.json(updated);
}));

supportFormGoalsRouter.post("/:formId/goals/:goalId/link-entry", requireAuth, asyncHandler(async (req, res) => {
  const actor = requireActor(req); const form = await loadForm(req.params.formId!);
  if (![form.soldierId, form.ratingChain!.raterId].includes(actor.id)) throw new HttpError(403, "Only the rated Soldier or rater may link accomplishment evidence");
  const goal = await loadGoal(form.id, req.params.goalId!); const body = linkSchema.parse(req.body);
  const entry = await prisma.supportFormEntry.findFirst({ where: { id: body.supportFormEntryId, supportFormId: form.id, entryType: "ACCOMPLISHMENT" } });
  if (!entry) throw new HttpError(422, "Only accomplishments from this support form may be linked to a goal");
  const link = await prisma.goalEntryLink.upsert({ where: { goalId_supportFormEntryId: { goalId: goal.id, supportFormEntryId: entry.id } }, update: {}, create: { goalId: goal.id, supportFormEntryId: entry.id, linkedById: actor.id, linkedByRole: actor.id === form.soldierId ? "RATED_SOLDIER" : "RATER" } });
  await audit(actor.id, "GOAL_ENTRY_LINKED", goal.id, { entryId: entry.id }); res.status(201).json(link);
}));

supportFormGoalsRouter.delete("/:formId/goals/:goalId/link-entry/:entryId", requireAuth, asyncHandler(async (req, res) => {
  const actor = requireActor(req); const form = await loadForm(req.params.formId!);
  if (![form.soldierId, form.ratingChain!.raterId].includes(actor.id)) throw new HttpError(403, "Only the rated Soldier or rater may unlink accomplishment evidence");
  const goal = await loadGoal(form.id, req.params.goalId!);
  await prisma.goalEntryLink.deleteMany({ where: { goalId: goal.id, supportFormEntryId: req.params.entryId! } });
  await audit(actor.id, "GOAL_ENTRY_UNLINKED", goal.id, { entryId: req.params.entryId }); res.status(204).end();
}));

supportFormGoalsRouter.post("/:formId/goals/:goalId/self-assessment", requireAuth, asyncHandler(async (req, res) => {
  const actor = requireActor(req); const form = await loadForm(req.params.formId!); requireSoldier(actor.id, form.soldierId);
  const goal = await loadGoal(form.id, req.params.goalId!); const body = assessmentSchema.parse(req.body);
  const updated = await prisma.goal.update({ where: { id: goal.id }, data: { soldierAssessment: body.assessment, soldierAssessmentNote: body.note ?? null, soldierAssessmentAt: new Date() } });
  await audit(actor.id, "GOAL_SELF_ASSESSED", goal.id); res.json(updated);
}));

supportFormGoalsRouter.post("/:formId/goals/:goalId/rater-assessment", requireAuth, asyncHandler(async (req, res) => {
  const actor = requireActor(req); const form = await loadForm(req.params.formId!); requireRater(actor.id, form.ratingChain!.raterId);
  const goal = await loadGoal(form.id, req.params.goalId!); const body = assessmentSchema.parse(req.body);
  const updated = await prisma.goal.update({ where: { id: goal.id }, data: { raterAssessment: body.assessment, raterAssessmentById: actor.id, raterAssessmentNote: body.note ?? null, raterAssessmentAt: new Date() } });
  await audit(actor.id, "GOAL_RATER_ASSESSED", goal.id); res.json(updated);
}));

supportFormGoalsRouter.post("/:formId/goals/:goalId/counseling-note", requireAuth, asyncHandler(async (req, res) => {
  const actor = requireActor(req); const form = await loadForm(req.params.formId!); requireRater(actor.id, form.ratingChain!.raterId);
  const goal = await loadGoal(form.id, req.params.goalId!); const body = counselingSchema.parse(req.body);
  const session = await prisma.counselingSession.findFirst({ where: { id: body.counselingSessionId, ratingChainId: form.ratingChainId! } });
  if (!session) throw new HttpError(422, "Counseling session does not belong to this rating chain");
  const discussion = await prisma.goalCounselingDiscussion.upsert({ where: { goalId_counselingSessionId: { goalId: goal.id, counselingSessionId: session.id } }, update: { note: body.note ?? null, percentAchieved: body.percentAchieved ?? null, setById: actor.id }, create: { goalId: goal.id, counselingSessionId: session.id, note: body.note ?? null, percentAchieved: body.percentAchieved ?? null, setById: actor.id } });
  await audit(actor.id, "GOAL_COUNSELING_RECORDED", goal.id, { counselingSessionId: session.id, percentAchieved: body.percentAchieved ?? null }); res.json(discussion);
}));