import { authorizeDelegatedAction } from "@/lib/access-assistance/authorization";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { asyncHandler, HttpError } from "@/middleware/error";
import { requireAuth } from "@/middleware/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { resolveFormType } from "@/lib/utils/role-resolver";
import { checkCompleteness, allowedFieldsFor } from "@/lib/support-form/completeness";
import { generateArtifactCaption } from "@/lib/ai/artifact-captioning";
import { requireRatingChainRole, requireSupportFormEntryOwner, requireArtifactOwner } from "@/lib/utils/chain-auth";
import { authorizeSupportFormEntryCreate, authorizeSupportFormView, canConfirmSupportFormEntry, canEditSupportFormField, canViewSupportForm } from "@/lib/authorization-policies";
import { notify } from "@/lib/notifications/create";

export const supportFormsRouter = Router();

// Multer configured to hold file in memory (max 20 MB — artifacts are small)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF and image files (JPEG, PNG, WEBP) are accepted."));
    }
  },
});

const createFormSchema = z.object({
  soldierId: z.string().min(1).optional(),
  ratingChainId: z.string().min(1),
  ratingSchemeAssignmentId: z.string().min(1).optional(),
  ratingPeriodStart: z.coerce.date(),
  ratingPeriodEnd: z.coerce.date().optional(),
  dutyTitle: z.string().min(1),
  dutyMosc: z.string().optional(),
  dailyDutiesScope: z.string().optional(),
  areasOfEmphasis: z.string().optional(),
  appointedDuties: z.string().optional(),
  soldierGoals: z.string().optional(),
});

const patchFormSchema = z.object({
  dutyTitle: z.string().optional(),
  dutyMosc: z.string().optional(),
  dailyDutiesScope: z.string().optional(),
  areasOfEmphasis: z.string().optional(),
  appointedDuties: z.string().optional(),
  ssdNcoesMet: z.boolean().optional(),
  soldierGoals: z.string().optional(),
});

const patchEntrySchema = z.object({
  rawText: z.string().min(1).max(5000).optional(),
  tags: z.array(z.string().min(1).max(80)).max(20).optional(),
  isHighlight: z.boolean().optional(),
});

const organizeArtifactSchema = z.object({
  type: z.enum(["CERTIFICATE", "SCORE_SHEET", "PHOTO", "DOCUMENT", "OTHER"]),
});

const reviewRequestSchema = z.object({
  recipient: z.enum(["SOLDIER", "RATER"]),
  note: z.string().trim().max(500).optional(),
});

const reminderSchema = z.object({
  recipient: z.enum(["SOLDIER", "RATER", "SENIOR_RATER"]),
  note: z.string().trim().min(1).max(500),
});

async function authorizeSupportFormWorkflowAction(
  actor: NonNullable<Express.Request["user"]>,
  form: { id: string; soldierId: string; ratingSchemeAssignmentId: string | null; ratingChain: { raterId: string; seniorRaterId: string } | null },
  capability: "REQUEST_SOLDIER_REVIEW" | "REQUEST_RATER_REVIEW" | "SEND_WORKFLOW_REMINDER",
) {
  const directAccess = actor.roles.includes("ADMIN") || [form.soldierId, form.ratingChain?.raterId, form.ratingChain?.seniorRaterId].includes(actor.id);
  if (directAccess) return { allowed: true as const, source: "DIRECT" as const };
  const delegated = await authorizeDelegatedAction({
    actorUserId: actor.id,
    subjectUserId: form.soldierId,
    capability,
    supportFormId: form.id,
    ratingAssignmentId: form.ratingSchemeAssignmentId ?? undefined,
  });
  return { ...delegated, source: "DELEGATION" as const };
}

const createEntrySchema = z.object({
  section: z.string().min(1),
  entryType: z.enum(["OBJECTIVE", "ACCOMPLISHMENT"]),
  rawText: z.string().min(1),
  tags: z.array(z.string()).default([]),
  isHighlight: z.boolean().default(false),
  entryDate: z.coerce.date().optional(),
  goalIds: z.array(z.string().min(1)).max(20).optional(),
});

const ARTIFACT_TYPES = ["CERTIFICATE", "SCORE_SHEET", "PHOTO", "DOCUMENT", "OTHER"] as const;

