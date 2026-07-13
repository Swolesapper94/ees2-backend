import { Rank, SoldierCategory } from "@prisma/client";

export type RatingFormCategory = "NCOER" | "OER";

export interface RatingOfficial {
  rank: Rank;
  category: SoldierCategory;
}

export interface RatingOfficialEligibilityInput {
  ratedPerson: RatingOfficial;
  rater: RatingOfficial;
  seniorRater: RatingOfficial;
  intermediateRater?: RatingOfficial | null;
  formType: RatingFormCategory;
  sameGradeCommandException?: boolean;
}

export interface ValidationError {
  code:
    | "RATER_NOT_ELIGIBLE_FOR_FORM"
    | "RATER_NOT_SENIOR"
    | "SENIOR_RATER_NOT_ELIGIBLE_FOR_FORM"
    | "SENIOR_RATER_BELOW_MINIMUM_GRADE"
    | "SENIOR_RATER_NOT_ABOVE_RATER"
    | "INTERMEDIATE_RATER_NOT_ALLOWED";
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

const enlistedRankValues: Partial<Record<Rank, number>> = {
  PVT: 1,
  PV2: 2,
  PFC: 3,
  SPC: 4,
  CPL: 4,
  SGT: 5,
  SSG: 6,
  SFC: 7,
  MSG: 8,
  FIRST_SERGEANT: 8,
  SGM: 9,
  CSM: 9,
  SMA: 10,
};

const warrantRankValues: Partial<Record<Rank, number>> = {
  WO1: 1,
  CW2: 2,
  CW3: 3,
  CW4: 4,
  CW5: 5,
};

const officerRankValues: Partial<Record<Rank, number>> = {
  SECOND_LT: 1,
  FIRST_LT: 2,
  CPT: 3,
  MAJ: 4,
  LTC: 5,
  COL: 6,
  BG: 7,
  MG: 8,
  LTG: 9,
  GEN: 10,
  GA: 11,
};

const minimumSeniorRaterByRatedRank: Partial<Record<Rank, RatingOfficial>> = {
  SGT: { rank: "SFC", category: "NCO" },
  SSG: { rank: "MSG", category: "NCO" },
  SFC: { rank: "SGM", category: "NCO" },
  MSG: { rank: "SGM", category: "NCO" },
  FIRST_SERGEANT: { rank: "SGM", category: "NCO" },
  SECOND_LT: { rank: "MAJ", category: "OFFICER" },
  FIRST_LT: { rank: "MAJ", category: "OFFICER" },
  CPT: { rank: "LTC", category: "OFFICER" },
  MAJ: { rank: "COL", category: "OFFICER" },
  LTC: { rank: "COL", category: "OFFICER" },
  COL: { rank: "BG", category: "OFFICER" },
  WO1: { rank: "MAJ", category: "OFFICER" },
  CW2: { rank: "MAJ", category: "OFFICER" },
  CW3: { rank: "LTC", category: "OFFICER" },
  CW4: { rank: "LTC", category: "OFFICER" },
  CW5: { rank: "LTC", category: "OFFICER" },
};

export function categoryForRank(rank: Rank): SoldierCategory {
  if (rank in officerRankValues) return "OFFICER";
  if (rank in warrantRankValues) return "WARRANT";
  return "NCO";
}

function comparableRankValue(official: RatingOfficial): number | null {
  if (official.category === "CIVILIAN") return null;
  if (official.category === "OFFICER") return 300 + (officerRankValues[official.rank] ?? 0);
  if (official.category === "WARRANT") return 200 + (warrantRankValues[official.rank] ?? 0);
  return 100 + (enlistedRankValues[official.rank] ?? 0);
}

function isAtLeast(official: RatingOfficial, minimum: RatingOfficial): boolean {
  if (official.category === "CIVILIAN") return true;
  return (comparableRankValue(official) ?? 0) >= (comparableRankValue(minimum) ?? Infinity);
}

function isSeniorTo(
  official: RatingOfficial,
  ratedPerson: RatingOfficial,
  sameGradeCommandException: boolean,
): boolean {
  if (official.category === "CIVILIAN") return true;
  const officialValue = comparableRankValue(official);
  const ratedValue = comparableRankValue(ratedPerson);
  if (officialValue === null || ratedValue === null) return true;
  return officialValue > ratedValue || (sameGradeCommandException && officialValue === ratedValue);
}

export function validateRatingOfficialEligibility(
  input: RatingOfficialEligibilityInput,
): ValidationResult {
  const errors: ValidationError[] = [];
  const sameGradeCommandException = input.sameGradeCommandException ?? false;

  if (
    input.formType === "OER" &&
    (input.rater.category === "NCO" || input.rater.category === "WARRANT")
  ) {
    errors.push({
      code: "RATER_NOT_ELIGIBLE_FOR_FORM",
      message: `${input.rater.category === "NCO" ? "NCO" : "Warrant officer"} cannot be rater on an OER.`,
    });
  }

  if (!isSeniorTo(input.rater, input.ratedPerson, sameGradeCommandException)) {
    errors.push({
      code: "RATER_NOT_SENIOR",
      message: `Rater (${input.rater.rank}) must be senior to rated person (${input.ratedPerson.rank}) by grade or date of rank.`,
    });
  }

  if (
    input.formType === "OER" &&
    (input.seniorRater.category === "NCO" || input.seniorRater.category === "WARRANT")
  ) {
    errors.push({
      code: "SENIOR_RATER_NOT_ELIGIBLE_FOR_FORM",
      message: "NCOs and warrant officers cannot be senior raters on an OER; the senior rater must be an officer or DoD civilian.",
    });
  }

  const minimum = minimumSeniorRaterByRatedRank[input.ratedPerson.rank];
  if (minimum && !isAtLeast(input.seniorRater, minimum)) {
    errors.push({
      code: "SENIOR_RATER_BELOW_MINIMUM_GRADE",
      message: `Senior rater must be at least ${minimum.rank} to senior-rate a ${input.ratedPerson.rank}; proposed rank is ${input.seniorRater.rank}.`,
    });
  }

  if (!isSeniorTo(input.seniorRater, input.rater, sameGradeCommandException)) {
    errors.push({
      code: "SENIOR_RATER_NOT_ABOVE_RATER",
      message: "Senior rater must be senior to the rater by grade or date of rank.",
    });
  }

  if (input.formType === "NCOER" && input.intermediateRater) {
    errors.push({
      code: "INTERMEDIATE_RATER_NOT_ALLOWED",
      message: "Intermediate rater is not used on NCOERs.",
    });
  }

  return { valid: errors.length === 0, errors };
}