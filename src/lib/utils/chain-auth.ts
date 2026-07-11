/**
 * Rating-chain authorization guard (MVP audit, cross-cutting fix).
 *
 * Most routes previously only checked `requireAuth` (is the caller logged
 * in?) with no verification that the caller is actually a member of the
 * RatingChain for the resource being touched. This let any authenticated
 * user read/act on any evaluation, entry, PDF, or milestone regardless of
 * ownership. Use these helpers wherever a route accepts an evaluationId,
 * ratingChainId, or a resource that hangs off one, and needs to restrict
 * access to the rater/senior rater/reviewer/rated soldier on that chain.
 */

import { prisma } from "@/lib/prisma";
import { HttpError } from "@/middleware/error";
import type { RatingChain } from "@prisma/client";

export type ChainRole = "RATER" | "SENIOR_RATER" | "REVIEWER" | "SOLDIER";

function roleHolderId(chain: RatingChain, role: ChainRole): string | null {
  switch (role) {
    case "RATER":
      return chain.raterId;
    case "SENIOR_RATER":
      return chain.seniorRaterId;
    case "REVIEWER":
      return chain.reviewerId;
    case "SOLDIER":
      return chain.ratedSoldierId;
  }
}

/**
 * True if `userId` holds one of `allowedRoles` on `chain`, OR `userId`
 * belongs to a user with the ADMIN role (checked separately by callers that
 * want an admin override — this function only checks chain membership).
 */
function chainHasRole(
  chain: RatingChain,
  userId: string,
  allowedRoles: ChainRole[],
): boolean {
  return allowedRoles.some((role) => roleHolderId(chain, role) === userId);
}

/**
 * Verifies `userId` holds one of `allowedRoles` on the RatingChain that owns
 * `evaluationId`. Throws 404 if the evaluation doesn't exist, 403 if the
 * user isn't an authorized chain member (ADMIN users always pass). Returns
 * the evaluation (with ratingChain included) on success so callers can
 * reuse it instead of re-fetching.
 */
export async function requireEvalChainRole(
  evaluationId: string,
  user: { id: string; roles: string[] },
  allowedRoles: ChainRole[],
) {
  const evaluation = await prisma.evaluation.findUnique({
    where: { id: evaluationId },
    include: { ratingChain: true },
  });
  if (!evaluation) throw new HttpError(404, "Evaluation not found");

  if (user.roles.includes("ADMIN")) return evaluation;

  if (!chainHasRole(evaluation.ratingChain, user.id, allowedRoles)) {
    throw new HttpError(403, "You are not authorized for this evaluation.");
  }
  return evaluation;
}

/**
 * Same check as `requireEvalChainRole`, but keyed directly by ratingChainId
 * (used by resources like SupportFormEntry that hang off a chain without an
 * evaluation in scope yet).
 */
export async function requireRatingChainRole(
  ratingChainId: string,
  user: { id: string; roles: string[] },
  allowedRoles: ChainRole[],
) {
  const chain = await prisma.ratingChain.findUnique({
    where: { id: ratingChainId },
  });
  if (!chain) throw new HttpError(404, "Rating chain not found");

  if (user.roles.includes("ADMIN")) return chain;

  if (!chainHasRole(chain, user.id, allowedRoles)) {
    const roleNames = allowedRoles.join(", ");
    throw new HttpError(
      403,
      `You are not authorized for this rating chain. Required role(s): ${roleNames}. Your user ID: ${user.id}`
    );
  }
  return chain;
}

/**
 * Verifies `userId` is the soldier who owns the SupportFormEntry (i.e. the
 * entry belongs to a support form where `soldierId === userId`). Used for
 * artifact upload — a soldier logs evidence against their own entries only.
 * Returns the entry (with supportForm) on success.
 */
export async function requireSupportFormEntryOwner(
  entryId: string,
  user: { id: string; roles: string[] },
) {
  const entry = await prisma.supportFormEntry.findUnique({
    where: { id: entryId },
    include: { supportForm: true },
  });
  if (!entry) throw new HttpError(404, "Support form entry not found.");
  if (user.roles.includes("ADMIN")) return entry;
  if (entry.supportForm.soldierId !== user.id) {
    throw new HttpError(
      403,
      "You can only manage artifacts on your own support form entries.",
    );
  }
  return entry;
}

/**
 * Verifies `userId` owns the SupportFormEntryArtifact via its parent entry's
 * support form. Used for flag/delete — only the soldier who uploaded it
 * (via their own support form) may change or remove it.
 */
export async function requireArtifactOwner(
  artifactId: string,
  user: { id: string; roles: string[] },
) {
  const artifact = await prisma.supportFormEntryArtifact.findUnique({
    where: { id: artifactId },
    include: { entry: { include: { supportForm: true } } },
  });
  if (!artifact) throw new HttpError(404, "Artifact not found.");
  if (user.roles.includes("ADMIN")) return artifact;
  if (artifact.entry.supportForm.soldierId !== user.id) {
    throw new HttpError(403, "You can only manage your own artifacts.");
  }
  return artifact;
}

/**
 * Re-fetches and authorizes a set of SupportFormEntry IDs against the
 * evaluation they're being used for. Rejects if any entry does not belong
 * to the evaluation's linked SupportForm — this is the fix for the
 * confirmed cross-soldier generation gap (5.6 in the MVP audit): a client
 * could otherwise submit any entryId from any soldier's support form.
 * Returns the authorized entries (with artifacts) so callers avoid a
 * second fetch.
 */
export async function requireEntriesBelongToEval(
  evaluationId: string,
  entryIds: string[],
) {
  if (entryIds.length === 0) return [];

  const evaluation = await prisma.evaluation.findUnique({
    where: { id: evaluationId },
    select: { supportFormId: true },
  });
  if (!evaluation?.supportFormId) {
    throw new HttpError(409, "Evaluation has no linked support form.");
  }

  const entries = await prisma.supportFormEntry.findMany({
    where: { id: { in: entryIds } },
    include: { artifacts: true },
  });

  const unauthorized = entries.filter(
    (e) => e.supportFormId !== evaluation.supportFormId,
  );
  if (entries.length !== entryIds.length || unauthorized.length > 0) {
    throw new HttpError(
      403,
      "One or more entries do not belong to this evaluation's support form.",
    );
  }

  return entries;
}
