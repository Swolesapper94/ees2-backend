/**
 * Support Form Upload endpoints
 *
 * POST /api/support-form-uploads/:evalId        — upload PDF/image, trigger pipeline
 * GET  /api/support-form-uploads/:evalId/status — poll pipeline status + suggestions
 * POST /api/support-form-uploads/:evalId/generate-scratch — from-scratch for a section
 * POST /api/support-form-uploads/:evalId/generate-from-entries — from selected SupportFormEntry rows
 * PATCH /api/support-form-uploads/bullets/:bulletId — accept / edit / reject a suggestion
 */

import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import fs from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";
import { asyncHandler, HttpError } from "@/middleware/error";
import { requireAuth } from "@/middleware/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  runSupportFormPipeline,
  generateBulletsFromScratch,
  generateBulletsFromEntries,
} from "@/lib/ai/support-form-pipeline";
import { requireEvalChainRole, requireEntriesBelongToEval } from "@/lib/utils/chain-auth";
import { checkUnsupportedFacts } from "@/lib/ai/unsupported-fact-check";
import { sanitizeBulletText } from "@/lib/ai/openai";

export const supportFormUploadsRouter = Router();

// Multer configured to hold file in memory (max 20 MB — support forms are small)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF and image files (JPEG, PNG, WEBP) are accepted."));
    }
  },
});

const scratchSchema = z.object({
  sectionKey: z.enum([
    "CHARACTER",
    "PRESENCE",
    "INTELLECT",
    "LEADS",
    "DEVELOPS",
    "ACHIEVES",
  ]),
  raterDescription: z.string().min(10).max(4000),
});

const bulletReviewSchema = z.object({
  action: z.enum(["ACCEPTED", "EDITED", "REJECTED"]),
  editedText: z.string().max(300).optional(),
  reviewedById: z.string().optional(),
});

const fromEntriesSchema = z.object({
  sectionKey: z.enum([
    "CHARACTER",
    "PRESENCE",
    "INTELLECT",
    "LEADS",
    "DEVELOPS",
    "ACHIEVES",
  ]),
  entryIds: z.array(z.string().min(1)).min(1),
});

async function loadGenerationContext(evaluationId: string) {
  const evaluation = await prisma.evaluation.findUnique({
    where: { id: evaluationId },
    include: {
      ratingChain: { include: { ratedSoldier: true } },
      supportForm: { select: { dutyTitle: true } },
    },
  });
  if (!evaluation) throw new HttpError(404, "Evaluation not found.");
  return {
    rank: evaluation.ratingChain.ratedSoldier.rank,
    mos: evaluation.ratingChain.ratedSoldier.mos,
    dutyTitle: evaluation.principalDutyTitle ?? evaluation.supportForm?.dutyTitle ?? "Soldier",
    formType: evaluation.formType,
  };
}

function uploadContentType(fileUrl: string, fileType: string): string {
  if (fileType === "pdf") return "application/pdf";
  const extension = path.extname(fileUrl).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";
  return "image/jpeg";
}

// ─── POST /api/support-form-uploads/:evalId ───────────────────────────────────

