import { prisma } from "@/lib/prisma";
import type { EvalFormType, Rank } from "@prisma/client";

// ─────────────────────────────────────────────────────────────────
// Role & Form Type Resolution (Delta Sections 1 & 3.2)
// ─────────────────────────────────────────────────────────────────

export type UserChainRole = "RATER" | "SENIOR_RATER";

export interface ResolvedFormType {
  formType: EvalFormType;
  evalType: "NCOER" | "OER";
  /**
   * Drives whether the eval card shows the full builder or the
   * "Coming Soon" stub. Only NCOER forms have a builder in the MVP.
   */
  builderAvailable: boolean;
}

/**
 * Maps a soldier's rank to the single eval form that applies to them.
 * NCOERs (E5–E9) get the full builder; OERs are dashboard/support-form
 * only for the MVP (builderAvailable: false).
 */
export function resolveFormType(rank: Rank): ResolvedFormType {
  switch (rank) {
    // ── NCOERs ────────────────────────────────────────────────────
    case "SGT":
      return { formType: "NCOER_9_1", evalType: "NCOER", builderAvailable: true };

    case "SSG":
    case "SFC":
    case "MSG":
    case "FIRST_SERGEANT":
      return { formType: "NCOER_9_2", evalType: "NCOER", builderAvailable: true };

    case "SGM":
    case "CSM":
    case "SMA":
      return { formType: "NCOER_9_3", evalType: "NCOER", builderAvailable: true };

    // ── OERs (stub — dashboard + support form only) ───────────────
    case "WO1":
    case "CW2":
      return { formType: "OER_67_10_1A", evalType: "OER", builderAvailable: false };

    case "CW3":
    case "CW4":
    case "CW5":
      return { formType: "OER_67_10_2A", evalType: "OER", builderAvailable: false };

    case "SECOND_LT":
    case "FIRST_LT":
      return { formType: "OER_67_10_1", evalType: "OER", builderAvailable: false };

    case "CPT":
      return { formType: "OER_67_10_2", evalType: "OER", builderAvailable: false };

    case "MAJ":
    case "LTC":
    case "COL":
      return { formType: "OER_67_10_3", evalType: "OER", builderAvailable: false };

    case "BG":
    case "MG":
    case "LTG":
    case "GEN":
    case "GA":
      return { formType: "OER_67_10_4", evalType: "OER", builderAvailable: false };

    // ── Junior enlisted (E1–E4) — no eval ─────────────────────────
    default:
      return { formType: "NCOER_9_1", evalType: "NCOER", builderAvailable: false };
  }
}

/**
 * Resolves every active rating chain where the given user is the rater or
 * senior rater. A single user can be RATER for some soldiers and
 * SENIOR_RATER for others simultaneously — this resolves the role per chain.
 *
 * Powers Zone B ("My Soldiers") on the dashboard.
 */
export async function getChainRolesForUser(userId: string) {
  const chains = await prisma.ratingChain.findMany({
    where: {
      isActive: true,
      OR: [{ raterId: userId }, { seniorRaterId: userId }],
    },
    include: {
      ratedSoldier: {
        include: {
          // Active support form for the rated soldier, with entry count.
          // (Support forms link to the soldier, not directly to the chain.)
          supportForms: {
            where: { isActive: true },
            take: 1,
            include: { _count: { select: { entries: true } } },
          },
        },
      },
      rater: true,
      seniorRater: true,
      evaluations: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { milestones: true, sections: true },
      },
    },
  });

  return chains.map((chain) => ({
    chain,
    soldier: chain.ratedSoldier,
    myRole: (chain.raterId === userId
      ? "RATER"
      : "SENIOR_RATER") as UserChainRole,
    latestEval: chain.evaluations[0] ?? null,
    activeSupportForm: chain.ratedSoldier.supportForms[0] ?? null,
    ...resolveFormType(chain.ratedSoldier.rank),
  }));
}