// multipart/form-data always sends string values, so a plain
// `z.coerce.boolean()` is a footgun here: JS's `Boolean("false")` is `true`
// (any non-empty string coerces truthy), meaning a client explicitly
// sending "false" would be silently treated as "true". Only real booleans
// or the literal strings "true"/"false" should count.
const formBoolean = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((v) => v === true || v === "true");

const createArtifactSchema = z.object({
  type: z.enum(ARTIFACT_TYPES),
  flaggedByServiceMember: formBoolean,
  flagNote: z.string().max(1000).optional(),
});

const flagArtifactSchema = z.object({
  flaggedByServiceMember: z.boolean(),
  flagNote: z.string().max(1000).optional(),
});

const confirmEntrySchema = z.object({
  status: z.enum(["UNREVIEWED", "CONFIRMED", "NEEDS_CLARIFICATION", "NOT_USED"]),
  clarificationNote: z.string().max(500).optional(),
});

// GET /api/support-forms?soldierId=...
supportFormsRouter.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.user) throw new HttpError(401, "Not authenticated");
    const requestedSoldierId = typeof req.query.soldierId === "string"
      ? req.query.soldierId
      : req.user.id;
    const relationshipScope = req.user.roles.includes("ADMIN")
      ? {}
      : {
          OR: [
            { soldierId: req.user.id },
            {
              ratingChain: {
                OR: [
                  { raterId: req.user.id },
                  { seniorRaterId: req.user.id },
                  { reviewerId: req.user.id },
                ],
              },
            },
          ],
        };
    const forms = await prisma.supportForm.findMany({
      where: { soldierId: requestedSoldierId, disposition: "ACTIVE", ...relationshipScope },
      include: {
        entries: { include: { artifacts: true, createdByUser: { select: { firstName: true, lastName: true, rank: true } }, assistedUser: { select: { firstName: true, lastName: true, rank: true } } }, orderBy: { entryDate: "desc" } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(forms);
  }),
);

// POST /api/support-forms
//
// Anchors the new form to a RatingChain rather than an implicit "current
// period" (2026-07 review). Enforces: at most one support form per chain
// that is NOT yet "consumed" by an Evaluation. A RatingChain can persist
// across multiple annual cycles, so once an Evaluation links a support
// form via `supportFormId`, that chain is free to start a new one for the
// next cycle — this also means a chain reassignment (PCS) naturally starts
// a fresh chain with no support form yet, no separate invalidation logic
// needed.
supportFormsRouter.post(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = createFormSchema.parse(req.body);

    if (!req.user) throw new HttpError(401, "Not authenticated");
    const [chain, assignment] = await Promise.all([
      prisma.ratingChain.findUnique({
        where: { id: body.ratingChainId },
        include: { evaluations: { select: { id: true, supportFormId: true } } },
      }),
      body.ratingSchemeAssignmentId
        ? prisma.ratingSchemeAssignment.findUnique({
            where: { id: body.ratingSchemeAssignmentId },
            include: { ratedSoldier: true },
          })
        : null,
    ]);
    if (!chain) throw new HttpError(404, "Rating chain not found");
    if (body.ratingSchemeAssignmentId && !assignment) {
      throw new HttpError(404, "Rating scheme assignment not found", "RATING_ASSIGNMENT_NOT_FOUND");
    }
    const now = new Date();
    if (assignment && (assignment.status !== "PUBLISHED" || assignment.effectiveFrom > now || (assignment.effectiveTo && assignment.effectiveTo < now))) {
      throw new HttpError(409, "The rating assignment is not currently effective.", "RATING_ASSIGNMENT_NOT_EFFECTIVE");
    }
    if (assignment && (assignment.ratedSoldierId !== chain.ratedSoldierId || assignment.raterId !== chain.raterId || assignment.seniorRaterId !== chain.seniorRaterId)) {
      throw new HttpError(422, "The legacy rating chain does not match the published assignment.", "RATING_ASSIGNMENT_CHAIN_MISMATCH");
    }
    const soldierId = assignment?.ratedSoldierId ?? body.soldierId;
    if (!soldierId) {
      throw new HttpError(400, "A soldier is required when no rating assignment is supplied.");
    }
    if (chain.ratedSoldierId !== soldierId) {
      throw new HttpError(400, "Rating chain does not belong to this soldier");
    }
    if (!req.user.roles.includes("ADMIN") && req.user.id !== soldierId && req.user.id !== chain.raterId) {
      throw new HttpError(403, "Only the rated Soldier or assigned rater may initiate this support form.");
    }

    const unconsumedForm = await prisma.supportForm.findFirst({
      where: {
        ...(assignment ? { ratingSchemeAssignmentId: assignment.id } : { ratingChainId: body.ratingChainId }),
        isActive: true,
        disposition: "ACTIVE",
        status: { notIn: ["CONSUMED", "ARCHIVED", "QUARANTINED"] },
        evaluations: { none: {} }, // not yet linked to any Evaluation
      },
    });
    if (unconsumedForm) {
      throw new HttpError(
        409,
        "An active support form already exists for this rating chain. " +
          "Finish or link it to an evaluation before starting a new one.",
      );
    }

    const { evalType: derivedCategory } = resolveFormType(assignment?.ratedSoldier.rank ?? (await prisma.user.findUniqueOrThrow({ where: { id: soldierId }, select: { rank: true } })).rank);
    const evalCategory = assignment?.formCategory ?? derivedCategory;
    if (assignment && evalCategory !== derivedCategory) {
      throw new HttpError(422, "The assignment category does not match the rated Soldier's rank.", "RATING_ASSIGNMENT_CATEGORY_MISMATCH");
    }
    const allowed = allowedFieldsFor(evalCategory);
    const rejected = Object.keys(body).filter(
      (k) =>
        !["soldierId", "ratingChainId", "ratingSchemeAssignmentId", "ratingPeriodStart", "ratingPeriodEnd"].includes(k) &&
        !allowed.includes(k),
    );
    if (rejected.length > 0) {
      throw new HttpError(
        400,
        `Field(s) not applicable to ${evalCategory} support forms: ${rejected.join(", ")}`,
      );
    }

    const form = await prisma.supportForm.create({
      data: {
        ...body,
        soldierId,
        ratingSchemeAssignmentId: assignment?.id,
        evalCategory,
        initiatedByUserId: req.user.id,
      },
    });
    res.status(201).json(form);
  }),
);