supportFormUploadsRouter.post(
  "/:evalId",
  requireAuth,
  upload.single("file"),
  asyncHandler(async (req, res) => {
    const { evalId } = req.params;
    if (!evalId) throw new HttpError(400, "Missing evalId.");
    const file = req.file;
    if (!file) throw new HttpError(400, "No file provided.");

    // Verify eval exists
    const evaluation = await prisma.evaluation.findUnique({
      where: { id: evalId },
      include: {
        ratingChain: { include: { ratedSoldier: true, rater: true } },
      },
    });
    if (!evaluation) throw new HttpError(404, "Evaluation not found.");

    // Upload file to Supabase Storage
    const fileExt = file.originalname.split(".").pop() ?? "bin";
    const storagePath = `support-forms/${evalId}/${Date.now()}.${fileExt}`;
    const fileType = file.mimetype.startsWith("image") ? "image" : "pdf";

    let fileUrl = "";
    let uploadedSuccessfully = false;
    let devModeWarning = "";

    try {
      const supabase = getSupabaseAdmin();
      const { error: uploadError } = await supabase.storage
        .from("evaluations")
        .upload(storagePath, file.buffer, {
          contentType: file.mimetype,
          upsert: false,
        });

      if (uploadError) {
        throw new HttpError(500, `Storage upload failed: ${uploadError.message}`);
      }

      const { data: publicData } = supabase.storage
        .from("evaluations")
        .getPublicUrl(storagePath);

      fileUrl = publicData.publicUrl;
      uploadedSuccessfully = true;
    } catch (err) {
      // Handle missing Supabase service role key gracefully for dev.
      // Two possible error messages depending on where the failure occurs:
      // - "SUPABASE_SERVICE_ROLE_KEY is required" — our custom check in getSupabaseAdmin()
      // - "supabaseKey is required" — raw error from the @supabase/supabase-js client itself
      const isMissingKeyError =
        err instanceof Error &&
        (err.message.includes("SUPABASE_SERVICE_ROLE_KEY is required") ||
          err.message.includes("supabaseKey is required"));

      if (isMissingKeyError) {
        console.warn(
          `[support-form-uploads] DEV MODE: SUPABASE_SERVICE_ROLE_KEY not set. ` +
          `File upload to Supabase Storage skipped. Saving to temp file for pipeline. ` +
          `To fix: Add SUPABASE_SERVICE_ROLE_KEY to .env and restart backend.`
        );
        
        // Save buffer to temp file so pipeline can read it
        const fileExt = file.originalname.split(".").pop() ?? "bin";
        const tempDir = path.join(process.cwd(), "temp-uploads");
        
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }
        
        // Generate temp filename with timestamp (uploadRecord doesn't exist yet)
        const tempFileName = `support-form-${evalId}-${Date.now()}.${fileExt}`;
        const tempFilePath = path.join(tempDir, tempFileName);
        fs.writeFileSync(tempFilePath, file.buffer);
        
        // Use file:// URL so pipeline can read it
        fileUrl = `file://${tempFilePath}`;
        uploadedSuccessfully = false;
        devModeWarning = "Running in dev mode: file saved to temp directory, not uploaded to Supabase Storage";
        
        console.log(`[support-form-uploads] DEV MODE: Saved file to ${tempFilePath}`);
      } else {
        // Re-throw any other errors
        throw err;
      }
    }

    // Create upload record
    const uploadedById = (req as unknown as { user: { id: string } }).user?.id ?? "dev";
    const uploadRecord = await prisma.supportFormUpload.create({
      data: {
        evaluationId: evalId,
        uploadedById,
        fileUrl,
        fileType,
        parseStatus: "PENDING_EXTRACT",  // Always queue for pipeline, dev-mode triggers will be logged there
      },
    });

    // Fire pipeline asynchronously — do not await
    const soldier = evaluation.ratingChain.ratedSoldier;
    const rankStr = String(soldier.rank);
    const formType = String(evaluation.formType);

    runSupportFormPipeline({
      uploadId: uploadRecord.id,
      evaluationId: evalId,
      fileUrl,
      fileType,
      soldierInfo: {
        rank: rankStr,
        mos: soldier.mos,
        dutyTitle: evaluation.principalDutyTitle ?? "Soldier",
        formType,
      },
    }).catch((err) => {
      console.error("[upload] Pipeline error (post-response):", err);
    });

    res.status(202).json({
      uploadId: uploadRecord.id,
      status: uploadRecord.parseStatus,
      message: uploadedSuccessfully 
        ? "File uploaded. Processing has started."
        : "Dev mode: File queued for mock processing. To enable real uploads, set SUPABASE_SERVICE_ROLE_KEY in .env",
      devModeWarning: devModeWarning || undefined,
    });
  }),
);

