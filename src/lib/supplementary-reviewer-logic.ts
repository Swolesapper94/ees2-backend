import { Rank, SoldierCategory } from "@prisma/client";
import type { RatingFormCategory } from "@/lib/rating-chain-validation";

export type SupplementaryReviewReason =
  | "NONE"
  | "SR_GRADE_SFC_MSG"
  | "SR_GRADE_WO1_CW2"
  | "SR_GRADE_2LT_1LT"
  | "NO_UNIFORMED_ARMY_OFFICIAL"
  | "NON_UNIFORMED_SR_AND_JUNIOR_RATER"
  | "RELIEF_FOR_CAUSE";

export interface SupplementaryReviewTrigger {
  required: boolean;
  reason: SupplementaryReviewReason;
}

interface OfficialForReview {
  category: SoldierCategory;
  rank: Rank;
}

const juniorNcoOrOfficerRanks = new Set<Rank>([
  "SFC",
  "MSG",
  "FIRST_SERGEANT",
  "WO1",
  "CW2",
  "SECOND_LT",
  "FIRST_LT",
]);

const qualifyingSeniorRaterRanks = new Set<Rank>([
  "SFC",
  "MSG",
  "FIRST_SERGEANT",
  "WO1",
  "CW2",
  "SECOND_LT",
  "FIRST_LT",
]);

export function isSupplementaryReviewRequired(
  formType: RatingFormCategory,
  seniorRater: OfficialForReview,
  rater: OfficialForReview,
  hasUniformedArmyAdvisor: boolean,
  isReliefForCause = false,
): SupplementaryReviewTrigger {
  if (isReliefForCause) return { required: true, reason: "RELIEF_FOR_CAUSE" };

  const allDesignatedOfficialsAreCivilian =
    seniorRater.category === "CIVILIAN" && rater.category === "CIVILIAN";
  if (allDesignatedOfficialsAreCivilian && !hasUniformedArmyAdvisor) {
    return { required: true, reason: "NO_UNIFORMED_ARMY_OFFICIAL" };
  }

  if (formType === "OER") return { required: false, reason: "NONE" };

  if (qualifyingSeniorRaterRanks.has(seniorRater.rank)) {
    if (["SFC", "MSG", "FIRST_SERGEANT"].includes(seniorRater.rank)) {
      return { required: true, reason: "SR_GRADE_SFC_MSG" };
    }
    if (["WO1", "CW2"].includes(seniorRater.rank)) {
      return { required: true, reason: "SR_GRADE_WO1_CW2" };
    }
    return { required: true, reason: "SR_GRADE_2LT_1LT" };
  }

  if (seniorRater.category === "CIVILIAN" && juniorNcoOrOfficerRanks.has(rater.rank)) {
    return { required: true, reason: "NON_UNIFORMED_SR_AND_JUNIOR_RATER" };
  }

  return { required: false, reason: "NONE" };
}