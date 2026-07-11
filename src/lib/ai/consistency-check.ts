// Pre-submission consistency check.
// See start.md §6 for the six flag types (plus UNSUPPORTED_CLAIM, MVP audit
// 5.10, and PROHIBITED_LANGUAGE, MVP audit 5.14).
//
// Severity taxonomy (MVP audit 5.14 — previously flat WARNING/INFO only,
// meaning nothing could ever actually block a transition):
//   BLOCKING_ERROR       — must be fixed before the eval can be signed/
//                          submitted. Currently: prohibited language,
//                          future-tense promises, and over-length bullets.
//   CONFIRMATION_REQUIRED — the rater/SR must explicitly acknowledge before
//                          proceeding (not auto-fixable, but not a hard
//                          block either). Currently: unsupported factual
//                          claims.
//   WARNING              — surfaced, non-blocking, no confirmation required.
//   INFO                 — informational only.
// `hasBlockingErrors()` below is the single source of truth callers should
// use to decide whether to actually gate a transition — do not re-implement
// this check ad hoc at each call site.

import { checkUnsupportedFacts } from "./unsupported-fact-check";
import { checkBulletQuality } from "./prohibited-language";
import { checkGenericBullet } from "./generic-bullet-check";

export type FlagSeverity = "BLOCKING_ERROR" | "CONFIRMATION_REQUIRED" | "WARNING" | "INFO";

export interface ConsistencyFlag {
  code:
    | "BOX_NARRATIVE_MISMATCH"
    | "DUPLICATE_BULLET"
    | "RATING_NARRATIVE_STRENGTH"
    | "EMPTY_SECTION"
    | "COUNSELING_GAP"
    | "SR_PROFILE_MQ_WARNING"
    | "UNSUPPORTED_CLAIM"
    | "PROHIBITED_LANGUAGE"
    | "GENERIC_BULLET";
  severity: FlagSeverity;
  section?: string;
  message: string;
  resolvable: boolean;
}

/** True if any flag in the list is a hard BLOCKING_ERROR. Callers that need
 * to gate a transition (e.g. sign, submit-to-hdqa, section save) should use
 * this rather than re-deriving the check themselves. */
export function hasBlockingErrors(flags: ConsistencyFlag[]): boolean {
  return flags.some((f) => f.severity === "BLOCKING_ERROR");
}

export type BulletSource = "HUMAN" | "AI_MODIFIED" | "AI_UNMODIFIED";

export interface SectionForCheck {
  section: string;
  ratingBinary?: string | null;
  ratingFourLevel?: string | null;
  finalBullets: string[];
  bulletSources?: Record<string, BulletSource> | null;
  // Provenance chain for AI-sourced bullets (MVP audit 5.9) — used here to
  // re-check final bullet text against its immutable source snapshot.
  bulletProvenance?: Record<
    string,
    { sourceSnapshot?: { rawText: string; artifactCaptions: string[] }[] | null }
  > | null;
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

  // 7 — Unsupported factual claims in AI-sourced final bullets (advisory
  // only — re-checks current bullet text against its immutable source
  // snapshot captured at generation time, so a later manual edit that
  // introduces an unsupported number/date/etc. still gets caught here even
  // if it slipped past the accept-time check).
  for (const s of input.sections) {
    if (!s.bulletProvenance) continue;
    s.finalBullets.forEach((bullet, i) => {
      const prov = s.bulletProvenance?.[String(i)];
      const snapshot = prov?.sourceSnapshot;
      if (!snapshot || snapshot.length === 0) return;
      const sourceFacts = snapshot.flatMap((snap) => [
        snap.rawText,
        ...(snap.artifactCaptions ?? []),
      ]);
      const claims = checkUnsupportedFacts(bullet, sourceFacts);
      for (const claim of claims) {
        flags.push({
          code: "UNSUPPORTED_CLAIM",
          // Upgraded from WARNING (MVP audit 5.14) — an unsupported factual
          // claim on a final bullet is more than a soft warning; the rater
          // must explicitly confirm/resolve it, not just see it in passing.
          severity: "CONFIRMATION_REQUIRED",
          section: s.section,
          message: `"${claim.claimText}" is not supported by the selected source entries/artifacts — ${claim.reason}`,
          resolvable: true,
        });
      }
    });
  }

  // 8 — Prohibited language / quality issues on final bullets (MVP audit
  // 5.14). This is the same deterministic checker enforced server-side at
  // save time (see evaluations.ts section PATCH) — surfaced again here so
  // a bullet written before enforcement existed, or an existing bullet a
  // later regex update newly catches, still shows up in the pre-submission
  // report rather than being silently invisible.
  for (const s of input.sections) {
    for (const bullet of s.finalBullets) {
      const { issues } = checkBulletQuality(bullet);
      for (const issue of issues) {
        flags.push({
          code: "PROHIBITED_LANGUAGE",
          severity: issue.severity === "ERROR" ? "BLOCKING_ERROR" : "WARNING",
          section: s.section,
          message: `"${issue.match}" — ${issue.suggestion}`,
          resolvable: true,
        });
      }
    }
  }

  // 9 — Generic bullet: no specific, checkable content at all (product-
  // research gap — complements the fabricated-claim check above, which
  // only catches specificity that's WRONG, not specificity that's ABSENT).
  for (const s of input.sections) {
    if (!PART_IV_SECTIONS.has(s.section)) continue;
    for (const bullet of s.finalBullets) {
      const { isGeneric, matchedPhrase } = checkGenericBullet(bullet);
      if (isGeneric) {
        flags.push({
          code: "GENERIC_BULLET",
          severity: "WARNING",
          section: s.section,
          message: `"${matchedPhrase}" is generic praise with no specific, checkable detail (number, date, named course/event). Consider adding one.`,
          resolvable: true,
        });
      }
    }
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
