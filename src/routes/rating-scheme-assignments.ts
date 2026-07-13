import { Router } from "express";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  categoryForRank,
  validateRatingOfficialEligibility,
  type RatingFormCategory,
} from "@/lib/rating-chain-validation";
import { isSupplementaryReviewRequired } from "@/lib/supplementary-reviewer-logic";
import { asyncHandler, HttpError } from "@/middleware/error";
import { requireAuth, requireRole } from "@/middleware/auth";

export const ratingSchemeAssignmentsRouter = Router();

const assignmentInputSchema = z.object({
  ratedSoldierId: z.string().min(1),
  raterId: z.string().min(1),
  intermediateRaterId: z.string().min(1).nullable().optional(),
  seniorRaterId: z.string().min(1),
  supplementaryReviewerId: z.string().min(1).nullable().optional(),
  unitId: z.string().min(1).nullable().optional(),
  effectiveFrom: z.coerce.date(),
  effectiveTo: z.coerce.date().nullable().optional(),
  formCategory: z.enum(["NCOER", "OER"]),
  changeReason: z.string().min(1).max(500).optional(),
  exceptionToPolicyId: z.string().min(1).nullable().optional(),
  sameGradeCommandException: z.boolean().optional(),
  hasUniformedArmyAdvisor: z.boolean().default(true),
  isReliefForCause: z.boolean().default(false),
});

const assignmentUpdateSchema = assignmentInputSchema.partial();

const assignmentInclude = {
  ratedSoldier: true,
  rater: true,
  intermediateRater: true,
  seniorRater: true,
  supplementaryReviewer: true,
  unit: true,
} as const;

function toOfficial(user: { rank: "PVT" | "PV2" | "PFC" | "SPC" | "CPL" | "SGT" | "SSG" | "SFC" | "MSG" | "FIRST_SERGEANT" | "SGM" | "CSM" | "SMA" | "WO1" | "CW2" | "CW3" | "CW4" | "CW5" | "SECOND_LT" | "FIRST_LT" | "CPT" | "MAJ" | "LTC" | "COL" | "BG" | "MG" | "LTG" | "GEN" | "GA"; category: "OFFICER" | "NCO" | "WARRANT" | "CIVILIAN" | null }) {
  return { rank: user.rank, category: user.category ?? categoryForRank(user.rank) };
}

async function resolveAndValidate(input: z.infer<typeof assignmentInputSchema>) {
  const ids = [
    input.ratedSoldierId,
    input.raterId,
    input.seniorRaterId,
    input.intermediateRaterId ?? undefined,
    input.supplementaryReviewerId ?? undefined,
  ].filter((id): id is string => Boolean(id));
  const users = await prisma.user.findMany({ where: { id: { in: ids } } });
  const usersById = new Map(users.map((user) => [user.id, user]));
  const requiredIds = [input.ratedSoldierId, input.raterId, input.seniorRaterId];
  if (requiredIds.some((id) => !usersById.has(id))) {
    throw new HttpError(404, "One or more rating officials were not found.", "RATING_OFFICIAL_NOT_FOUND");
  }

  const ratedSoldier = usersById.get(input.ratedSoldierId)!;
  const rater = usersById.get(input.raterId)!;
  const seniorRater = usersById.get(input.seniorRaterId)!;
  const intermediateRater = input.intermediateRaterId
    ? usersById.get(input.intermediateRaterId) ?? null
    : null;
  const eligibility = validateRatingOfficialEligibility({
    ratedPerson: toOfficial(ratedSoldier),
    rater: toOfficial(rater),
    seniorRater: toOfficial(seniorRater),
    intermediateRater: intermediateRater ? toOfficial(intermediateRater) : null,
    formType: input.formCategory as RatingFormCategory,
    sameGradeCommandException: input.sameGradeCommandException,
  });
  if (!eligibility.valid) {
    throw new HttpError(
      422,
      "The proposed rating officials are not eligible for this assignment.",
      "RATING_OFFICIAL_INELIGIBLE",
      eligibility.errors,
    );
  }

  const supplementaryReview = isSupplementaryReviewRequired(
    input.formCategory as RatingFormCategory,
    toOfficial(seniorRater),
    toOfficial(rater),
    input.hasUniformedArmyAdvisor,
    input.isReliefForCause,
  );
  if (supplementaryReview.required && !input.supplementaryReviewerId) {
    throw new HttpError(
      422,
      "A supplementary reviewer is required for this rating assignment.",
      "SUPPLEMENTARY_REVIEWER_REQUIRED",
      { reason: supplementaryReview.reason },
    );
  }

  return { supplementaryReview };
}