// GET /api/support-forms/:id
supportFormsRouter.get(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const form = await prisma.supportForm.findUnique({
      where: { id: req.params.id },
      include: {
        entries: { include: { artifacts: true, createdByUser: { select: { firstName: true, lastName: true, rank: true } }, assistedUser: { select: { firstName: true, lastName: true, rank: true } } }, orderBy: { entryDate: "desc" } },
        soldier: true,
        ratingChain: true,
      },
    });
    if (!form) {
      res.status(404).json({ error: "Support form not found" });
      return;
    }
    const access = req.user ? await authorizeSupportFormView(req.user, form, form.ratingChain) : { allowed: false };
    if (!access.allowed) {
      throw new HttpError(404, "Support form not found");
    }
    res.json(form);
  }),
);

// PATCH /api/support-forms/:id — Part I/III admin fields + soldierGoals.
// Rejects (400) any field not applicable to the form's evalCategory
// (e.g. dutyMosc/ssdNcoesMet on an OER-typed form).
supportFormsRouter.patch(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = patchFormSchema.parse(req.body);
    if (!req.user) throw new HttpError(401, "Not authenticated");
    const form = await prisma.supportForm.findUnique({ where: { id: req.params.id }, include: { ratingChain: true } });
    if (!form) throw new HttpError(404, "Support form not found");
    if (!form.evalCategory) {
      throw new HttpError(500, "Support form is missing evalCategory — data integrity issue");
    }

    if (!Object.keys(body).every((field) => canEditSupportFormField(req.user!, form, field, form.ratingChain))) {
      throw new HttpError(403, "You are not authorized to edit these support form fields.");
    }

    const allowed = allowedFieldsFor(form.evalCategory);
    const rejected = Object.keys(body).filter((k) => !allowed.includes(k));
    if (rejected.length > 0) {
      throw new HttpError(
        400,
        `Field(s) not applicable to ${form.evalCategory} support forms: ${rejected.join(", ")}`,
      );
    }

    const updated = await prisma.supportForm.update({
      where: { id: req.params.id },
      data: body,
    });
    res.json(updated);
  }),
);

