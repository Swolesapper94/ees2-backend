// Enlisted/Officer/WO grade classification — shared by dashboard analytics
// and the senior-rater profile-cap check so the NCO-vs-Officer distinction
// (and the AR 623-3 MQ cap that depends on it) is defined in exactly one
// place instead of drifting between call sites.

export const NCO_RANKS = ["SGT", "SSG", "SFC", "MSG", "FIRST_SERGEANT", "SGM", "CSM", "SMA"];
export const WO_RANKS = ["WO1", "CW2", "CW3", "CW4", "CW5"];

export function isNcoGrade(rank: string): boolean {
  return NCO_RANKS.includes(rank);
}

export function isOfficerOrWo(rank: string): boolean {
  return (
    WO_RANKS.includes(rank) ||
    (!isNcoGrade(rank) && !["PVT", "PV2", "PFC", "SPC", "CPL"].includes(rank))
  );
}

/**
 * AR 623-3 Senior Rater profile cap: NCOs are capped at 24% MOST QUALIFIED
 * per grade; Officers/Warrant Officers at 50%. Returns the cap as a whole
 * percentage (e.g. 24, not 0.24).
 */
export function srMqCapPercentFor(rank: string): number {
  return isNcoGrade(rank) ? 24 : 50;
}
