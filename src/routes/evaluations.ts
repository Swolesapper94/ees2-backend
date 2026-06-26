import { Router } from "express";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { asyncHandler, HttpError } from "@/middleware/error";
import { requireAuth } from "@/middleware/auth";
import {
  runConsistencyCheck,
  type SectionForCheck,
} from "@/lib/ai/consistency-check";

export const evaluationsRouter = Router();

const PART_IV_SECTIONS = [
  "CHARACTER",
  "PRESENCE",
  "INTELLECT",
  "LEADS",
  "DEVELOPS",
  "ACHIEVES",
] as const;

const createEvalSchema = z.object({
  ratingChainId: z.string().min(1),
  supportFormId: z.string().optional(),
  formType: z.enum(["NCOER_9_1", "NCOER_9_2", "NCOER_9_3"]),
  periodStart: z.coerce.date(),
  periodEnd: z.coerce.date(),
  ratedMonths: z.number().int().nonnegative(),
  reasonForSubmission: z.string().min(1),
});

const updateSectionSchema = z.object({
  ratingBinary: z.string().nullish(),
  ratingFourLevel: z.string().nullish(),
  stagingBullets: z.array(z.string()).optional(),
  finalBullets: z.array(z.string()).optional(),
  bulletSources: z.record(z.string()).nullish(),
  isComplete: z.boolean().optional(),
});

const updateEvalSchema = z.object({
  principalDutyTitle: z.string().optional(),
  dutyDescription: z.string().optional(),
  seniorRaterRating: z.string().nullish(),
});

const signSchema = z.object({
  role: z.enum(["RATER", "SENIOR_RATER", "REVIEWER", "SOLDIER"]),
  action: z.enum(["SIGN", "DECLINE"]),
  declineReason: z.string().optional(),
});

// GET /api/evaluations
evaluationsRouter.get(
  "/",
  requireAuth,
  asyncHandler(async (_req, res) => {
    const evals = await prisma.evaluation.findMany({
      include: {
        ratingChain: { include: { ratedSoldier: true, rater: true, seniorRater: true } },
        signatures: true,
      },
      orderBy: { updatedAt: "desc" },
    });
    res.json(evals);
  }),
);

// POST /api/evaluations — creates the eval + empty Part IV sections
evaluationsRouter.post(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = createEvalSchema.parse(req.body);
    const created = await prisma.evaluation.create({
      data: {
        ...body,
        sections: {
          create: PART_IV_SECTIONS.map((section) => ({ section })),
        },
      },
      include: { sections: true },
    });
    res.status(201).json(created);
  }),
);

// GET /api/evaluations/:id
evaluationsRouter.get(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const evaluation = await prisma.evaluation.findUnique({
      where: { id: req.params.id },
      include: {
        sections: true,
        signatures: true,
        ratingChain: {
          include: { ratedSoldier: true, rater: true, seniorRater: true, reviewer: true },
        },
        supportForm: { include: { entries: true } },
      },
    });
    if (!evaluation) {
      res.status(404).json({ error: "Evaluation not found" });
      return;
    }
    res.json(evaluation);
  }),
);

// PATCH /api/evaluations/:id — update top-level fields (duty, sr rating, etc.)
evaluationsRouter.patch(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = updateEvalSchema.parse(req.body);
    const updated = await prisma.evaluation.update({
      where: { id: req.params.id },
      data: {
        ...(body.principalDutyTitle !== undefined
          ? { principalDutyTitle: body.principalDutyTitle }
          : {}),
        ...(body.seniorRaterRating !== undefined
          ? { seniorRaterRating: body.seniorRaterRating as never }
          : {}),
      },
    });
    res.json(updated);
  }),
);

// PATCH /api/evaluations/:id/sections/:section
evaluationsRouter.patch(
  "/:id/sections/:section",
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = updateSectionSchema.parse(req.body);
    const updated = await prisma.evalSection.update({
      where: {
        evaluationId_section: {
          evaluationId: req.params.id!,
          section: req.params.section as never,
        },
      },
      data: {
        ...(body.ratingBinary !== undefined
          ? { ratingBinary: body.ratingBinary as never }
          : {}),
        ...(body.ratingFourLevel !== undefined
          ? { ratingFourLevel: body.ratingFourLevel as never }
          : {}),
        ...(body.stagingBullets ? { stagingBullets: body.stagingBullets } : {}),
        ...(body.finalBullets ? { finalBullets: body.finalBullets } : {}),
        ...(body.bulletSources !== undefined
          ? { bulletSources: body.bulletSources ?? undefined }
          : {}),
        ...(body.isComplete !== undefined
          ? { isComplete: body.isComplete, completedAt: body.isComplete ? new Date() : null }
          : {}),
      },
    });
    res.json(updated);
  }),
);

// POST /api/evaluations/:id/consistency-check
evaluationsRouter.post(
  "/:id/consistency-check",
  requireAuth,
  asyncHandler(async (req, res) => {
    const evaluation = await prisma.evaluation.findUnique({
      where: { id: req.params.id },
      include: {
        sections: true,
        supportForm: { include: { entries: true } },
      },
    });
    if (!evaluation) throw new HttpError(404, "Evaluation not found");

    const sections: SectionForCheck[] = evaluation.sections.map((s) => ({
      section: s.section,
      ratingBinary: s.ratingBinary,
      ratingFourLevel: s.ratingFourLevel,
      finalBullets: s.finalBullets,
      bulletSources:
        (s.bulletSources as Record<string, never> | null) ?? undefined,
    }));

    const uncounseledEntryCount =
      evaluation.supportForm?.entries.filter((e) => !e.counseled).length ?? 0;

    const flags = runConsistencyCheck({ sections, uncounseledEntryCount });
    res.json({ flags });
  }),
);

// POST /api/evaluations/:id/sign
evaluationsRouter.post(
  "/:id/sign",
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = signSchema.parse(req.body);
    if (!req.user) throw new HttpError(401, "Not authenticated");

    const signature = await prisma.signature.upsert({
      where: {
        evaluationId_role: { evaluationId: req.params.id!, role: body.role },
      },
      create: {
        evaluationId: req.params.id!,
        userId: req.user.id,
        role: body.role,
        status: body.action === "SIGN" ? "SIGNED" : "DECLINED",
        signedAt: body.action === "SIGN" ? new Date() : null,
        declineReason: body.action === "DECLINE" ? body.declineReason : null,
      },
      update: {
        status: body.action === "SIGN" ? "SIGNED" : "DECLINED",
        signedAt: body.action === "SIGN" ? new Date() : null,
        declineReason: body.action === "DECLINE" ? body.declineReason : null,
      },
    });

    await prisma.auditLog.create({
      data: {
        evaluationId: req.params.id,
        actorId: req.user.id,
        action: body.action === "SIGN" ? "SIGNATURE_APPLIED" : "SIGNATURE_DECLINED",
        entityType: "Signature",
        entityId: signature.id,
      },
    });

    res.json(signature);
  }),
);
