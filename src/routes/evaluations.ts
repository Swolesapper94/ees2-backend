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
import { authorizeEvaluationView, canEditEvaluationSection, canSignEvaluationAs, canViewEvaluation } from "@/lib/authorization-policies";
import { authorizeDelegatedAction } from "@/lib/access-assistance/authorization";
import { srMqCapPercentFor, isNcoGrade } from "@/lib/utils/grade";
import { computeFinalFormContentHash, finalReviewRatedSoldierId, invalidateFinalFormReviews, loadFinalFormReviewData } from "@/lib/final-form-review";

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
  ratingSchemeAssignmentId: z.string().min(1).optional(),
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

const administrativeFieldsSchema = z.object({
  nonRatedMonths: z.number().int().min(0).max(99).optional(),
  nonRatedCodes: z.string().trim().max(100).nullable().optional(),
  statusCode: z.string().trim().max(40).nullable().optional(),
  numberOfEnclosures: z.number().int().min(0).max(99).optional(),
}).refine((fields) => Object.keys(fields).length > 0, "Provide at least one administrative field.");

const administrativeReturnResponseSchema = z.object({
  note: z.string().trim().min(1).max(2000),
});

const signSchema = z.object({
  role: z.enum(["RATER", "SENIOR_RATER", "REVIEWER", "SOLDIER"]),
  action: z.enum(["SIGN", "DECLINE"]),
  declineReason: z.string().optional(),
});

