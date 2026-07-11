/**
 * Generic-bullet detection (product-research gap, 2026-07-06).
 *
 * Complements `unsupported-fact-check.ts` (which only catches FABRICATED
 * specific claims). This catches the opposite, more common failure mode
 * called out repeatedly in both military (RallyPoint "why are NCOER
 * comments so generic") and civilian performance-review research: a
 * bullet with ZERO specific, checkable content at all — no number, date,
 * named school/event, or quantified outcome — that could describe
 * literally anyone. Deterministic only, WARNING severity, never blocks —
 * a short, true, unembellished bullet is sometimes legitimate, so this is
 * a nudge to add specificity, not a hard gate.
 */

// A bullet already containing a digit (score, count, percentage, date) has
// at least one checkable, specific detail — skip the generic-phrase check
// entirely rather than risk a false positive on an otherwise-fine bullet.
const HAS_DIGIT = /\d/;

// Well-documented "spongy"/filler phrases from Army writing guidance and
// the civilian research (SHRM/Leadership IQ) — cliché praise with no
// attached specifics.
const GENERIC_PHRASES = [
  /\bteam player\b/i,
  /\bhard worker\b/i,
  /\bgreat (soldier|nco|leader|attitude|potential)\b/i,
  /\bwent above and beyond\b/i,
  /\boutstanding (performance|soldier|nco|leader|potential)\b/i,
  /\bexceptional (leader|soldier|nco|performance|potential)\b/i,
  /\bconsistently (demonstrated|exceeded|performed|excelled)\b/i,
  /\bstrong (leader|leadership|potential|performer)\b/i,
  /\bsolid performer\b/i,
  /\bdependable\b/i,
  /\balways (goes|went|gives|gave)\b/i,
  /\bgood (soldier|attitude|work ethic)\b/i,
  /\bself[- ]?starter\b/i,
];

export interface GenericBulletResult {
  isGeneric: boolean;
  matchedPhrase?: string;
}

/**
 * Returns true if the bullet contains a known generic/filler phrase AND has
 * no digit anywhere (a bullet with a real number is treated as specific
 * enough regardless of phrasing).
 */
export function checkGenericBullet(bulletText: string): GenericBulletResult {
  if (HAS_DIGIT.test(bulletText)) return { isGeneric: false };

  for (const pattern of GENERIC_PHRASES) {
    const match = bulletText.match(pattern);
    if (match) {
      return { isGeneric: true, matchedPhrase: match[0] };
    }
  }
  return { isGeneric: false };
}