// POST /api/support-form-uploads/:evalId/reprocess
// Creates a new upload-processing record from the latest original file. Prior
// suggestions stay intact for history; the status endpoint returns this latest
// run, so the rater sees the new evidence-grounded suggestions.
supportFormUploadsRouter.post(
  "/:evalId/reprocess",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { evalId } = req.params;
    if (!evalId) throw new HttpError(400, "Missing evalId.");
    if (!req.user) throw new HttpError(401, "Not authenticated");
    await requireEvalChainRole(evalId, req.user, ["RATER", "SENIOR_RATER"]);

    const [evaluation, latestUpload] = await Promise.all([
      prisma.evaluation.findUnique({
        where: { id: evalId },
        include: { ratingChain: { include: { ratedSoldier: true } } },
      }),
      prisma.supportFormUpload.findFirst({
        where: { evaluationId: evalId, parseStatus: "COMPLETE" },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    if (!evaluation) throw new HttpError(404, "Evaluation not found.");
    if (!latestUpload) throw new HttpError(409, "No completed support-form upload is available to reprocess.");

    const reprocessedUpload = await prisma.supportFormUpload.create({
      data: {
        evaluationId: evalId,
        uploadedById: req.user.id,
        fileUrl: latestUpload.fileUrl,
        fileType: latestUpload.fileType,
        parseStatus: "PENDING_EXTRACT",
      },
    });
    await prisma.auditLog.create({
      data: {
        evaluationId: evalId,
        actorId: req.user.id,
        action: "SUPPORT_FORM_REPROCESSED",
        entityType: "SupportFormUpload",
        entityId: reprocessedUpload.id,
        metadata: { sourceUploadId: latestUpload.id },
      },
    });

    const soldier = evaluation.ratingChain.ratedSoldier;
    runSupportFormPipeline({
      uploadId: reprocessedUpload.id,
      evaluationId: evalId,
      fileUrl: reprocessedUpload.fileUrl,
      fileType: reprocessedUpload.fileType,
      soldierInfo: {
        rank: String(soldier.rank),
        mos: soldier.mos,
        dutyTitle: evaluation.principalDutyTitle ?? "Soldier",
        formType: String(evaluation.formType),
      },
    }).catch((err) => {
      console.error("[upload] Reprocessing error (post-response):", err);
    });

    res.status(202).json({ uploadId: reprocessedUpload.id, status: reprocessedUpload.parseStatus });
  }),
);

// GET /api/support-form-uploads/:evalId/file
// The browser cannot directly open dev-mode file:// uploads and must not be
// given unauthenticated storage paths. Stream the original file only after the
// caller passes evaluation relationship authorization.
supportFormUploadsRouter.get(
  "/:evalId/file",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { evalId } = req.params;
    if (!evalId) throw new HttpError(400, "Missing evalId.");
    if (!req.user) throw new HttpError(401, "Not authenticated");
    await requireEvalChainRole(evalId, req.user, ["RATER", "SENIOR_RATER", "REVIEWER", "SOLDIER"]);
    const latestUpload = await prisma.supportFormUpload.findFirst({
      where: { evaluationId: evalId },
      orderBy: { createdAt: "desc" },
    });
    if (!latestUpload) throw new HttpError(404, "Uploaded support form not found.");

    res.setHeader("Content-Type", uploadContentType(latestUpload.fileUrl, latestUpload.fileType));
    res.setHeader("Content-Disposition", "inline; filename=uploaded-support-form");
    if (latestUpload.fileUrl.startsWith("file://")) {
      const localPath = path.resolve(latestUpload.fileUrl.slice("file://".length));
      const tempUploadsPath = `${path.resolve(process.cwd(), "temp-uploads")}${path.sep}`;
      if (!localPath.startsWith(tempUploadsPath) || !fs.existsSync(localPath)) {
        throw new HttpError(404, "Uploaded support form file is no longer available.");
      }
      res.sendFile(localPath);
      return;
    }

    const fileResponse = await fetch(latestUpload.fileUrl);
    if (!fileResponse.ok) throw new HttpError(502, "Unable to retrieve the uploaded support form.");
    res.send(Buffer.from(await fileResponse.arrayBuffer()));
  }),
);