// GET /api/support-forms/:id/completeness
supportFormsRouter.get(
  "/:id/completeness",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.user) throw new HttpError(401, "Not authenticated");
    const form = await prisma.supportForm.findUnique({ where: { id: req.params.id }, include: { ratingChain: true } });
    if (!form || !(await authorizeSupportFormView(req.user, form, form.ratingChain)).allowed) throw new HttpError(404, "Support form not found");
    const result = await checkCompleteness(req.params.id!);
    res.json(result);
  }),
);

// POST /api/support-forms/:id/finalize
// Sets completedAt if the HARD gate passes (two-tier — see completeness.ts).
// The all-6-dimensions check is a soft indicator only and never blocks this.
supportFormsRouter.post(
  "/:id/finalize",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.user) throw new HttpError(401, "Not authenticated");
    const form = await prisma.supportForm.findUnique({ where: { id: req.params.id }, include: { ratingChain: true } });
    if (!form || !canEditSupportFormField(req.user, form, "completedAt", form.ratingChain)) {
      throw new HttpError(404, "Support form not found");
    }
    const result = await checkCompleteness(req.params.id!);
    if (!result.hardComplete) {
      res.status(409).json({ error: "Support form is not complete", missing: result.missing });
      return;
    }
    const updated = await prisma.supportForm.update({
      where: { id: req.params.id },
      data: { completedAt: new Date(), finalizedAt: new Date(), status: "FINALIZED" },
    });
    res.json({ ...updated, softComplete: result.softComplete });
  }),
);

// GET /api/support-forms/:id/counseling-dates
// Read-only display for Part II. Pulled from CounselingSession via the
// support form's RatingChain. Never gates finalize or eval creation.
supportFormsRouter.get(
  "/:id/counseling-dates",
  requireAuth,
  asyncHandler(async (req, res) => {
    const form = await prisma.supportForm.findUnique({ where: { id: req.params.id } });
    if (!form) throw new HttpError(404, "Support form not found");
    if (!form.ratingChainId) {
      res.json({ sessions: [] });
      return;
    }
    const sessions = await prisma.counselingSession.findMany({
      where: { ratingChainId: form.ratingChainId },
      orderBy: { sessionDate: "asc" },
      select: { id: true, type: true, sessionDate: true, notes: true },
    });
    res.json({ sessions });
  }),
);

// POST /api/support-forms/:id/entries
supportFormsRouter.post(
  "/:id/entries",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.user) throw new HttpError(401, "Not authenticated");
    const body = createEntrySchema.parse(req.body);
    const form = await prisma.supportForm.findUnique({ where: { id: req.params.id }, include: { ratingChain: true } });
    const entryAccess = form
      ? await authorizeSupportFormEntryCreate(req.user, form, body.entryType, form.ratingChain)
      : { allowed: false, source: "NONE" as const };
    if (!form || !entryAccess.allowed) {
      throw new HttpError(404, "Support form not found");
    }
    if (body.entryType === "OBJECTIVE") {
      throw new HttpError(422, "Create performance goals through the Goals workflow; new objective entries are no longer accepted.", "OBJECTIVE_ENTRY_DEPRECATED");
    }
    if (body.goalIds?.length) {
      if (entryAccess.source === "DELEGATION") throw new HttpError(403, "Delegates cannot link accomplishments to a Soldier's goals.");
      const goals = await prisma.goal.findMany({ where: { id: { in: body.goalIds }, supportFormId: form.id }, select: { id: true } });
      if (goals.length !== new Set(body.goalIds).size) throw new HttpError(422, "One or more goals do not belong to this support form.");
    }
    const delegationGrant = entryAccess.source === "DELEGATION" ? entryAccess.grant : undefined;
    const authorRoleAtCreation = req.user.id === form.soldierId
      ? "RATED_SOLDIER"
      : req.user.id === form.ratingChain?.raterId
        ? "RATER"
        : req.user.id === form.ratingChain?.seniorRaterId
          ? "SENIOR_RATER"
          : "SERVICING_ADMIN";
    const entry = await prisma.supportFormEntry.create({
      data: {
        supportFormId: req.params.id!,
        section: body.section as never,
        entryType: body.entryType as never,
        rawText: body.rawText,
        tags: body.tags,
        isHighlight: body.isHighlight,
        createdByUserId: req.user.id,
        authorRoleAtCreation,
        ...(delegationGrant
          ? { onBehalfOfUserId: form.soldierId, delegationGrantId: delegationGrant.id }
          : {}),
        ...(body.entryDate ? { entryDate: body.entryDate } : {}),
        ...(body.goalIds?.length ? { goalLinks: { create: body.goalIds.map((goalId) => ({ goalId, linkedById: req.user!.id, linkedByRole: req.user!.id === form.soldierId ? "RATED_SOLDIER" : "RATER" })) } } : {}),
      },
    });

    if (req.user) {
      await prisma.auditLog.create({
        data: {
          actorId: req.user.id,
          action: "ENTRY_CREATED",
          entityType: "SupportFormEntry",
          entityId: entry.id,
          metadata: { section: body.section, entryType: body.entryType, authorizationSource: entryAccess.source },
          ...(delegationGrant
            ? { subjectUserId: form.soldierId, delegationGrantId: delegationGrant.id, delegationCapability: "ADD_DRAFT_SUPPORT_ENTRY" }
            : {}),
        },
      });
    }

    res.status(201).json(entry);
  }),
);

