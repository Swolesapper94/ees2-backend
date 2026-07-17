import { categoryForRank, validateRatingOfficialEligibility, type RatingFormCategory } from "@/lib/rating-chain-validation";
import { isSupplementaryReviewRequired } from "@/lib/supplementary-reviewer-logic";
import { prisma } from "@/lib/prisma";
import { ratingSchemePopulation } from "@/lib/rating-scheme-population";

export type SchemeAssignmentInput = {
  ratedSoldierId: string;
  raterId: string;
  intermediateRaterId?: string | null;
  seniorRaterId: string;
  supplementaryReviewerId?: string | null;
  effectiveFrom: Date;
  effectiveTo?: Date | null;
  formCategory: "NCOER" | "OER";
  hasUniformedArmyAdvisor?: boolean;
  isReliefForCause?: boolean;
  sameGradeCommandException?: boolean;
};

export type SchemeValidationIssue = { assignmentId?: string; severity: "ERROR" | "WARNING"; code: string; message: string };

export async function validateSchemeAssignments(assignments: (SchemeAssignmentInput & { id?: string })[]): Promise<SchemeValidationIssue[]> {
  const issues: SchemeValidationIssue[] = [];
  for (const assignment of assignments) {
    if (assignment.effectiveTo && assignment.effectiveTo < assignment.effectiveFrom) {
      issues.push({ assignmentId: assignment.id, severity: "ERROR", code: "INVALID_DATES", message: "Effective end date cannot precede the start date." });
    }
    const userIds = [assignment.ratedSoldierId, assignment.raterId, assignment.seniorRaterId, assignment.intermediateRaterId, assignment.supplementaryReviewerId].filter((value): value is string => Boolean(value));
    const users = await prisma.user.findMany({ where: { id: { in: userIds } } });
    const byId = new Map(users.map((user) => [user.id, user]));
    const ratedSoldier = byId.get(assignment.ratedSoldierId);
    const rater = byId.get(assignment.raterId);
    const seniorRater = byId.get(assignment.seniorRaterId);
    if (!ratedSoldier || !rater || !seniorRater) {
      issues.push({ assignmentId: assignment.id, severity: "ERROR", code: "MISSING_OFFICIAL", message: "The rated Soldier, rater, and senior rater must be authoritative identity records." });
      continue;
    }
    const official = (user: typeof ratedSoldier) => ({ rank: user.rank, category: user.category ?? categoryForRank(user.rank) });
    const eligibility = validateRatingOfficialEligibility({
      ratedPerson: official(ratedSoldier), rater: official(rater), seniorRater: official(seniorRater),
      intermediateRater: assignment.intermediateRaterId ? (byId.get(assignment.intermediateRaterId) ? official(byId.get(assignment.intermediateRaterId)!) : null) : null,
      formType: assignment.formCategory as RatingFormCategory,
      sameGradeCommandException: assignment.sameGradeCommandException,
    });
    for (const error of eligibility.errors) issues.push({ assignmentId: assignment.id, severity: "ERROR", code: "RATING_OFFICIAL_INELIGIBLE", message: error.message });
    const review = isSupplementaryReviewRequired(assignment.formCategory as RatingFormCategory, official(seniorRater), official(rater), assignment.hasUniformedArmyAdvisor ?? true, assignment.isReliefForCause ?? false);
    if (review.required && !assignment.supplementaryReviewerId) issues.push({ assignmentId: assignment.id, severity: "ERROR", code: "SUPPLEMENTARY_REVIEWER_REQUIRED", message: review.reason });
    if (!review.required && assignment.supplementaryReviewerId) issues.push({ assignmentId: assignment.id, severity: "WARNING", code: "SUPPLEMENTARY_REVIEWER_NOT_REQUIRED", message: "A supplementary reviewer is present when no requirement was identified." });
  }
  const seen = new Set<string>();
  for (const assignment of assignments) {
    const key = `${assignment.ratedSoldierId}:${assignment.effectiveFrom.toISOString()}:${assignment.effectiveTo?.toISOString() ?? "open"}`;
    if (seen.has(key)) issues.push({ assignmentId: assignment.id, severity: "ERROR", code: "DUPLICATE_ASSIGNMENT", message: "The draft contains a duplicate active assignment." });
    seen.add(key);
  }
  return issues;
}

export async function validateRatingSchemeCoverage(unitId: string, assignments: (SchemeAssignmentInput & { id?: string })[]): Promise<SchemeValidationIssue[]> {
  const coverage = await ratingSchemePopulation(unitId, assignments.map((assignment) => assignment.ratedSoldierId));
  return coverage.unassignedPersonnel.map((person) => ({
    severity: "ERROR" as const,
    code: "MISSING_RATING_ASSIGNMENT",
    message: `${person.rank} ${person.lastName}, ${person.firstName} is eligible for rating but has no assignment in this scheme.`,
  }));
}