// ─── GET /api/support-form-uploads/:evalId/status ────────────────────────────

supportFormUploadsRouter.get(
  "/:evalId/status",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { evalId } = req.params;
    if (!evalId) throw new HttpError(400, "Missing evalId.");

    const latestUpload = await prisma.supportFormUpload.findFirst({
      where: { evaluationId: evalId },
      orderBy: { createdAt: "desc" },
      include: {
        bulletSuggestions: {
          orderBy: [{ sectionKey: "asc" }, { rank: "asc" }],
        },
        extractedEntries: {
          orderBy: { section: "asc" },
        },
      },
    });

    if (!latestUpload) {
      res.json({ hasUpload: false });
      return;
    }

    res.json({
      hasUpload: true,
      uploadId: latestUpload.id,
      fileUrl: latestUpload.fileUrl,
      fileType: latestUpload.fileType,
      parseStatus: latestUpload.parseStatus,
      parseError: latestUpload.parseError,
      extractedEntries: latestUpload.extractedEntries,
      bulletSuggestions: latestUpload.bulletSuggestions,
    });
  }),
);

// ─── POST /api/support-form-uploads/:evalId/generate-scratch ─────────────────

supportFormUploadsRouter.post(
  "/:evalId/generate-scratch",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { evalId } = req.params;
    if (!evalId) throw new HttpError(400, "Missing evalId.");
    if (!req.user) throw new HttpError(401, "Not authenticated");
    await requireEvalChainRole(evalId, req.user, ["RATER", "SENIOR_RATER"]);
    const body = scratchSchema.parse(req.body);
    const soldierInfo = await loadGenerationContext(evalId);

    const bullets = await generateBulletsFromScratch({
      evaluationId: evalId,
      sectionKey: body.sectionKey,
      raterDescription: body.raterDescription,
      soldierInfo,
    });

    // Rater's own free-text description doubles as the "source" here —
    // captured as a snapshot for the same provenance/unsupported-fact
    // treatment as entry-based generation (MVP audit 5.1/5.9/5.10).
    const sourceSnapshot = [
      { entryId: "scratch", rawText: body.raterDescription, artifactCaptions: [] as string[] },
    ];

    // Persist as suggestions
    const created = await prisma.aIBulletSuggestion.createMany({
      data: bullets
        .filter((b) => b.text)
        .map((b) => {
          const cleanText = sanitizeBulletText(b.text);
          return {
            evaluationId: evalId,
            sectionKey: body.sectionKey as never,
            text: cleanText.slice(0, 300),
            confidence: (b.confidence ?? "MEDIUM") as never,
            rank: b.rank ?? 1,
            status: "PENDING_REVIEW" as never,
            sourceEntryIds: [],
            sourceSnapshot: sourceSnapshot as never,
            unsupportedClaims: checkUnsupportedFacts(cleanText, [body.raterDescription]) as never,
          };
        }),
    });

    // Return the newly created suggestions
    const suggestions = await prisma.aIBulletSuggestion.findMany({
      where: {
        evaluationId: evalId,
        sectionKey: body.sectionKey as never,
        uploadId: null,
        status: "PENDING_REVIEW",
      },
      orderBy: { rank: "asc" },
    });

    res.json({ count: created.count, suggestions });
  }),
);

// ─── POST /api/support-form-uploads/:evalId/generate-from-entries ────────────
// Rater has selected one or more soldier-logged SupportFormEntry
// (ACCOMPLISHMENT) rows in the section builder's "Soldier Accomplishments"
// widget. Generates bullets from those entries (+ any artifact AI captions)
// and persists them as reviewable suggestions, same as generate-scratch.

