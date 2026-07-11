import { Router } from "express";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { asyncHandler, HttpError } from "@/middleware/error";
import { requireAuth } from "@/middleware/auth";
import {
  runConsistencyCheck,
  hasBlockingErrors,
  type SectionForCheck,
} from "@/lib/ai/consistency-check";
import { checkBulletQuality } from "@/lib/ai/prohibited-language";
import { generateMilestones } from "@/lib/milestones/generate";
import { staleSigDetect, captureSignatureHash } from "@/lib/signatures/content-hash";
import { checkCompleteness } from "@/lib/support-form/completeness";
import { recomputeEvalStatus } from "@/lib/evaluations/status";
import { requireEvalChainRole } from "@/lib/utils/chain-auth";
import { srMqCapPercentFor, isNcoGrade } from "@/lib/utils/grade";

export const evaluationsRouter = Router();

const PART_IV_SECTIONS = [
  "CHARACTER",
  "PRESENCE",
  "INTELLECT",
  "LEADS",
  "DEVELOPS",
  "ACHIEVES",
] as const;

const ALL_FORM_TYPES = [
  "NCOER_9_1", "NCOER_9_2", "NCOER_9_3",
  "OER_67_10_1", "OER_67_10_1A",
  "OER_67_10_2", "OER_67_10_2A",
  "OER_67_10_3", "OER_67_10_4",
] as const;

const createEvalSchema = z.object({
  ratingChainId: z.string().min(1),
  supportFormId: z.string().optional(),
  formType: z.enum(ALL_FORM_TYPES),
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
  bulletProvenance: z.record(z.unknown()).nullish(),
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
// ?role=rater     → evaluations where I am the rater (my soldiers' evals)
// ?role=soldier   → evaluations where I am the rated soldier (my own eval)
// (no role param) → all evaluations the user can see (admin / all-evals view)
evaluationsRouter.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const role = req.query.role as string | undefined;
    const userId = req.user?.id;

    let whereClause: Parameters<typeof prisma.evaluation.findMany>[0]["where"] = {};

    if (role === "rater" && userId) {
      whereClause = { ratingChain: { raterId: userId } };
    } else if (role === "soldier" && userId) {
      whereClause = { ratingChain: { ratedSoldierId: userId } };
    }

    const evals = await prisma.evaluation.findMany({
      where: whereClause,
      include: {
        ratingChain: { include: { ratedSoldier: true, rater: true, seniorRater: true } },
        signatures: true,
      },
      orderBy: { updatedAt: "desc" },
    });
    res.json(evals);
  }),
);

// POST /api/evaluations — creates the eval + empty Part IV sections + milestones
evaluationsRouter.post(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = createEvalSchema.parse(req.body);

    // Resolve rater's rank to determine supplementary review requirement
    const chain = await prisma.ratingChain.findUnique({
      where: { id: body.ratingChainId },
      include: { rater: true },
    });
    if (!chain) throw new HttpError(404, "Rating chain not found");
    const requiresSupplementaryReview = chain.rater.rank === "FIRST_LT";

    // ── Support-form gate (2026-07 review) ──────────────────────────
    // Authoritative — the frontend CTA is just courtesy. A Soldier cannot
    // initiate their NCOER/OER until their support form clears the HARD
    // completeness gate (Part I–III + ≥1 goal total; the all-6-dimensions
    // check is a soft indicator elsewhere and never blocks this).
    let supportFormId = body.supportFormId;
    if (!supportFormId) {
      const activeForm = await prisma.supportForm.findFirst({
        where: {
          ratingChainId: body.ratingChainId,
          isActive: true,
          evaluations: { none: {} },
        },
        orderBy: { createdAt: "desc" },
      });
      if (!activeForm) {
        throw new HttpError(
          409,
          "No support form found for this rating chain. Complete a support form before initiating this evaluation.",
        );
      }
      supportFormId = activeForm.id;
    }

    const completeness = await checkCompleteness(supportFormId);
    if (!completeness.hardComplete) {
      throw new HttpError(
        409,
        `Support form is not complete: ${completeness.missing.join(", ")}`,
      );
    }

    const created = await prisma.evaluation.create({
      data: {
        ...body,
        supportFormId,
        requiresSupplementaryReview,
        sections: {
          create: PART_IV_SECTIONS.map((section) => ({ section })),
        },
      },
      include: { sections: true },
    });

    // Auto-generate AR 623-3 milestones
    const milestones = generateMilestones(
      created.id,
      body.periodStart,
      body.periodEnd
    );
    await prisma.evalMilestone.createMany({ data: milestones });

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
        supportForm: { include: { entries: { include: { artifacts: true } } } },
      },
    });
    if (!evaluation) {
      res.status(404).json({ error: "Evaluation not found" });
      return;
    }

    // ── Senior Rater MQ profile snapshot (real live data, not the unused
    // SeniorRaterProfile JSON table which is never updated in normal use) ──
    // Scoped to THIS eval's SR + the rated soldier's own grade, since the MQ
    // cap (AR 623-3: 24% NCO / 50% Officer) is a per-grade constraint. This
    // eval itself is excluded automatically (only SUBMITTED/ACCEPTED/COMPLETE
    // evals count), so the numbers reflect the profile "before" this rating —
    // the frontend projects forward if the SR is about to add another MQ.
    const grade = evaluation.ratingChain.ratedSoldier.rank;
    const gradeEvals = await prisma.evaluation.findMany({
      where: {
        status: { in: ["SUBMITTED", "ACCEPTED", "COMPLETE"] },
        seniorRaterRating: { not: null },
        ratingChain: { seniorRaterId: evaluation.ratingChain.seniorRaterId, ratedSoldier: { rank: grade } },
      },
      select: { seniorRaterRating: true },
    });
    const mqCount = gradeEvals.filter((e) => e.seniorRaterRating === "MOST_QUALIFIED").length;
    const total = gradeEvals.length;
    const srMqProfile = {
      grade,
      isNco: isNcoGrade(grade),
      capPercent: srMqCapPercentFor(grade),
      mqCount,
      total,
      mqPct: total > 0 ? Math.round((mqCount / total) * 100) : 0,
    };

    res.json({ ...evaluation, srMqProfile });
  }),
);

