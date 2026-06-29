/**
 * Signature Content Hash Service — Phase 3
 *
 * Computes a SHA-256 hash of the fields in each signer's "scope"
 * (the content they attested to at signing time).
 *
 * When any scoped field changes, the hash is recomputed and compared.
 * If it differs, the signature is marked isStale = true.
 *
 * Per EES2-AGENT-INSTRUCTIONS §6 and §19.
 */

import crypto from "crypto";
import { prisma } from "@/lib/prisma";

// ─── Scope definitions — which fields each role attests to ───────────────────

/**
 * Fields extracted from an evaluation + its sections to compute scope hashes.
 */
interface EvalSnapshot {
  // Part I administrative
  periodStart: Date;
  periodEnd: Date;
  reasonForSubmission: string;
  // Part III duty description
  principalDutyTitle: string | null;
  dailyDutiesScope: string | null;
  areasOfSpecialEmphasis: string | null;
  // Part IV bullets + ratings (per section)
  sections: {
    section: string;
    ratingBinary: string | null;
    ratingFourLevel: string | null;
    finalBullets: string[];
  }[];
  // SR fields
  seniorRaterRating: string | null;
}

type SignerRole = "RATER" | "SENIOR_RATER" | "SOLDIER" | "REVIEWER";

/**
 * Build the canonical string for a given role's signing scope.
 * Must be deterministic — same inputs always produce the same string.
 */
function buildScopeString(snapshot: EvalSnapshot, role: SignerRole): string {
  const raterScope = [
    snapshot.periodStart.toISOString(),
    snapshot.periodEnd.toISOString(),
    snapshot.reasonForSubmission,
    snapshot.principalDutyTitle ?? "",
    snapshot.dailyDutiesScope ?? "",
    snapshot.areasOfSpecialEmphasis ?? "",
    ...snapshot.sections.map(
      (s) =>
        `${s.section}:${s.ratingBinary ?? ""}:${s.ratingFourLevel ?? ""}:${s.finalBullets.sort().join("|")}`,
    ),
  ].join("||");

  if (role === "RATER") return raterScope;

  const srScope = [
    raterScope,
    snapshot.seniorRaterRating ?? "",
  ].join("||SR||");

  if (role === "SENIOR_RATER") return srScope;

  // SOLDIER and REVIEWER attest to the full document (same as SR scope)
  return srScope;
}

export function computeContentHash(
  snapshot: EvalSnapshot,
  role: SignerRole,
): string {
  const scopeString = buildScopeString(snapshot, role);
  return crypto.createHash("sha256").update(scopeString, "utf8").digest("hex");
}

/**
 * Load the current eval snapshot from the database.
 */
export async function loadEvalSnapshot(
  evaluationId: string,
): Promise<EvalSnapshot | null> {
  const evaluation = await prisma.evaluation.findUnique({
    where: { id: evaluationId },
    include: {
      sections: {
        where: {
          section: {
            in: [
              "CHARACTER",
              "PRESENCE",
              "INTELLECT",
              "LEADS",
              "DEVELOPS",
              "ACHIEVES",
            ] as never[],
          },
        },
      },
    },
  });

  if (!evaluation) return null;

  return {
    periodStart: evaluation.periodStart,
    periodEnd: evaluation.periodEnd,
    reasonForSubmission: evaluation.reasonForSubmission,
    principalDutyTitle: evaluation.principalDutyTitle,
    dailyDutiesScope: evaluation.dailyDutiesScope,
    areasOfSpecialEmphasis: evaluation.areasOfSpecialEmphasis,
    sections: evaluation.sections.map((s) => ({
      section: s.section,
      ratingBinary: s.ratingBinary,
      ratingFourLevel: s.ratingFourLevel,
      finalBullets: s.finalBullets,
    })),
    seniorRaterRating: evaluation.seniorRaterRating ?? null,
  };
}

/**
 * After any substantive field is edited, re-check all existing signatures.
 * Marks signatures stale if their content hash no longer matches current content.
 *
 * Call this after any PATCH to evaluation fields or section bullets.
 */
export async function staleSigDetect(
  evaluationId: string,
  changedByUserId: string,
): Promise<string[]> {
  const snapshot = await loadEvalSnapshot(evaluationId);
  if (!snapshot) return [];

  const signatures = await prisma.signature.findMany({
    where: {
      evaluationId,
      status: "SIGNED",
      isStale: false,
      contentHash: { not: null },
    },
  });

  const staledRoles: string[] = [];

  for (const sig of signatures) {
    const currentHash = computeContentHash(
      snapshot,
      sig.role as SignerRole,
    );

    if (sig.contentHash !== currentHash) {
      await prisma.signature.update({
        where: { id: sig.id },
        data: {
          isStale: true,
          staledAt: new Date(),
          staledByUserId: changedByUserId,
          staledReason: "FIELD_EDIT",
        },
      });
      staledRoles.push(sig.role);
    }
  }

  return staledRoles;
}

/**
 * Called when a user signs. Captures the content hash at signing time.
 */
export async function captureSignatureHash(
  evaluationId: string,
  role: SignerRole,
): Promise<string> {
  const snapshot = await loadEvalSnapshot(evaluationId);
  if (!snapshot) throw new Error("Evaluation not found for hash computation.");
  return computeContentHash(snapshot, role);
}
