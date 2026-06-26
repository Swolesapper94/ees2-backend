// Pre-submission consistency check.
// Produces warnings (not hard blocks) before an eval is sent for signatures.
// See start.md §6 for the six flag types.

export type FlagSeverity = "WARNING" | "INFO";

export interface ConsistencyFlag {
  code:
    | "BOX_NARRATIVE_MISMATCH"
    | "DUPLICATE_BULLET"
    | "RATING_NARRATIVE_STRENGTH"
    | "EMPTY_SECTION"
    | "COUNSELING_GAP"
    | "SR_PROFILE_MQ_WARNING";
  severity: FlagSeverity;
  section?: string;
  message: string;
  resolvable: boolean;
}

export type BulletSource = "HUMAN" | "AI_MODIFIED" | "AI_UNMODIFIED";

export interface SectionForCheck {
  section: string;
  ratingBinary?: string | null;
  ratingFourLevel?: string | null;
  finalBullets: string[];
  bulletSources?: Record<string, BulletSource> | null;
}

export interface ConsistencyInput {
  sections: SectionForCheck[];
  uncounseledEntryCount: number;
  // Senior rater profile context (optional — only when SR is finalizing).
  srProfile?: {
    grade: string;
    currentMqCount: number;
    totalRated: number;
    addingMostQualified: boolean;
    mqThreshold: number; // e.g. 0.5
  };
}

const NEGATIVE_LANGUAGE =
  /\b(failed|deficien|did not|unable|struggled|below standard|counsel(ed|ing) for|reprimand)/i;

const PART_IV_SECTIONS = new Set([
  "CHARACTER",
  "PRESENCE",
  "INTELLECT",
  "LEADS",
  "DEVELOPS",
  "ACHIEVES",
]);

export function runConsistencyCheck(input: ConsistencyInput): ConsistencyFlag[] {
  const flags: ConsistencyFlag[] = [];

  // 5 — Duplicate / near-duplicate bullets across sections
  const seen = new Map<string, string>(); // normalized bullet -> section
  for (const s of input.sections) {
    for (const bullet of s.finalBullets) {
      const norm = normalize(bullet);
      if (!norm) continue;
      const prior = seen.get(norm);
      if (prior) {
        flags.push({
          code: "DUPLICATE_BULLET",
          severity: "WARNING",
          section: s.section,
          message: `Duplicate or near-duplicate bullet appears in ${prior} and ${s.section}.`,
          resolvable: true,
        });
      } else {
        seen.set(norm, s.section);
      }
    }
  }

  for (const s of input.sections) {
    if (!PART_IV_SECTIONS.has(s.section)) continue;

    const hasRating = Boolean(s.ratingBinary || s.ratingFourLevel);
    const bulletCount = s.finalBullets.length;

    // 4 — Empty section: box checked but no bullets
    if (hasRating && bulletCount === 0) {
      flags.push({
        code: "EMPTY_SECTION",
        severity: "WARNING",
        section: s.section,
        message: `${s.section} has a rating but no bullets.`,
        resolvable: true,
      });
    }

    // 1 — Box check vs. bullet narrative mismatch
    const positiveRating =
      s.ratingBinary === "MET_STANDARD" ||
      s.ratingFourLevel === "EXCEEDED_STANDARD" ||
      s.ratingFourLevel === "FAR_EXCEEDED_STANDARD" ||
      s.ratingFourLevel === "QUALIFIED";
    const hasNegativeNarrative = s.finalBullets.some((b) =>
      NEGATIVE_LANGUAGE.test(b),
    );
    if (positiveRating && hasNegativeNarrative) {
      flags.push({
        code: "BOX_NARRATIVE_MISMATCH",
        severity: "WARNING",
        section: s.section,
        message: `${s.section} is rated positively but a bullet contains deficiency language.`,
        resolvable: true,
      });
    }

    // 3 — Top rating but weak narrative (single bullet)
    const topRating =
      s.ratingFourLevel === "FAR_EXCEEDED_STANDARD" ||
      (s.section === "ACHIEVES" && s.ratingBinary === "MET_STANDARD");
    if (topRating && bulletCount === 1) {
      flags.push({
        code: "RATING_NARRATIVE_STRENGTH",
        severity: "WARNING",
        section: s.section,
        message: `${s.section} carries the highest rating but only one supporting bullet.`,
        resolvable: true,
      });
    }
  }

  // 6 — Senior rater MQ profile threshold
  if (input.srProfile?.addingMostQualified) {
    const { currentMqCount, totalRated, mqThreshold, grade } = input.srProfile;
    const projected = (currentMqCount + 1) / (totalRated + 1);
    if (projected > mqThreshold) {
      flags.push({
        code: "SR_PROFILE_MQ_WARNING",
        severity: "WARNING",
        message: `Adding MOST QUALIFIED would put your MQ rate at ${(projected * 100).toFixed(0)}% for ${grade} (threshold ~${(mqThreshold * 100).toFixed(0)}%).`,
        resolvable: false,
      });
    }
  }

  // 2 — Counseling gap (informational)
  if (input.uncounseledEntryCount > 0) {
    flags.push({
      code: "COUNSELING_GAP",
      severity: "INFO",
      message: `${input.uncounseledEntryCount} support form entries were never marked as counseled.`,
      resolvable: true,
    });
  }

  return flags;
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