// PATCH /api/evaluations/:id — update top-level fields (duty, sr rating, etc.)
evaluationsRouter.patch(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.user) throw new HttpError(401, "Not authenticated");
    // Only the rating chain's rater/senior rater/reviewer (or an ADMIN) may
    // edit an evaluation's top-level fields — previously any authenticated
    // user could edit any evaluation by ID (MVP audit 5.13 cross-cutting
    // gap: "no rating-chain authorization on section PATCH at all", which
    // applied equally to this route).
    await requireEvalChainRole(req.params.id!, req.user, [
      "RATER",
      "SENIOR_RATER",
      "REVIEWER",
    ]);
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
    if (!req.user) throw new HttpError(401, "Not authenticated");
    // Rating-chain authorization (MVP audit 5.13) — previously this route had
    // no ownership check at all, so any authenticated user could edit any
    // evaluation's sections. Rater AND senior rater (and reviewer) are all
    // allowed, preserving the intentional "parallel review" behavior (SR can
    // view/edit before the rater signs) rather than accidentally locking
    // that down while closing the access-control gap.
    await requireEvalChainRole(req.params.id!, req.user, [
      "RATER",
      "SENIOR_RATER",
      "REVIEWER",
    ]);
    const body = updateSectionSchema.parse(req.body);

    // Prohibited-language / quality enforcement (MVP audit 5.14) — this is
    // the actual server-side gate: ees2-frontend/src/lib/ai/prohibited-language.ts
    // is a complete checker that was never imported anywhere, meaning a
    // direct API call could always bypass it even if the frontend used it.
    // Reject the write outright if any final bullet contains an ERROR-level
    // issue (first person, protected-class references, SSN, future-tense
    // promises, over-length). WARNING-level issues (vague language,
    // superlatives) are not blocked here — they still surface via the
    // pre-submission consistency check.
    if (body.finalBullets) {
      const violations: string[] = [];
      for (const bullet of body.finalBullets) {
        const { issues } = checkBulletQuality(bullet);
        for (const issue of issues) {
          if (issue.severity === "ERROR") {
            violations.push(`"${issue.match}" — ${issue.suggestion}`);
          }
        }
      }
      if (violations.length > 0) {
        throw new HttpError(
          400,
          `One or more bullets contain prohibited language: ${violations.join("; ")}`,
        );
      }
    }

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
        ...(body.bulletProvenance !== undefined
          ? { bulletProvenance: (body.bulletProvenance ?? undefined) as never }
          : {}),
        ...(body.isComplete !== undefined
          ? { isComplete: body.isComplete, completedAt: body.isComplete ? new Date() : null }
          : {}),
      },
    });

    // Stale-detect any signatures whose hash no longer matches
    if (req.user && (body.finalBullets || body.ratingBinary || body.ratingFourLevel)) {
      staleSigDetect(req.params.id!, req.user.id).catch(() => {/* non-blocking */});
    }

    // Re-derive evaluation status from real section-completion state
    // (MVP audit 5.12 — status previously never transitioned at all).
    if (req.user && body.isComplete !== undefined) {
      await recomputeEvalStatus(req.params.id!, req.user.id);
    }

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
      bulletProvenance:
        (s.bulletProvenance as SectionForCheck["bulletProvenance"]) ?? undefined,
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

    // ── AUTHORIZATION: caller must actually hold the role they're signing as ──
    // (previously any authenticated user could sign as any role on any eval).
    await requireEvalChainRole(req.params.id!, req.user, [body.role]);

    // ── AUTHORIZATION: prevent the same user from signing in multiple roles ──
    // A user cannot be both the rater AND the senior rater (or any other multi-role combo)
    // on the same evaluation — each role must be independent.
    const existingSigs = await prisma.signature.findMany({
      where: { evaluationId: req.params.id },
    });
    const alreadySigned = existingSigs.find((sig) => sig.userId === req.user!.id);
    if (alreadySigned && alreadySigned.role !== body.role) {
      throw new HttpError(
        403,
        `You are already signed as ${alreadySigned.role} on this evaluation. A user cannot sign in multiple roles.`,
      );
    }

    // Capture content hash at signing time
    let contentHash: string | undefined;
    if (body.action === "SIGN") {
      try {
        contentHash = await captureSignatureHash(
          req.params.id!,
          body.role as "RATER" | "SENIOR_RATER" | "SOLDIER" | "REVIEWER",
        );
      } catch {
        // Non-fatal — proceed without hash
      }
    }

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
        contentHash: contentHash ?? null,
        isStale: false,
      },
      update: {
        status: body.action === "SIGN" ? "SIGNED" : "DECLINED",
        signedAt: body.action === "SIGN" ? new Date() : null,
        declineReason: body.action === "DECLINE" ? body.declineReason : null,
        contentHash: contentHash ?? null,
        isStale: false,
        staledAt: null,
        staledByUserId: null,
        staledReason: null,
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

    // Re-derive evaluation status now that a signature changed (MVP audit 5.12).
    await recomputeEvalStatus(req.params.id!, req.user.id);

    res.json(signature);
  }),
);