const finalReviewConfirmSchema = z.object({ contentHash: z.string().length(64) });
const finalReviewDisputeSchema = z.object({
  disputeCategory: z.enum(["RATER_CONTENT", "SENIOR_RATER_CONTENT"]),
  disputeReason: z.string().trim().min(1).max(2000),
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

    let whereClause: NonNullable<Parameters<typeof prisma.evaluation.findMany>[0]>["where"] = {};

    if (role === "rater" && userId) {
      whereClause = { ratingChain: { raterId: userId } };
    } else if (role === "soldier" && userId) {
      whereClause = { ratingChain: { ratedSoldierId: userId } };
    } else if (userId && !req.user?.roles.includes("ADMIN")) {
      whereClause = { ratingChain: { OR: [{ ratedSoldierId: userId }, { raterId: userId }, { seniorRaterId: userId }, { reviewerId: userId }] } };
    }
    whereClause = { AND: [whereClause, { disposition: "ACTIVE" }] };

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

    // The legacy chain remains required during transition, but a new evaluation
    // may be governed by a published, effective-dated assignment and snapshot.
    const chain = await prisma.ratingChain.findUnique({
      where: { id: body.ratingChainId },
      include: { ratedSoldier: true, rater: true, seniorRater: true, reviewer: true },
    });
    if (!chain) throw new HttpError(404, "Rating chain not found");
    if (!chain.isActive) throw new HttpError(409, "The selected rating chain is no longer active.", "RATING_CHAIN_NOT_ACTIVE");
    if (!req.user) throw new HttpError(401, "Not authenticated");
    const canInitiate = req.user.roles.includes("ADMIN") || [chain.ratedSoldierId, chain.raterId, chain.seniorRaterId].includes(req.user.id);
    if (!canInitiate) throw new HttpError(403, "You are not authorized to initiate an evaluation for this rating chain.");

    const now = new Date();
    const assignment = body.ratingSchemeAssignmentId
      ? await prisma.ratingSchemeAssignment.findUnique({
          where: { id: body.ratingSchemeAssignmentId },
          include: { ratedSoldier: true, rater: true, seniorRater: true, supplementaryReviewer: true },
        })
      : await prisma.ratingSchemeAssignment.findFirst({
          where: {
            ratedSoldierId: chain.ratedSoldierId,
            raterId: chain.raterId,
            seniorRaterId: chain.seniorRaterId,
            supplementaryReviewerId: chain.reviewerId,
            status: "PUBLISHED",
            effectiveFrom: { lte: now },
            OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
          },
          orderBy: { effectiveFrom: "desc" },
          include: { ratedSoldier: true, rater: true, seniorRater: true, supplementaryReviewer: true },
        });
    if (body.ratingSchemeAssignmentId && !assignment) {
      throw new HttpError(404, "Rating scheme assignment not found", "RATING_ASSIGNMENT_NOT_FOUND");
    }
    if (assignment) {
      const assignmentMatchesChain = assignment.ratedSoldierId === chain.ratedSoldierId
        && assignment.raterId === chain.raterId
        && assignment.seniorRaterId === chain.seniorRaterId
        && (assignment.supplementaryReviewerId ?? null) === (chain.reviewerId ?? null);
      if (assignment.status !== "PUBLISHED" || assignment.effectiveFrom > now || (assignment.effectiveTo && assignment.effectiveTo < now)) {
        throw new HttpError(409, "The rating assignment is not currently effective.", "RATING_ASSIGNMENT_NOT_EFFECTIVE");
      }
      if (!assignmentMatchesChain) {
        throw new HttpError(422, "The legacy rating chain does not match the published assignment.", "RATING_ASSIGNMENT_CHAIN_MISMATCH");
      }
    }
    const requiresSupplementaryReview = assignment?.requiresSupplementaryReview ?? false;

    // ── Support-form gate (2026-07 review) ──────────────────────────
    // Authoritative — the frontend CTA is just courtesy. A Soldier cannot
    // initiate their NCOER/OER until their support form clears the HARD
    // completeness gate (Part I–III + ≥1 goal total; the all-6-dimensions
    // check is a soft indicator elsewhere and never blocks this).
    let supportFormId = body.supportFormId;
    if (!supportFormId) {
      const activeForm = await prisma.supportForm.findFirst({
        where: {
          ...(assignment ? { ratingSchemeAssignmentId: assignment.id } : { ratingChainId: body.ratingChainId }),
          isActive: true,
          disposition: "ACTIVE",
          status: { notIn: ["CONSUMED", "ARCHIVED", "QUARANTINED"] },
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

    const supportForm = await prisma.supportForm.findUnique({ where: { id: supportFormId } });
    if (!supportForm || supportForm.disposition !== "ACTIVE" || supportForm.status === "CONSUMED") {
      throw new HttpError(409, "This support form is no longer available for evaluation creation.", "SUPPORT_FORM_UNAVAILABLE");
    }
    if (assignment && supportForm.ratingSchemeAssignmentId !== assignment.id) {
      throw new HttpError(422, "The support form does not belong to this rating assignment.", "SUPPORT_FORM_ASSIGNMENT_MISMATCH");
    }

    const created = await prisma.$transaction(async (tx) => {
      const evaluation = await tx.evaluation.create({
        data: {
          ratingChainId: body.ratingChainId,
          supportFormId,
          formType: body.formType,
          periodStart: body.periodStart,
          periodEnd: body.periodEnd,
          ratedMonths: body.ratedMonths,
          reasonForSubmission: body.reasonForSubmission,
          requiresSupplementaryReview,
          principalDutyTitle: supportForm.dutyTitle,
          dutyMosc: supportForm.dutyMosc,
          dailyDutiesScope: supportForm.dailyDutiesScope,
          areasOfSpecialEmphasis: supportForm.areasOfEmphasis,
          appointedDuties: supportForm.appointedDuties,
          sections: {
            create: PART_IV_SECTIONS.map((section) => ({ section })),
          },
        },
        include: { sections: true },
      });
      if (assignment) {
        await tx.evaluationRatingSnapshot.create({
          data: {
            evaluationId: evaluation.id,
            ratingSchemeAssignmentId: assignment.id,
            ratedSoldierId: assignment.ratedSoldierId,
            raterId: assignment.raterId,
            seniorRaterId: assignment.seniorRaterId,
            supplementaryReviewerId: assignment.supplementaryReviewerId,
            ratedRank: assignment.ratedSoldier.rank,
            ratedCategory: assignment.ratedSoldier.category ?? "NCO",
            raterRank: assignment.rater.rank,
            raterCategory: assignment.rater.category ?? "NCO",
            seniorRaterRank: assignment.seniorRater.rank,
            seniorRaterCategory: assignment.seniorRater.category ?? "NCO",
            formCategory: assignment.formCategory,
            ratedGrade: assignment.ratedSoldier.rank,
            exceptionToPolicyId: assignment.exceptionToPolicyId,
          },
        });
      }
      const consumed = await tx.supportForm.updateMany({
        where: { id: supportFormId, disposition: "ACTIVE", status: { not: "CONSUMED" } },
        data: { status: "CONSUMED", isActive: false, consumedByEvaluationId: evaluation.id, consumedAt: new Date() },
      });
      if (consumed.count !== 1) {
        throw new HttpError(409, "This support form was consumed by another evaluation.", "SUPPORT_FORM_UNAVAILABLE");
      }
      return evaluation;
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
        ratingSnapshot: true,
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
    const access = req.user ? await authorizeEvaluationView(req.user, evaluation, evaluation.ratingChain) : { allowed: false };
    if (!access.allowed) {
      throw new HttpError(404, "Evaluation not found");
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

// DELETE /api/evaluations/:id
// Draft work may be discarded before formal routing. The consumed support form
// is restored for a new attempt; signed or routed records are never deletable.
evaluationsRouter.delete(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.user) throw new HttpError(401, "Not authenticated");
    const evaluation = await prisma.evaluation.findUnique({
      where: { id: req.params.id },
      include: { ratingChain: true, supportForm: true },
    });
    if (!evaluation) throw new HttpError(404, "Evaluation not found");
    if (evaluation.disposition !== "ACTIVE") {
      throw new HttpError(409, "Quarantined or archived evaluations cannot be deleted through the draft workflow.", "EVALUATION_NOT_ACTIVE");
    }
    if (!["DRAFT", "RATER_IN_PROGRESS"].includes(evaluation.status)) {
      throw new HttpError(
        409,
        "Only draft or rater-in-progress evaluations may be deleted.",
        "EVALUATION_NOT_DELETABLE",
      );
    }
    const canDelete = req.user.roles.includes("ADMIN") ||
      req.user.id === evaluation.ratingChain.ratedSoldierId ||
      req.user.id === evaluation.ratingChain.raterId;
    if (!canDelete) throw new HttpError(403, "You are not authorized to delete this evaluation.");

    await prisma.$transaction(async (transaction) => {
      await transaction.auditLog.updateMany({
        where: { evaluationId: evaluation.id },
        data: { evaluationId: null },
      });
      await transaction.auditLog.create({
        data: {
          actorId: req.user!.id,
          action: "EVALUATION_DRAFT_DELETED",
          entityType: "Evaluation",
          entityId: evaluation.id,
          metadata: { status: evaluation.status, restoredSupportFormId: evaluation.supportFormId },
        },
      });
      await transaction.aIBulletSuggestion.deleteMany({ where: { evaluationId: evaluation.id } });
      await transaction.aIExtractedEntry.deleteMany({ where: { evaluationId: evaluation.id } });
      await transaction.supportFormUpload.deleteMany({ where: { evaluationId: evaluation.id } });
      await transaction.evaluationReturn.deleteMany({ where: { evaluationId: evaluation.id } });
      await transaction.signature.deleteMany({ where: { evaluationId: evaluation.id } });
      await transaction.notification.deleteMany({ where: { evaluationId: evaluation.id } });
      await transaction.evalMilestone.deleteMany({ where: { evaluationId: evaluation.id } });
      await transaction.evalComment.deleteMany({ where: { evaluationId: evaluation.id } });
      await transaction.evalSection.deleteMany({ where: { evaluationId: evaluation.id } });
      await transaction.evaluation.delete({ where: { id: evaluation.id } });

      if (evaluation.supportFormId && evaluation.supportForm?.consumedByEvaluationId === evaluation.id) {
        await transaction.supportForm.update({
          where: { id: evaluation.supportFormId },
          data: {
            isActive: true,
            status: evaluation.supportForm.completedAt ? "FINALIZED" : "ACTIVE",
            consumedByEvaluationId: null,
            consumedAt: null,
          },
        });
      }
    });

    res.status(204).send();
  }),
);

// PATCH /api/evaluations/:id/administrative-fields
// This surface deliberately excludes dates, form type, narrative, ratings,
// signatures, and rating-chain data. It is the only delegated write path for
// servicing administrators.
evaluationsRouter.patch(
  "/:id/administrative-fields",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.user) throw new HttpError(401, "Not authenticated");
    const body = administrativeFieldsSchema.parse(req.body);
    const evaluation = await prisma.evaluation.findUnique({ where: { id: req.params.id }, include: { ratingChain: true } });
    if (!evaluation || evaluation.disposition !== "ACTIVE") throw new HttpError(404, "Evaluation not found.");
    if (["SUBMITTED", "ACCEPTED"].includes(evaluation.status)) throw new HttpError(409, "Finalized evaluations cannot be changed.");
    const directAccess = req.user.roles.includes("ADMIN") || req.user.id === evaluation.ratingChain.raterId;
    const delegatedAccess = directAccess
      ? undefined
      : await authorizeDelegatedAction({
          actorUserId: req.user.id,
          subjectUserId: evaluation.ratingChain.ratedSoldierId,
          capability: "COMPLETE_ADMINISTRATIVE_FIELD",
          evaluationId: evaluation.id,
        });
    if (!directAccess && !delegatedAccess?.allowed) throw new HttpError(403, "You are not authorized to complete administrative fields.");

    const updated = await prisma.evaluation.update({ where: { id: evaluation.id }, data: body });
    await prisma.auditLog.create({
      data: {
        evaluationId: evaluation.id,
        actorId: req.user.id,
        action: "EVALUATION_ADMINISTRATIVE_FIELDS_COMPLETED",
        entityType: "Evaluation",
        entityId: evaluation.id,
        metadata: { fields: Object.keys(body), authorizationSource: delegatedAccess?.grant ? "DELEGATION" : "DIRECT" },
        ...(delegatedAccess?.grant
          ? { subjectUserId: evaluation.ratingChain.ratedSoldierId, delegationGrantId: delegatedAccess.grant.id, delegationCapability: "COMPLETE_ADMINISTRATIVE_FIELD" }
          : {}),
      },
    });
    res.json(updated);
  }),
);

// POST /api/evaluations/:id/administrative-return-response
// Records a clerical response without changing ratings, signatures, or status.
evaluationsRouter.post(
  "/:id/administrative-return-response",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.user) throw new HttpError(401, "Not authenticated");
    const body = administrativeReturnResponseSchema.parse(req.body);
    const evaluation = await prisma.evaluation.findUnique({ where: { id: req.params.id }, include: { ratingChain: true } });
    if (!evaluation || evaluation.disposition !== "ACTIVE") throw new HttpError(404, "Evaluation not found.");
    const directAccess = req.user.roles.includes("ADMIN") || [evaluation.ratingChain.raterId, evaluation.ratingChain.seniorRaterId].includes(req.user.id);
    const delegatedAccess = directAccess
      ? undefined
      : await authorizeDelegatedAction({
          actorUserId: req.user.id,
          subjectUserId: evaluation.ratingChain.ratedSoldierId,
          capability: "RESPOND_TO_ADMIN_RETURN",
          evaluationId: evaluation.id,
        });
    if (!directAccess && !delegatedAccess?.allowed) throw new HttpError(403, "You are not authorized to record this administrative response.");

    await prisma.auditLog.create({
      data: {
        evaluationId: evaluation.id,
        actorId: req.user.id,
        action: "EVALUATION_ADMIN_RETURN_RESPONSE_RECORDED",
        entityType: "Evaluation",
        entityId: evaluation.id,
        metadata: { note: body.note, authorizationSource: delegatedAccess?.grant ? "DELEGATION" : "DIRECT" },
        ...(delegatedAccess?.grant
          ? { subjectUserId: evaluation.ratingChain.ratedSoldierId, delegationGrantId: delegatedAccess.grant.id, delegationCapability: "RESPOND_TO_ADMIN_RETURN" }
          : {}),
      },
    });
    res.status(201).json({ recorded: true });
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
    const evaluation = await requireEvalChainRole(req.params.id!, req.user, ["RATER", "SENIOR_RATER"]);
    const body = updateEvalSchema.parse(req.body);
    if ((body.principalDutyTitle !== undefined || body.dutyDescription !== undefined) && evaluation.ratingChain.raterId !== req.user.id && !req.user.roles.includes("ADMIN")) {
      throw new HttpError(403, "Only the assigned rater may edit duty description fields.");
    }
    if (body.seniorRaterRating !== undefined && evaluation.ratingChain.seniorRaterId !== req.user.id && !req.user.roles.includes("ADMIN")) {
      throw new HttpError(403, "Only the assigned senior rater may edit senior-rater assessments.");
    }
    const updated = await prisma.evaluation.update({
      where: { id: req.params.id },
      data: {
        ...(body.principalDutyTitle !== undefined
          ? { principalDutyTitle: body.principalDutyTitle }
          : {}),
        ...(body.dutyDescription !== undefined
          ? { dailyDutiesScope: body.dutyDescription }
          : {}),
        ...(body.seniorRaterRating !== undefined
          ? { seniorRaterRating: body.seniorRaterRating as never }
          : {}),
      },
    });
    if (body.principalDutyTitle !== undefined || body.dutyDescription !== undefined || body.seniorRaterRating !== undefined) {
      await invalidateFinalFormReviews(evaluation.id, req.user.id);
    }
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
    const evaluation = await requireEvalChainRole(req.params.id!, req.user, ["RATER", "SENIOR_RATER"]);
    if (!canEditEvaluationSection(req.user, req.params.section!, evaluation.ratingChain)) {
      throw new HttpError(403, "You are not authorized to edit this evaluation section.");
    }
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
    if (req.user && (body.finalBullets !== undefined || body.ratingBinary !== undefined || body.ratingFourLevel !== undefined)) {
      await invalidateFinalFormReviews(req.params.id!, req.user.id);
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
    const evaluation = await requireEvalChainRole(req.params.id!, req.user, [body.role]);
    if (!canSignEvaluationAs(req.user, body.role, evaluation.ratingChain)) {
      throw new HttpError(403, "You may only sign using your assigned rating role.");
    }

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

    if (body.action === "SIGN") {
      if (body.role === "RATER") {
        const completedSections = await prisma.evalSection.count({
          where: { evaluationId: req.params.id!, section: { in: [...PART_IV_SECTIONS] }, isComplete: true },
        });
        if (completedSections !== PART_IV_SECTIONS.length) {
          throw new HttpError(
            409,
            "All six Part IV sections must be complete before the rater signs.",
            "RATER_SECTIONS_INCOMPLETE",
          );
        }
      }
      if (body.role === "SENIOR_RATER" && !evaluation.seniorRaterRating) {
        throw new HttpError(
          409,
          "A senior-rater overall assessment is required before signing.",
          "SENIOR_RATER_ASSESSMENT_REQUIRED",
        );
      }
      const prerequisiteRoles: Partial<Record<z.infer<typeof signSchema>["role"], z.infer<typeof signSchema>["role"]>> = {
        SENIOR_RATER: "RATER",
        SOLDIER: "SENIOR_RATER",
        REVIEWER: "SOLDIER",
      };
      const prerequisiteRole = prerequisiteRoles[body.role];
      if (prerequisiteRole && !existingSigs.some((signature) => signature.role === prerequisiteRole && signature.status === "SIGNED")) {
        throw new HttpError(
          409,
          `${prerequisiteRole.replace("_", " ")} must sign before ${body.role.replace("_", " ")} can sign.`,
          "SIGNATURE_OUT_OF_SEQUENCE",
        );
      }
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

async function requireFinalReviewActor(evaluationId: string, actorId: string) {
  const evaluation = await loadFinalFormReviewData(evaluationId);
  if (!evaluation) throw new HttpError(404, "Evaluation not found");
  if (evaluation.status !== "PENDING_FINAL_FORM_REVIEW") {
    throw new HttpError(409, "Final form review is not ready until all required signatures are complete.", "FINAL_FORM_REVIEW_NOT_READY");
  }
  if (finalReviewRatedSoldierId(evaluation) !== actorId) {
    throw new HttpError(403, "Only the rated Soldier may review the populated final form.", "FINAL_FORM_REVIEW_WRONG_ROLE");
  }
  return evaluation;
}

// GET /api/evaluations/:id/final-form-review — returns the canonical PDF path
// and content binding for the rated Soldier's final review gate.
evaluationsRouter.get(
  "/:id/final-form-review",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.user) throw new HttpError(401, "Not authenticated");
    const evaluation = await requireFinalReviewActor(req.params.id!, req.user.id);
    const contentHash = await computeFinalFormContentHash(evaluation.id);
    res.json({
      pdfPath: `/pdf/evaluations/${evaluation.id}`,
      contentHash,
      evalCategory: evaluation.ratingSnapshot?.formCategory ?? (evaluation.formType.startsWith("OER") ? "OER" : "NCOER"),
    });
  }),
);

evaluationsRouter.post(
  "/:id/final-form-review/confirm",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.user) throw new HttpError(401, "Not authenticated");
    const evaluation = await requireFinalReviewActor(req.params.id!, req.user.id);
    const body = finalReviewConfirmSchema.parse(req.body);
    const contentHash = await computeFinalFormContentHash(evaluation.id);
    if (body.contentHash !== contentHash) {
      throw new HttpError(409, "The form changed after it was opened. Review the current PDF before confirming.", "FINAL_FORM_CONTENT_STALE");
    }
    const reviewedAt = new Date();
    await prisma.$transaction([
      prisma.finalFormReview.updateMany({ where: { evaluationId: evaluation.id, outcome: "CONFIRMED", supersededAt: null }, data: { supersededAt: reviewedAt } }),
      prisma.finalFormReview.create({ data: { evaluationId: evaluation.id, reviewedBy: req.user.id, outcome: "CONFIRMED", contentHash, reviewedAt } }),
      prisma.evaluation.update({ where: { id: evaluation.id }, data: { status: "COMPLETE" } }),
      prisma.auditLog.create({ data: { evaluationId: evaluation.id, actorId: req.user.id, action: "FINAL_FORM_REVIEW_CONFIRMED", entityType: "FinalFormReview", entityId: evaluation.id, metadata: { contentHash } } }),
    ]);
    res.json({ id: evaluation.id, status: "COMPLETE", contentHash });
  }),
);