// A helper may revise only an unlocked draft they personally created. This
// cannot alter confirmation, attribution, or any rater-owned evidence status.
supportFormsRouter.patch(
  "/entries/:entryId",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.user) throw new HttpError(401, "Not authenticated");
    const body = patchEntrySchema.parse(req.body);
    if (Object.keys(body).length === 0) throw new HttpError(400, "Provide at least one draft field to update.");
    const entry = await prisma.supportFormEntry.findUnique({
      where: { id: req.params.entryId },
      include: { supportForm: true },
    });
    if (!entry) throw new HttpError(404, "Support form entry not found.");
    if (entry.createdByUserId !== req.user.id) throw new HttpError(403, "You may only edit your own draft entries.");
    if (entry.lockedAt || entry.confirmationStatus !== "UNREVIEWED" || entry.usedInEvalId) {
      throw new HttpError(409, "Confirmed or used entries cannot be edited.");
    }

    const delegatedEdit = entry.onBehalfOfUserId
      ? await authorizeDelegatedAction({
          actorUserId: req.user.id,
          subjectUserId: entry.supportForm.soldierId,
          capability: "EDIT_OWN_DRAFT_SUPPORT_ENTRY",
          supportFormId: entry.supportFormId,
          ratingAssignmentId: entry.supportForm.ratingSchemeAssignmentId ?? undefined,
        })
      : undefined;
    if (entry.onBehalfOfUserId && !delegatedEdit?.allowed) {
      throw new HttpError(403, "Your scoped permission to edit this draft is no longer active.");
    }

    const updated = await prisma.supportFormEntry.update({
      where: { id: entry.id },
      data: { ...body, lastEditedByUserId: req.user.id, sourceVersion: { increment: 1 } },
    });
    await prisma.auditLog.create({
      data: {
        actorId: req.user.id,
        action: "SUPPORT_FORM_ENTRY_DRAFT_EDITED",
        entityType: "SupportFormEntry",
        entityId: entry.id,
        metadata: { fields: Object.keys(body), authorizationSource: delegatedEdit?.grant ? "DELEGATION" : "DIRECT" },
        ...(delegatedEdit?.grant
          ? { subjectUserId: entry.supportForm.soldierId, delegationGrantId: delegatedEdit.grant.id, delegationCapability: "EDIT_OWN_DRAFT_SUPPORT_ENTRY" }
          : {}),
      },
    });
    res.json(updated);
  }),
);

