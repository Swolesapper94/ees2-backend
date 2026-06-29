/**
 * Support Form Upload endpoints
 *
 * POST /api/support-form-uploads/:evalId        — upload PDF/image, trigger pipeline
 * GET  /api/support-form-uploads/:evalId/status — poll pipeline status + suggestions
 * POST /api/support-form-uploads/:evalId/generate-scratch — from-scratch for a section
 * PATCH /api/support-form-uploads/bullets/:bulletId — accept / edit / reject a suggestion
 */

import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { asyncHandler, HttpError } from "@/middleware/error";
import { requireAuth } from "@/middleware/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  runSupportFormPipeline,
  generateBulletsFromScratch,
} from "@/lib/ai/support-form-pipeline";

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
  soldierRank: z.string().min(1),
  soldierMos: z.string().min(1),
  dutyTitle: z.string().min(1),
  formType: z.string().min(1),
});

const bulletReviewSchema = z.object({
  action: z.enum(["ACCEPTED", "EDITED", "REJECTED"]),
  editedText: z.string().max(300).optional(),
  reviewedById: z.string().optional(),
});

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

    const fileUrl = publicData.publicUrl;

    // Create upload record
    const uploadedById = (req as unknown as { user: { id: string } }).user?.id ?? "dev";
    const uploadRecord = await prisma.supportFormUpload.create({
      data: {
        evaluationId: evalId,
        uploadedById,
        fileUrl,
        fileType,
        parseStatus: "PENDING_EXTRACT",
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
      message: "File uploaded. Processing has started.",
    });
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
    const body = scratchSchema.parse(req.body);

    const bullets = await generateBulletsFromScratch({
      evaluationId: evalId,
      sectionKey: body.sectionKey,
      raterDescription: body.raterDescription,
      soldierInfo: {
        rank: body.soldierRank,
        mos: body.soldierMos,
        dutyTitle: body.dutyTitle,
        formType: body.formType,
      },
    });

    // Persist as suggestions
    const created = await prisma.aIBulletSuggestion.createMany({
      data: bullets
        .filter((b) => b.text)
        .map((b) => ({
          evaluationId: evalId,
          sectionKey: body.sectionKey as never,
          text: b.text.slice(0, 300),
          confidence: (b.confidence ?? "MEDIUM") as never,
          rank: b.rank ?? 1,
          status: "PENDING_REVIEW" as never,
          sourceEntryIds: [],
        })),
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

// ─── PATCH /api/support-form-uploads/bullets/:bulletId ───────────────────────
// Accept / Edit / Reject a bullet suggestion

supportFormUploadsRouter.patch(
  "/bullets/:bulletId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { bulletId } = req.params;
    const body = bulletReviewSchema.parse(req.body);

    if (body.action === "EDITED" && !body.editedText) {
      throw new HttpError(400, "editedText is required when action is EDITED.");
    }

    const updated = await prisma.aIBulletSuggestion.update({
      where: { id: bulletId },
      data: {
        status: body.action as never,
        editedText: body.action === "EDITED" ? body.editedText : null,
        reviewedById: body.reviewedById ?? null,
        reviewedAt: new Date(),
      },
    });

    res.json(updated);
  }),
);