async function ensureNoPublishedOverlap(
  ratedSoldierId: string,
  effectiveFrom: Date,
  effectiveTo: Date | null | undefined,
  excludeAssignmentId?: string,
) {
  const overlapping = await prisma.ratingSchemeAssignment.findFirst({
    where: {
      ratedSoldierId,
      status: "PUBLISHED",
      ...(excludeAssignmentId ? { id: { not: excludeAssignmentId } } : {}),
      effectiveFrom: { lte: effectiveTo ?? new Date("9999-12-31") },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: effectiveFrom } }],
    },
    select: { id: true },
  });
  if (overlapping) {
    throw new HttpError(
      409,
      "A published rating assignment already overlaps this effective date range.",
      "OVERLAPPING_RATING_ASSIGNMENT",
      { overlappingAssignmentId: overlapping.id },
    );
  }
}

ratingSchemeAssignmentsRouter.get(
  "/",
  requireAuth,
  requireRole("ADMIN"),
  asyncHandler(async (_req, res) => {
    const assignments = await prisma.ratingSchemeAssignment.findMany({
      include: assignmentInclude,
      orderBy: [{ ratedSoldierId: "asc" }, { effectiveFrom: "desc" }],
    });
    res.json(assignments);
  }),
);

ratingSchemeAssignmentsRouter.post(
  "/",
  requireAuth,
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const body = assignmentInputSchema.parse(req.body);
    const { supplementaryReview } = await resolveAndValidate(body);
    const assignment = await prisma.ratingSchemeAssignment.create({
      data: {
        ratedSoldierId: body.ratedSoldierId,
        raterId: body.raterId,
        intermediateRaterId: body.intermediateRaterId ?? null,
        seniorRaterId: body.seniorRaterId,
        supplementaryReviewerId: body.supplementaryReviewerId ?? null,
        unitId: body.unitId ?? req.user!.unitId ?? null,
        formCategory: body.formCategory,
        effectiveFrom: body.effectiveFrom,
        effectiveTo: body.effectiveTo ?? null,
        requiresSupplementaryReview: supplementaryReview.required,
        changeReason: body.changeReason ?? null,
        exceptionToPolicyId: body.exceptionToPolicyId ?? null,
        createdByUserId: req.user!.id,
      },
      include: assignmentInclude,
    });
    res.status(201).json(assignment);
  }),
);

ratingSchemeAssignmentsRouter.patch(
  "/:id",
  requireAuth,
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const updates = assignmentUpdateSchema.parse(req.body);
    const existing = await prisma.ratingSchemeAssignment.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new HttpError(404, "Rating assignment not found.", "RATING_ASSIGNMENT_NOT_FOUND");
    if (existing.status !== "DRAFT") {
      throw new HttpError(409, "Published or approved assignments cannot be edited in place.", "ASSIGNMENT_PUBLISHED_IMMUTABLE");
    }
    const merged = assignmentInputSchema.parse({
      ...existing,
      ...updates,
      formCategory: updates.formCategory ?? existing.formCategory,
    });
    const { supplementaryReview } = await resolveAndValidate(merged);
    const assignment = await prisma.ratingSchemeAssignment.update({
      where: { id: existing.id },
      data: {
        ratedSoldierId: merged.ratedSoldierId,
        raterId: merged.raterId,
        intermediateRaterId: merged.intermediateRaterId ?? null,
        seniorRaterId: merged.seniorRaterId,
        supplementaryReviewerId: merged.supplementaryReviewerId ?? null,
        unitId: merged.unitId ?? null,
        formCategory: merged.formCategory,
        effectiveFrom: merged.effectiveFrom,
        effectiveTo: merged.effectiveTo ?? null,
        requiresSupplementaryReview: supplementaryReview.required,
        changeReason: merged.changeReason ?? null,
        exceptionToPolicyId: merged.exceptionToPolicyId ?? null,
      },
      include: assignmentInclude,
    });
    res.json(assignment);
  }),
);