// POST /api/support-forms/:formId/entries/:entryId/artifacts
// Soldier attaches proof (certificate, score sheet, photo, misc document) to
// an entry. Fires a one-time AI captioning pass (fire-and-forget) so the
// caption is ready by the time a rater generates bullets from this entry.
supportFormsRouter.post(
  "/:formId/entries/:entryId/artifacts",
  requireAuth,
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.user) throw new HttpError(401, "Not authenticated");
    const { formId, entryId } = req.params;
    const file = req.file;
    if (!file) throw new HttpError(400, "No file provided.");

    // Ownership check (MVP audit 5.2) — only the soldier who owns this
    // support form may attach evidence to their own entries. Also verify
    // the entry actually belongs to the :formId in the URL, not just that
    // it exists (previously fetched by entryId alone, ignoring formId).
    const entry = await prisma.supportFormEntry.findUnique({
      where: { id: entryId! },
      include: { supportForm: true },
    });
    if (!entry) throw new HttpError(404, "Support form entry not found.");
    if (entry.supportFormId !== formId) {
      throw new HttpError(400, "Entry does not belong to the specified support form.");
    }
    const directOwner = req.user.roles.includes("ADMIN") || entry.supportForm.soldierId === req.user.id;
    const delegatedUpload = directOwner
      ? undefined
      : await authorizeDelegatedAction({
          actorUserId: req.user.id,
          subjectUserId: entry.supportForm.soldierId,
          capability: "UPLOAD_ARTIFACT",
          supportFormId: entry.supportFormId,
          ratingAssignmentId: entry.supportForm.ratingSchemeAssignmentId ?? undefined,
        });
    if (!directOwner && !delegatedUpload?.allowed) {
      throw new HttpError(403, "You can only upload artifacts through a scoped access grant.");
    }

    const body = createArtifactSchema.parse({
      type: req.body.type,
      flaggedByServiceMember: req.body.flaggedByServiceMember,
      flagNote: req.body.flagNote,
    });
    if (body.flaggedByServiceMember && !body.flagNote) {
      throw new HttpError(400, "flagNote is required when flagging a discrepancy.");
    }

    const fileExt = file.originalname.split(".").pop() ?? "bin";
    const storagePath = `support-form-entries/${entryId}/${Date.now()}.${fileExt}`;
    const fileType = file.mimetype.startsWith("image") ? "image" : "pdf";

    const supabase = getSupabaseAdmin();
    const { error: uploadError } = await supabase.storage
      .from("evaluations")
      .upload(storagePath, file.buffer, { contentType: file.mimetype, upsert: false });
    if (uploadError) {
      throw new HttpError(500, `Storage upload failed: ${uploadError.message}`);
    }

    const { data: publicData } = supabase.storage.from("evaluations").getPublicUrl(storagePath);

    const artifact = await prisma.supportFormEntryArtifact.create({
      data: {
        entryId: entryId!,
        type: body.type as never,
        fileUrl: publicData.publicUrl,
        fileType,
        flaggedByServiceMember: body.flaggedByServiceMember,
        flagNote: body.flagNote ?? null,
        aiCaptionStatus: "PENDING",
        createdByUserId: req.user.id,
        ...(delegatedUpload?.grant
          ? { onBehalfOfUserId: entry.supportForm.soldierId, delegationGrantId: delegatedUpload.grant.id }
          : {}),
      },
    });

    // Fire captioning asynchronously — do not await
    generateArtifactCaption(artifact.id).catch((err) => {
      console.error("[artifacts] Captioning error (post-response):", err);
    });

    await prisma.auditLog.create({
      data: {
        actorId: req.user.id,
        action: "ARTIFACT_UPLOADED",
        entityType: "SupportFormEntryArtifact",
        entityId: artifact.id,
        metadata: { entryId, type: body.type, authorizationSource: delegatedUpload?.grant ? "DELEGATION" : "DIRECT" },
        ...(delegatedUpload?.grant
          ? { subjectUserId: entry.supportForm.soldierId, delegationGrantId: delegatedUpload.grant.id, delegationCapability: "UPLOAD_ARTIFACT" }
          : {}),
      },
    });

    res.status(201).json(artifact);
  }),
);

// PATCH /api/support-forms/artifacts/:artifactId/flag
// Soldier updates the self-attestation flag after the fact (e.g. they
// realize a discrepancy after already uploading).
supportFormsRouter.patch(
  "/artifacts/:artifactId/flag",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.user) throw new HttpError(401, "Not authenticated");
    const body = flagArtifactSchema.parse(req.body);
    if (body.flaggedByServiceMember && !body.flagNote) {
      throw new HttpError(400, "flagNote is required when flagging a discrepancy.");
    }
    // Ownership check (MVP audit 5.2) — previously any authenticated user
    // could flag any artifact by ID.
    await requireArtifactOwner(req.params.artifactId!, req.user);
    const updated = await prisma.supportFormEntryArtifact.update({
      where: { id: req.params.artifactId },
      data: {
        flaggedByServiceMember: body.flaggedByServiceMember,
        flagNote: body.flaggedByServiceMember ? (body.flagNote ?? null) : null,
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: req.user.id,
        action: "ARTIFACT_FLAGGED",
        entityType: "SupportFormEntryArtifact",
        entityId: req.params.artifactId!,
        metadata: { flagged: body.flaggedByServiceMember },
      },
    });

    res.json(updated);
  }),
);

