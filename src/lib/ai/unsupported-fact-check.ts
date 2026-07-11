/**
 * Unsupported-fact detection (MVP audit 5.10).
 *
 * A deterministic warning mechanism — NOT a truth engine and NOT an
 * automatic factual adjudication system. Flags specific, checkable claims
 * (numbers, percentages, dates, named schools/courses, awards/rankings)
 * present in a candidate/final bullet that do not appear anywhere in the
 * selected source records (entry text + artifact captions). The rater
 * decides what to do with a flag — revise, add supporting context, or
 * confirm continued use.
 *
 * Deterministic comparison only. An LLM may assist claim *extraction*
 * elsewhere, but this module never uses one, and never blocks anything —
 * every result here is a WARNING, not a hard error.
 */

export type ClaimType =
  | "NUMBER"
  | "PERCENTAGE"
  | "DATE"
  | "SCHOOL"
  | "AWARD"
  | "RANKING";

export interface UnsupportedClaim {
  claimText: string;
  claimType: ClaimType;
  reason: string;
}

const MONTHS =
  "JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC|JANUARY|FEBRUARY|MARCH|APRIL|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER";

const DATE_PATTERNS = [
  new RegExp(`\\b\\d{1,2}\\s?(${MONTHS})\\s?\\d{2,4}\\b`, "gi"),
  /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g,
  /\b\d{4}-\d{2}-\d{2}\b/g,
];

const PERCENTAGE_PATTERN = /\b\d+(\.\d+)?\s?%/g;

// Matches integers/decimals, with optional thousands separators — used for
// generic numeric/quantity/hours/count claims once dates/percentages are
// already carved out.
const NUMBER_PATTERN = /\b\d{1,3}(,\d{3})*(\.\d+)?\b/g;

const RANKING_PATTERNS = [
  /#\s?1\b/gi,
  /\btop\s+\d+%/gi,
  /\bcommandant'?s\s+list\b/gi,
  /\bdistinguished\s+(honor\s+)?graduate\b/gi,
  /\border\s+of\s+(merit|the\s+spur|saint\s+\w+)\b/gi,
  /\bsoldier\s+of\s+the\s+(month|quarter|year)\b/gi,
  /\bnco\s+of\s+the\s+(month|quarter|year)\b/gi,
];

const SCHOOL_PATTERNS = [
  /\b(alc|blc|ancoc|bnco|sfc|master\s+leader|ranger|airborne|air\s+assault|sapper|pathfinder|jumpmaster|drill\s+sergeant|sniper|pre-ranger)\s+(school|course|academy)\b/gi,
  /\b[A-Z][a-zA-Z]*\s+(School|Course|Academy)\b/g,
];

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9%.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractMatches(text: string, patterns: RegExp[]): string[] {
  const matches: string[] = [];
  for (const pattern of patterns) {
    const found = text.match(pattern);
    if (found) matches.push(...found);
  }
  return [...new Set(matches.map((m) => m.trim()))];
}

/**
 * Checks whether `bulletText` contains specific, checkable claims that do
 * not appear anywhere in `sourceFacts` (normalized entry text + artifact
 * captions). Returns one warning per unsupported claim found.
 */
export function checkUnsupportedFacts(
  bulletText: string,
  sourceFacts: string[],
): UnsupportedClaim[] {
  const claims: UnsupportedClaim[] = [];
  const normalizedSource = normalize(sourceFacts.join(" "));

  // Dates first — carve them out before generic number matching so a date
  // like "15 JAN 2025" isn't also flagged as a bare, out-of-context "15".
  const dateMatches = extractMatches(bulletText, DATE_PATTERNS);
  let remainingText = bulletText;
  for (const date of dateMatches) {
    remainingText = remainingText.replace(date, " ");
    if (!normalizedSource.includes(normalize(date))) {
      claims.push({
        claimText: date,
        claimType: "DATE",
        reason: "This date does not appear in the selected source entries or artifact captions.",
      });
    }
  }

  // Percentages
  const pctMatches = extractMatches(remainingText, [PERCENTAGE_PATTERN]);
  for (const pct of pctMatches) {
    remainingText = remainingText.replace(pct, " ");
    const digits = pct.replace(/[^0-9.]/g, "");
    if (!normalizedSource.includes(digits)) {
      claims.push({
        claimText: pct,
        claimType: "PERCENTAGE",
        reason: "This percentage does not appear in the selected source entries or artifact captions.",
      });
    }
  }

  // Awards / rankings
  const rankingMatches = extractMatches(bulletText, RANKING_PATTERNS);
  for (const ranking of rankingMatches) {
    if (!normalizedSource.includes(normalize(ranking))) {
      claims.push({
        claimText: ranking,
        claimType: "RANKING",
        reason: "This ranking/distinction does not appear in the selected source entries or artifact captions.",
      });
    }
  }

  // Named schools/courses
  const schoolMatches = extractMatches(bulletText, SCHOOL_PATTERNS);
  for (const school of schoolMatches) {
    if (!normalizedSource.includes(normalize(school))) {
      claims.push({
        claimText: school,
        claimType: "SCHOOL",
        reason: "This school/course name does not appear in the selected source entries or artifact captions.",
      });
    }
  }

  // Generic numbers/quantities/hours/counts (whatever's left after removing
  // dates and percentages already accounted for above).
  const numberMatches = extractMatches(remainingText, [NUMBER_PATTERN]);
  for (const num of numberMatches) {
    const digits = num.replace(/,/g, "");
    if (digits.length === 0) continue;
    // Single-digit numbers are too common/ambiguous (list markers, ranks,
    // squad sizes mentioned incidentally) to reliably flag — restrict to
    // 2+ digit quantities, matching the "specific, checkable claims" intent.
    if (digits.replace(".", "").length < 2) continue;
    if (!normalizedSource.includes(digits)) {
      claims.push({
        claimText: num,
        claimType: "NUMBER",
        reason: "This number does not appear in the selected source entries or artifact captions.",
      });
    }
  }

  return claims;
}
