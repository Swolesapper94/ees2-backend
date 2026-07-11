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
  soldierId: z.string().min(1),
  ratingChainId: z.string().min(1),
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

const createEntrySchema = z.object({
  section: z.string().min(1),
  entryType: z.enum(["OBJECTIVE", "ACCOMPLISHMENT"]),
  rawText: z.string().min(1),
  tags: z.array(z.string()).default([]),
  isHighlight: z.boolean().default(false),
  entryDate: z.coerce.date().optional(),
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
    const soldierId =
      typeof req.query.soldierId === "string" ? req.query.soldierId : undefined;
    const forms = await prisma.supportForm.findMany({
      where: soldierId ? { soldierId } : undefined,
      include: {
        entries: { include: { artifacts: true }, orderBy: { entryDate: "desc" } },
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

    const [soldier, chain] = await Promise.all([
      prisma.user.findUnique({ where: { id: body.soldierId } }),
      prisma.ratingChain.findUnique({
        where: { id: body.ratingChainId },
        include: { evaluations: { select: { id: true, supportFormId: true } } },
      }),
    ]);
    if (!soldier) throw new HttpError(404, "Soldier not found");
    if (!chain) throw new HttpError(404, "Rating chain not found");
    if (chain.ratedSoldierId !== body.soldierId) {
      throw new HttpError(400, "Rating chain does not belong to this soldier");
    }

    const unconsumedForm = await prisma.supportForm.findFirst({
      where: {
        ratingChainId: body.ratingChainId,
        isActive: true,
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

    const { evalType: evalCategory } = resolveFormType(soldier.rank);
    const allowed = allowedFieldsFor(evalCategory);
    const rejected = Object.keys(body).filter(
      (k) =>
        !["soldierId", "ratingChainId", "ratingPeriodStart", "ratingPeriodEnd"].includes(k) &&
        !allowed.includes(k),
    );
    if (rejected.length > 0) {
      throw new HttpError(
        400,
        `Field(s) not applicable to ${evalCategory} support forms: ${rejected.join(", ")}`,
      );
    }

    const form = await prisma.supportForm.create({
      data: { ...body, evalCategory },
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
        entries: { include: { artifacts: true }, orderBy: { entryDate: "desc" } },
        soldier: true,
      },
    });
    if (!form) {
      res.status(404).json({ error: "Support form not found" });
      return;
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
    const form = await prisma.supportForm.findUnique({ where: { id: req.params.id } });
    if (!form) throw new HttpError(404, "Support form not found");
    if (!form.evalCategory) {
      throw new HttpError(500, "Support form is missing evalCategory — data integrity issue");
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
    const result = await checkCompleteness(req.params.id!);
    if (!result.hardComplete) {
      res.status(409).json({ error: "Support form is not complete", missing: result.missing });
      return;
    }
    const updated = await prisma.supportForm.update({
      where: { id: req.params.id },
      data: { completedAt: new Date() },
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
    const body = createEntrySchema.parse(req.body);
    const entry = await prisma.supportFormEntry.create({
      data: {
        supportFormId: req.params.id!,
        section: body.section as never,
        entryType: body.entryType as never,
        rawText: body.rawText,
        tags: body.tags,
        isHighlight: body.isHighlight,
        ...(body.entryDate ? { entryDate: body.entryDate } : {}),
      },
    });

    if (req.user) {
      await prisma.auditLog.create({
        data: {
          actorId: req.user.id,
          action: "ENTRY_CREATED",
          entityType: "SupportFormEntry",
          entityId: entry.id,
          metadata: { section: body.section, entryType: body.entryType },
        },
      });
    }

    res.status(201).json(entry);
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
    const entry = await requireSupportFormEntryOwner(entryId!, req.user);
    if (entry.supportFormId !== formId) {
      throw new HttpError(400, "Entry does not belong to the specified support form.");
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
        metadata: { entryId, type: body.type },
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
    await requireRatingChainRole(entry.supportForm.ratingChainId, req.user, [
      "RATER",
      "SENIOR_RATER",
      "REVIEWER",
    ]);

    const updated = await prisma.supportFormEntry.update({
      where: { id: req.params.entryId },
      data: {
        confirmationStatus: body.status as never,
        confirmedById: req.user.id,
        confirmedAt: new Date(),
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