// POST /api/evaluations/:id/submit-to-hdqa
// Transitions COMPLETE → SUBMITTED after all required signatures are collected.
// Only callable when the evaluation status is COMPLETE.
evaluationsRouter.post(
  "/:id/submit-to-hdqa",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.user) throw new HttpError(401, "Not authenticated");

    const evaluation = await prisma.evaluation.findUnique({
      where: { id: req.params.id },
      include: {
        signatures: true,
        ratingChain: { include: { reviewer: true } },
      },
    });
    if (!evaluation) throw new HttpError(404, "Evaluation not found");

    // ── Gate: must be in COMPLETE status ──
    if (evaluation.status !== "COMPLETE") {
      throw new HttpError(
        409,
        `Evaluation must be in COMPLETE status to submit to HDQA (currently ${evaluation.status}).`,
      );
    }

    // ── Gate: no remaining BLOCKING_ERROR flags (MVP audit 5.14) ──
    // Re-runs the same deterministic checks the pre-submission consistency
    // check surfaces, so a bullet saved before enforcement existed (or any
    // other path that bypassed the section-PATCH check) can't slip through
    // to HDQA submission.
    const fullEval = await prisma.evaluation.findUnique({
      where: { id: req.params.id },
      include: { sections: true, supportForm: { include: { entries: true } } },
    });
    const sectionsForCheck: SectionForCheck[] = (fullEval?.sections ?? []).map((s) => ({
      section: s.section,
      ratingBinary: s.ratingBinary,
      ratingFourLevel: s.ratingFourLevel,
      finalBullets: s.finalBullets,
      bulletSources: (s.bulletSources as Record<string, never> | null) ?? undefined,
      bulletProvenance: (s.bulletProvenance as SectionForCheck["bulletProvenance"]) ?? undefined,
    }));
    const uncounseledEntryCount =
      fullEval?.supportForm?.entries.filter((e) => !e.counseled).length ?? 0;
    const flags = runConsistencyCheck({ sections: sectionsForCheck, uncounseledEntryCount });
    if (hasBlockingErrors(flags)) {
      throw new HttpError(
        409,
        "This evaluation has unresolved blocking issues (e.g. prohibited language) and cannot be submitted to HDQA.",
      );
    }

    // ── Validation: ensure all required signatures are present and SIGNED ──
    const requiredRoles = ["RATER", "SENIOR_RATER", "SOLDIER"];
    if (evaluation.requiresSupplementaryReview) {
      requiredRoles.push("REVIEWER");
    }

    for (const role of requiredRoles) {
      const sig = evaluation.signatures.find((s) => s.role === role);
      if (!sig) {
        throw new HttpError(
          409,
          `Missing required signature: ${role}`,
        );
      }
      if (sig.status !== "SIGNED") {
        throw new HttpError(
          409,
          `${role} signature is not signed (status: ${sig.status}).`,
        );
      }
    }

    // ── Update status to SUBMITTED and capture submission timestamp ──
    const updated = await prisma.evaluation.update({
      where: { id: req.params.id },
      data: {
        status: "SUBMITTED",
        submittedAt: new Date(),
      },
    });

    // ── Audit log ──
    await prisma.auditLog.create({
      data: {
        evaluationId: req.params.id!,
        actorId: req.user.id,
        action: "SUBMITTED_TO_HDQA",
        entityType: "Evaluation",
        entityId: req.params.id!,
      },
    });

    res.json(updated);
  }),
);