// Organization is limited to artifact classification. Flagging remains the
// rated Soldier's own attestation and is intentionally handled separately.
supportFormsRouter.patch(
  "/artifacts/:artifactId",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.user) throw new HttpError(401, "Not authenticated");
    const body = organizeArtifactSchema.parse(req.body);
    const artifact = await prisma.supportFormEntryArtifact.findUnique({
      where: { id: req.params.artifactId },
      include: { entry: { include: { supportForm: true } } },
    });
    if (!artifact) throw new HttpError(404, "Artifact not found.");
    const directAccess = req.user.roles.includes("ADMIN") || artifact.entry.supportForm.soldierId === req.user.id;
    const delegatedOrganization = directAccess
      ? undefined
      : await authorizeDelegatedAction({
          actorUserId: req.user.id,
          subjectUserId: artifact.entry.supportForm.soldierId,
          capability: "ORGANIZE_ARTIFACT",
          supportFormId: artifact.entry.supportFormId,
          ratingAssignmentId: artifact.entry.supportForm.ratingSchemeAssignmentId ?? undefined,
        });
    if (!directAccess && !delegatedOrganization?.allowed) throw new HttpError(403, "You are not authorized to organize this artifact.");

    const updated = await prisma.supportFormEntryArtifact.update({
      where: { id: artifact.id },
      data: { type: body.type, lastEditedByUserId: req.user.id },
    });
    await prisma.auditLog.create({
      data: {
        actorId: req.user.id,
        action: "ARTIFACT_ORGANIZED",
        entityType: "SupportFormEntryArtifact",
        entityId: artifact.id,
        metadata: { type: body.type, authorizationSource: delegatedOrganization?.grant ? "DELEGATION" : "DIRECT" },
        ...(delegatedOrganization?.grant
          ? { subjectUserId: artifact.entry.supportForm.soldierId, delegationGrantId: delegatedOrganization.grant.id, delegationCapability: "ORGANIZE_ARTIFACT" }
          : {}),
      },
    });
    res.json(updated);
  }),
);

// PATCH /api/support-forms/entries/:entryId/confirm
// Rater/SR/reviewer explicitly reviews a soldier-logged entry: confirms it
// as usable context, requests clarification, or marks it not used. Distinct
// from the soldier's own `flaggedByServiceMember` disclosure on an artifact
// (that's the soldier's own attestation; this is the rater's review).
// Confirming does NOT transform a self-uploaded artifact into an
// authoritative record — it only reflects rater review. (MVP audit 5.4)
supportFormsRouter.patch(
  "/entries/:entryId/confirm",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.user) throw new HttpError(401, "Not authenticated");
    const body = confirmEntrySchema.parse(req.body);
    if (body.status === "NEEDS_CLARIFICATION" && !body.clarificationNote) {
      throw new HttpError(
        400,
        "clarificationNote is required when status is NEEDS_CLARIFICATION.",
      );
    }

    const entry = await prisma.supportFormEntry.findUnique({
      where: { id: req.params.entryId },
      include: { supportForm: true },
    });
    if (!entry) throw new HttpError(404, "Support form entry not found.");
    if (!entry.supportForm.ratingChainId) {
      throw new HttpError(
        409,
        "This support form is not linked to a rating chain — cannot verify authorization.",
      );
    }

    // Only the rating chain's rater/senior rater/reviewer (or an ADMIN) may
    // confirm an entry — never the rated soldier themselves.
    const chain = await prisma.ratingChain.findUnique({ where: { id: entry.supportForm.ratingChainId } });
    if (!canConfirmSupportFormEntry(req.user, entry, chain)) {
      throw new HttpError(403, "You are not authorized to confirm this support form entry.");
    }

    const updated = await prisma.supportFormEntry.update({
      where: { id: req.params.entryId },
      data: {
        confirmationStatus: body.status as never,
        confirmedById: req.user.id,
        confirmedAt: new Date(),
        lockedAt: body.status === "CONFIRMED" ? new Date() : null,
        lockReason: body.status === "CONFIRMED" ? "RATER_CONFIRMED" : null,
        clarificationNote:
          body.status === "NEEDS_CLARIFICATION" ? (body.clarificationNote ?? null) : null,
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: req.user.id,
        action: "ENTRY_CONFIRMATION_CHANGED",
        entityType: "SupportFormEntry",
        entityId: entry.id,
        metadata: { status: body.status },
      },
    });

    res.json(updated);
  }),
);

