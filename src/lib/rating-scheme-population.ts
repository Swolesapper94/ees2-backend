import { Rank, SoldierCategory, type User } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const RATED_NCO_RANKS = new Set<Rank>([
  "SGT", "SSG", "SFC", "MSG", "FIRST_SERGEANT", "SGM", "CSM", "SMA",
]);

/** E-5+ NCOs, warrant officers, and commissioned officers receive evaluation reports. */
export function isRatingEligiblePerson(person: Pick<User, "rank" | "category">): boolean {
  return RATED_NCO_RANKS.has(person.rank) || person.category === SoldierCategory.OFFICER || person.category === SoldierCategory.WARRANT || [
    "WO1", "CW2", "CW3", "CW4", "CW5", "SECOND_LT", "FIRST_LT", "CPT", "MAJ", "LTC", "COL", "BG", "MG", "LTG", "GEN", "GA",
  ].includes(person.rank);
}

export type RatingSchemePopulationPerson = Pick<User, "id" | "firstName" | "lastName" | "rank" | "mos" | "category">;

export async function ratingSchemePopulation(unitId: string, ratedSoldierIds: string[]) {
  const personnel = await prisma.user.findMany({
    where: { unitId, applicationAccessStatus: "ACTIVE" },
    select: { id: true, firstName: true, lastName: true, rank: true, mos: true, category: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
  const eligiblePersonnel = personnel.filter(isRatingEligiblePerson);
  const ratedIds = new Set(ratedSoldierIds);
  return {
    eligiblePersonnel,
    unassignedPersonnel: eligiblePersonnel.filter((person) => !ratedIds.has(person.id)),
  };
}