evaluationsRouter.post(
  "/:id/final-form-review/dispute",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.user) throw new HttpError(401, "Not authenticated");
    const evaluation = await requireFinalReviewActor(req.params.id!, req.user.id);
    const body = finalReviewDisputeSchema.parse(req.body);
    const contentHash = await computeFinalFormContentHash(evaluation.id);
    const resetRoles = body.disputeCategory === "RATER_CONTENT"
      ? ["RATER", "SENIOR_RATER", "SOLDIER", "REVIEWER"]
      : ["SENIOR_RATER", "SOLDIER", "REVIEWER"];
    const nextStatus = body.disputeCategory === "RATER_CONTENT" ? "RATER_IN_PROGRESS" : "PENDING_SENIOR_RATER";
    const now = new Date();
    await prisma.$transaction([
      prisma.finalFormReview.create({ data: { evaluationId: evaluation.id, reviewedBy: req.user.id, outcome: "DISPUTED", contentHash, disputeCategory: body.disputeCategory, disputeReason: body.disputeReason } }),
      prisma.signature.updateMany({ where: { evaluationId: evaluation.id, role: { in: resetRoles as never[] } }, data: { status: "PENDING", signedAt: null, isStale: true, staledAt: now, staledByUserId: req.user.id, staledReason: "FIELD_EDIT" } }),
      prisma.evaluation.update({ where: { id: evaluation.id }, data: { status: nextStatus as never } }),
      prisma.auditLog.create({ data: { evaluationId: evaluation.id, actorId: req.user.id, action: "FINAL_FORM_REVIEW_DISPUTED", entityType: "FinalFormReview", entityId: evaluation.id, metadata: { disputeCategory: body.disputeCategory, disputeReason: body.disputeReason, resetRoles } } }),
    ]);
    res.json({ id: evaluation.id, status: nextStatus, disputeCategory: body.disputeCategory });
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
    await requireEvalChainRole(req.params.id!, req.user, ["RATER", "SOLDIER"]);

    const evaluation = await prisma.evaluation.findUnique({
      where: { id: req.params.id },
      include: {
        signatures: true,
        ratingChain: { include: { reviewer: true } },
      },
    });
    if (!evaluation) throw new HttpError(404, "Evaluation not found");

    if (evaluation.status === "PENDING_FINAL_FORM_REVIEW") {
      throw new HttpError(409, "The rated Soldier must confirm the populated final form before submission.", "SUBMIT_BLOCKED_PENDING_FINAL_REVIEW");
    }

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