supportFormsRouter.post(
  "/:id/review-requests",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.user) throw new HttpError(401, "Not authenticated");
    const body = reviewRequestSchema.parse(req.body);
    const form = await prisma.supportForm.findUnique({ where: { id: req.params.id }, include: { ratingChain: true } });
    if (!form || !form.ratingChain) throw new HttpError(404, "Support form not found.");
    const capability = body.recipient === "SOLDIER" ? "REQUEST_SOLDIER_REVIEW" : "REQUEST_RATER_REVIEW";
    const access = await authorizeSupportFormWorkflowAction(req.user, form, capability);
    if (!access.allowed) throw new HttpError(403, "You are not authorized to request this review.");
    const recipientId = body.recipient === "SOLDIER" ? form.soldierId : form.ratingChain.raterId;
    if (recipientId === req.user.id) throw new HttpError(422, "You cannot request a review from yourself.");

    await notify({
      userId: recipientId,
      category: "COLLABORATION",
      title: "Support Form Review Requested",
      message: body.note || "A scoped workflow participant requested your review of the support form.",
      actionUrl: `/support-form?formId=${form.id}`,
      actionLabel: "Open support form",
    });
    await prisma.auditLog.create({
      data: {
        actorId: req.user.id,
        action: "SUPPORT_FORM_REVIEW_REQUESTED",
        entityType: "SupportForm",
        entityId: form.id,
        metadata: { recipient: body.recipient, authorizationSource: access.source },
        ...(access.source === "DELEGATION" && access.grant
          ? { subjectUserId: form.soldierId, delegationGrantId: access.grant.id, delegationCapability: capability }
          : {}),
      },
    });
    res.status(202).json({ recipient: body.recipient });
  }),
);

supportFormsRouter.post(
  "/:id/reminders",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.user) throw new HttpError(401, "Not authenticated");
    const body = reminderSchema.parse(req.body);
    const form = await prisma.supportForm.findUnique({ where: { id: req.params.id }, include: { ratingChain: true } });
    if (!form || !form.ratingChain) throw new HttpError(404, "Support form not found.");
    const access = await authorizeSupportFormWorkflowAction(req.user, form, "SEND_WORKFLOW_REMINDER");
    if (!access.allowed) throw new HttpError(403, "You are not authorized to send workflow reminders.");
    const recipientId = body.recipient === "SOLDIER"
      ? form.soldierId
      : body.recipient === "RATER"
        ? form.ratingChain.raterId
        : form.ratingChain.seniorRaterId;
    if (recipientId === req.user.id) throw new HttpError(422, "You cannot send a workflow reminder to yourself.");

    await notify({
      userId: recipientId,
      category: "DELEGATE",
      title: "Support Form Workflow Reminder",
      message: body.note,
      actionUrl: `/support-form?formId=${form.id}`,
      actionLabel: "Open support form",
    });
    await prisma.auditLog.create({
      data: {
        actorId: req.user.id,
        action: "SUPPORT_FORM_WORKFLOW_REMINDER_SENT",
        entityType: "SupportForm",
        entityId: form.id,
        metadata: { recipient: body.recipient, authorizationSource: access.source },
        ...(access.source === "DELEGATION" && access.grant
          ? { subjectUserId: form.soldierId, delegationGrantId: access.grant.id, delegationCapability: "SEND_WORKFLOW_REMINDER" }
          : {}),
      },
    });
    res.status(202).json({ recipient: body.recipient });
  }),
);

// DELETE /api/support-forms/artifacts/:artifactId
supportFormsRouter.delete(
  "/artifacts/:artifactId",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.user) throw new HttpError(401, "Not authenticated");
    // Ownership check (MVP audit 5.2) — previously any authenticated user
    // could delete any artifact by ID.
    await requireArtifactOwner(req.params.artifactId!, req.user);
    await prisma.auditLog.create({
      data: {
        actorId: req.user.id,
        action: "ARTIFACT_DELETED",
        entityType: "SupportFormEntryArtifact",
        entityId: req.params.artifactId!,
      },
    });
    await prisma.supportFormEntryArtifact.delete({ where: { id: req.params.artifactId } });
    res.status(204).send();
  }),
);