supportFormUploadsRouter.post(
  "/:evalId/generate-from-entries",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { evalId } = req.params;
    if (!evalId) throw new HttpError(400, "Missing evalId.");
    if (!req.user) throw new HttpError(401, "Not authenticated");
    await requireEvalChainRole(evalId, req.user, ["RATER", "SENIOR_RATER"]);
    const body = fromEntriesSchema.parse(req.body);
    const soldierInfo = await loadGenerationContext(evalId);

    // Re-authorize: reject any entryId that doesn't belong to this
    // evaluation's linked support form (previously trusted client input
    // outright — confirmed cross-soldier generation gap, MVP audit 5.6).
    const authorizedEntries = await requireEntriesBelongToEval(evalId, body.entryIds);

    const { bullets, hasFlaggedArtifacts } = await generateBulletsFromEntries({
      evaluationId: evalId,
      sectionKey: body.sectionKey,
      entryIds: body.entryIds,
      soldierInfo,
    });

    // Immutable snapshot of the source text at generation time (MVP audit
    // 5.1/5.9) — survives later edits/deletes of the underlying entries.
    const sourceSnapshot = authorizedEntries.map((e) => ({
      entryId: e.id,
      rawText: e.rawText,
      artifactCaptions: e.artifacts
        .filter((a) => a.aiCaptionStatus === "COMPLETE" && a.aiCaption)
        .map((a) => a.aiCaption as string),
    }));
    const sourceFacts = sourceSnapshot.flatMap((s) => [s.rawText, ...s.artifactCaptions]);

    const created = await prisma.aIBulletSuggestion.createMany({
      data: bullets
        .filter((b) => b.text)
        .map((b) => {
          const cleanText = sanitizeBulletText(b.text);
          return {
            evaluationId: evalId,
            sectionKey: body.sectionKey as never,
            text: cleanText.slice(0, 300),
            confidence: (b.confidence ?? "MEDIUM") as never,
            rank: b.rank ?? 1,
            status: "PENDING_REVIEW" as never,
            sourceEntryIds: body.entryIds,
            sourceSnapshot: sourceSnapshot as never,
            // Deterministic, advisory-only warning (MVP audit 5.10) — never blocks.
            unsupportedClaims: checkUnsupportedFacts(cleanText, sourceFacts) as never,
          };
        }),
    });

    // Best-effort: mark entries as used by this evaluation (visibility only —
    // does not block reuse across sections or evaluations).
    await prisma.supportFormEntry.updateMany({
      where: { id: { in: body.entryIds } },
      data: { usedInEvalId: evalId },
    });

    const suggestions = await prisma.aIBulletSuggestion.findMany({
      where: {
        evaluationId: evalId,
        sectionKey: body.sectionKey as never,
        status: "PENDING_REVIEW",
        sourceEntryIds: { hasSome: body.entryIds },
      },
      orderBy: { rank: "asc" },
    });

    res.json({ count: created.count, suggestions, hasFlaggedArtifacts });
  }),
);