ratingSchemeAssignmentsRouter.post(
  "/:id/approve",
  requireAuth,
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const assignment = await prisma.ratingSchemeAssignment.findUnique({ where: { id: req.params.id } });
    if (!assignment) throw new HttpError(404, "Rating assignment not found.", "RATING_ASSIGNMENT_NOT_FOUND");
    if (assignment.status !== "DRAFT") throw new HttpError(409, "Only draft assignments can be approved.", "ASSIGNMENT_NOT_DRAFT");
    res.json(await prisma.ratingSchemeAssignment.update({
      where: { id: assignment.id },
      data: { status: "APPROVED", approvedAt: new Date(), approvedByUserId: req.user!.id },
    }));
  }),
);

ratingSchemeAssignmentsRouter.post(
  "/:id/publish",
  requireAuth,
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const assignment = await prisma.ratingSchemeAssignment.findUnique({ where: { id: req.params.id } });
    if (!assignment) throw new HttpError(404, "Rating assignment not found.", "RATING_ASSIGNMENT_NOT_FOUND");
    if (assignment.status !== "APPROVED" || !assignment.approvedAt) {
      throw new HttpError(409, "An assignment must be approved before publication.", "ASSIGNMENT_NOT_APPROVED");
    }
    await ensureNoPublishedOverlap(assignment.ratedSoldierId, assignment.effectiveFrom, assignment.effectiveTo, assignment.id);
    const publishedAt = new Date();
    const published = await prisma.$transaction(async (transaction) => {
      if (assignment.supersedesAssignmentId) {
        await transaction.ratingSchemeAssignment.update({
          where: { id: assignment.supersedesAssignmentId },
          data: { status: "SUPERSEDED", effectiveTo: assignment.effectiveFrom },
        });
      }
      return transaction.ratingSchemeAssignment.update({
        where: { id: assignment.id },
        data: { status: "PUBLISHED", publishedAt, publishedByUserId: req.user!.id },
        include: assignmentInclude,
      });
    });
    res.json(published);
  }),
);

ratingSchemeAssignmentsRouter.post(
  "/:id/propose-replacement",
  requireAuth,
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const prior = await prisma.ratingSchemeAssignment.findUnique({ where: { id: req.params.id } });
    if (!prior) throw new HttpError(404, "Rating assignment not found.", "RATING_ASSIGNMENT_NOT_FOUND");
    if (prior.status !== "PUBLISHED") throw new HttpError(409, "Only published assignments can be superseded.", "ASSIGNMENT_NOT_PUBLISHED");
    const body = assignmentInputSchema.parse({ ...req.body, supersedesAssignmentId: prior.id });
    if (body.effectiveFrom <= prior.effectiveFrom) {
      throw new HttpError(422, "Replacement must take effect after the published assignment.", "RETROACTIVE_CHANGE_NOT_ALLOWED");
    }
    const { supplementaryReview } = await resolveAndValidate(body);
    const replacement = await prisma.ratingSchemeAssignment.create({
      data: {
        ratedSoldierId: body.ratedSoldierId,
        raterId: body.raterId,
        intermediateRaterId: body.intermediateRaterId ?? null,
        seniorRaterId: body.seniorRaterId,
        supplementaryReviewerId: body.supplementaryReviewerId ?? null,
        unitId: body.unitId ?? prior.unitId,
        formCategory: body.formCategory,
        effectiveFrom: body.effectiveFrom,
        effectiveTo: body.effectiveTo ?? null,
        requiresSupplementaryReview: supplementaryReview.required,
        changeReason: body.changeReason ?? null,
        exceptionToPolicyId: body.exceptionToPolicyId ?? null,
        supersedesAssignmentId: prior.id,
        createdByUserId: req.user!.id,
      },
      include: assignmentInclude,
    });
    res.status(201).json(replacement);
  }),
);
