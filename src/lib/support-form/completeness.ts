import { prisma } from "@/lib/prisma";
import type { EvalCategory, SectionKey } from "@prisma/client";

// ─────────────────────────────────────────────────────────────────
// Support Form completeness — the authoritative gate that decides
// whether a Soldier can finalize their support form and, downstream,
// whether they can initiate their NCOER/OER.
//
// Two-tier by design (2026-07 review decision):
//   - HARD gate (unlocks eval initiation): Part I–III admin filled
//     + at least ONE goal in ANY dimension. This is deliberately loose
//     so a Soldier who is still thinking through one dimension (e.g.
//     DEVELOPS) is never indefinitely blocked from starting a real eval.
//   - SOFT indicator (encouragement, not a block): all 6 leadership
//     dimensions have ≥1 goal each. Shown to the Soldier/Rater/SR as a
//     completeness percentage / checklist, never enforced server-side.
// ─────────────────────────────────────────────────────────────────

/** The 6 real Part IV/V leadership dimensions — excludes the non-dimension
 *  SectionKey values (RATER_OVERALL, SENIOR_RATER_OVERALL, SOLDIER_COMMENTS)
 *  which exist on the enum for evaluation sections, not support-form goals. */
export const LEADERSHIP_DIMENSIONS = [
  "CHARACTER",
  "PRESENCE",
  "INTELLECT",
  "LEADS",
  "DEVELOPS",
  "ACHIEVES",
] as const satisfies readonly SectionKey[];

export type LeadershipDimension = (typeof LEADERSHIP_DIMENSIONS)[number];

/** Fields applicable per evalCategory. NCO forms carry PMOSC/SSD-NCOES;
 * Officer forms don't (they carry Branch/Component instead — captured on
 * the User/Unit profile, not per support form). Used by both the
 * completeness check and the PATCH route's field-guard. */
export function allowedFieldsFor(evalCategory: EvalCategory): readonly string[] {
  const shared = [
    "dutyTitle",
    "dailyDutiesScope",
    "soldierGoals",
    "ratingPeriodStart",
    "ratingPeriodEnd",
  ] as const;

  if (evalCategory === "NCOER") {
    return [...shared, "dutyMosc", "ssdNcoesMet", "areasOfEmphasis", "appointedDuties"];
  }

  // OER — no dutyMosc/ssdNcoesMet/areasOfEmphasis/appointedDuties; Part III
  // is a single "Significant Duties and Responsibilities" narrative, which
  // reuses `dailyDutiesScope` as the storage field (see design doc §2b).
  return shared;
}

export interface CompletenessResult {
  /** Hard gate — presence unlocks eval initiation. */
  hardComplete: boolean;
  /** Soft indicator — all 6 dimensions populated. Never blocks anything. */
  softComplete: boolean;
  /** Human-readable list of what's missing for the HARD gate only. */
  missing: string[];
  /** Per-dimension goal counts, for the soft-completeness checklist UI. */
  goalCountsByDimension: Record<LeadershipDimension, number>;
}

export async function checkCompleteness(supportFormId: string): Promise<CompletenessResult> {
  const form = await prisma.supportForm.findUnique({
    where: { id: supportFormId },
    include: {
      entries: { where: { entryType: "OBJECTIVE" } },
    },
  });

  if (!form) {
    throw new Error(`Support form not found: ${supportFormId}`);
  }

  const missing: string[] = [];

  // Part III — required regardless of evalCategory
  if (!form.dutyTitle || form.dutyTitle.trim() === "") missing.push("dutyTitle");
  if (!form.dailyDutiesScope || form.dailyDutiesScope.trim() === "") {
    missing.push("dailyDutiesScope");
  }

  // Part I — NCO-only required fields
  if (form.evalCategory === "NCOER") {
    if (!form.dutyMosc || form.dutyMosc.trim() === "") missing.push("dutyMosc");
    if (form.ssdNcoesMet === null || form.ssdNcoesMet === undefined) {
      missing.push("ssdNcoesMet");
    }
  }

  const goalCountsByDimension = Object.fromEntries(
    LEADERSHIP_DIMENSIONS.map((dim) => [
      dim,
      form.entries.filter((e) => e.section === dim).length,
    ]),
  ) as Record<LeadershipDimension, number>;

  const totalGoals = Object.values(goalCountsByDimension).reduce((a, b) => a + b, 0);
  const allDimensionsHaveGoal = LEADERSHIP_DIMENSIONS.every(
    (dim) => goalCountsByDimension[dim] > 0,
  );

  if (totalGoals === 0) {
    missing.push("at least one performance goal");
  }

  const hardComplete = missing.length === 0;
  const softComplete = hardComplete && allDimensionsHaveGoal;

  return { hardComplete, softComplete, missing, goalCountsByDimension };
}