// ─── PATCH /api/support-form-uploads/bullets/:bulletId ───────────────────────
// Accept / Edit / Reject a bullet suggestion.
//
// Transactional + idempotent (MVP audit 5.8): a conditional `updateMany`
// (`where: { id, status: "PENDING_REVIEW" }`) means a concurrent duplicate
// request (double-click, retry) can only ever win the race once — Postgres
// row-locks the matched row during the UPDATE, so a second concurrent call
// sees 0 rows matched once the first commits its status change, and gets a
// clean 409 instead of silently creating a second final bullet. For
// ACCEPTED/EDITED, the suggestion-status flip and the section's
// finalBullets/bulletSources/bulletProvenance append happen inside one
// Serializable transaction, so the two writes can never partially apply.
supportFormUploadsRouter.patch(
  "/bullets/:bulletId",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.user) throw new HttpError(401, "Not authenticated");
    const { bulletId } = req.params;
    const body = bulletReviewSchema.parse(req.body);

    if (body.action === "EDITED" && !body.editedText) {
      throw new HttpError(400, "editedText is required when action is EDITED.");
    }

    const suggestion = await prisma.aIBulletSuggestion.findUnique({
      where: { id: bulletId },
    });
    if (!suggestion) throw new HttpError(404, "Suggestion not found.");

    await requireEvalChainRole(suggestion.evaluationId, req.user, ["RATER", "SENIOR_RATER"]);

    if (body.action === "REJECTED") {
      const result = await prisma.aIBulletSuggestion.updateMany({
        where: { id: bulletId, status: "PENDING_REVIEW" },
        data: { status: "REJECTED", reviewedById: req.user.id, reviewedAt: new Date() },
      });
      if (result.count === 0) {
        throw new HttpError(409, "This suggestion has already been reviewed.");
      }
      const updated = await prisma.aIBulletSuggestion.findUnique({ where: { id: bulletId } });
      await prisma.auditLog.create({
        data: {
          evaluationId: suggestion.evaluationId,
          actorId: req.user.id,
          action: "SUGGESTION_REJECTED",
          entityType: "AIBulletSuggestion",
          entityId: bulletId!,
        },
      });
      res.json({ suggestion: updated });
      return;
    }

    // ACCEPTED or EDITED — atomically flip the suggestion AND append the
    // final bullet + provenance to its target section.
    const finalText = body.action === "EDITED" ? body.editedText! : suggestion.text;
    const source: "AI_MODIFIED" | "AI_UNMODIFIED" =
      finalText !== suggestion.text ? "AI_MODIFIED" : "AI_UNMODIFIED";

    try {
      const result = await prisma.$transaction(
        async (tx) => {
          const claimed = await tx.aIBulletSuggestion.updateMany({
            where: { id: bulletId, status: "PENDING_REVIEW" },
            data: {
              status: source === "AI_MODIFIED" ? "EDITED" : "ACCEPTED",
              editedText: source === "AI_MODIFIED" ? finalText : null,
              reviewedById: req.user!.id,
              reviewedAt: new Date(),
            },
          });
          if (claimed.count === 0) {
            throw new HttpError(409, "This suggestion has already been reviewed.");
          }

          const section = await tx.evalSection.findUnique({
            where: {
              evaluationId_section: {
                evaluationId: suggestion.evaluationId,
                section: suggestion.sectionKey,
              },
            },
          });
          if (!section) throw new HttpError(404, "Target section not found.");

          const finalBullets = [...section.finalBullets, finalText];
          const newIndex = finalBullets.length - 1;
          const bulletSources = {
            ...((section.bulletSources as Record<string, string> | null) ?? {}),
            [String(newIndex)]: source,
          };
          const bulletProvenance = {
            ...((section.bulletProvenance as Record<string, unknown> | null) ?? {}),
            [String(newIndex)]: {
              suggestionId: suggestion.id,
              sourceEntryIds: suggestion.sourceEntryIds,
              sourceSnapshot: suggestion.sourceSnapshot,
            },
          };

          const updatedSection = await tx.evalSection.update({
            where: { id: section.id },
            data: {
              finalBullets,
              bulletSources,
              bulletProvenance: bulletProvenance as never,
            },
          });

          const updatedSuggestion = await tx.aIBulletSuggestion.findUniqueOrThrow({
            where: { id: bulletId },
          });

          return { suggestion: updatedSuggestion, section: updatedSection };
        },
        { isolationLevel: "Serializable" },
      );

      await prisma.auditLog.create({
        data: {
          evaluationId: suggestion.evaluationId,
          actorId: req.user.id,
          action: source === "AI_MODIFIED" ? "SUGGESTION_EDITED" : "SUGGESTION_ACCEPTED",
          entityType: "AIBulletSuggestion",
          entityId: bulletId!,
        },
      });

      res.json(result);
    } catch (err) {
      if (err instanceof HttpError) throw err;
      // Serializable transaction conflict — a genuinely concurrent accept
      // on the same section. Ask the client to retry rather than silently
      // dropping or duplicating a bullet.
      throw new HttpError(409, "Could not save — please try again.");
    }
  }),
);

