import {
  DelegationCapability,
  DelegationStatus,
  type Delegate,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type DelegationDenialCode =
  | "DELEGATION_NOT_FOUND"
  | "DELEGATION_NOT_ACTIVE"
  | "DELEGATION_EXPIRED"
  | "DELEGATION_REVOKED"
  | "DELEGATION_SUSPENDED"
  | "DELEGATION_SCOPE_MISMATCH"
  | "DELEGATION_CAPABILITY_NOT_GRANTED"
  | "DELEGATION_ACTION_NONDELEGABLE"
  | "DELEGATION_RESOURCE_LOCKED"
  | "DELEGATION_SUBJECT_MISMATCH"
  | "DELEGATION_GRANTOR_NOT_AUTHORIZED"
  | "DELEGATION_REQUIRES_REVIEW"
  | "DELEGATION_SUBDELEGATION_PROHIBITED";

export interface DelegationAuthorizationContext {
  actorUserId: string;
  subjectUserId: string;
  capability: DelegationCapability;
  evaluationId?: string;
  supportFormId?: string;
  ratingAssignmentId?: string;
  unitId?: string;
}

export interface DelegationAuthorizationResult {
  allowed: boolean;
  grant?: Delegate;
  denialCode?: DelegationDenialCode;
}

const nonDelegableCapabilities = new Set<string>();

function denied(denialCode: DelegationDenialCode): DelegationAuthorizationResult {
  return { allowed: false, denialCode };
}

function grantIsWithinEffectivePeriod(grant: Delegate, now: Date): boolean {
  return Boolean(
    grant.effectiveFrom &&
    grant.effectiveTo &&
    grant.effectiveFrom <= now &&
    grant.effectiveTo > now,
  );
}

function scopeMatches(grant: Delegate, context: DelegationAuthorizationContext): boolean {
  if (grant.evaluationId && grant.evaluationId !== context.evaluationId) return false;
  if (grant.supportFormId && grant.supportFormId !== context.supportFormId) return false;
  if (grant.ratingAssignmentId && grant.ratingAssignmentId !== context.ratingAssignmentId) return false;
  if (grant.unitId && grant.unitId !== context.unitId) return false;
  return Boolean(grant.evaluationId || grant.supportFormId || grant.ratingAssignmentId || grant.unitId);
}

/**
 * Checks only explicit, accepted access grants. Legacy Delegate rows are not
 * authorization inputs until the compatibility migration sets status, scope,
 * dates, subject, and capabilities.
 */
export async function authorizeDelegatedAction(
  context: DelegationAuthorizationContext,
): Promise<DelegationAuthorizationResult> {
  if (nonDelegableCapabilities.has(context.capability)) {
    return denied("DELEGATION_ACTION_NONDELEGABLE");
  }

  const grants = await prisma.delegate.findMany({
    where: {
      delegateUserId: context.actorUserId,
      subjectUserId: context.subjectUserId,
      status: "ACTIVE",
      requiresReview: false,
      capabilities: { some: { capability: context.capability } },
    },
    include: { capabilities: true },
    orderBy: { updatedAt: "desc" },
  });
  if (grants.length === 0) return denied("DELEGATION_NOT_FOUND");

  const now = new Date();
  for (const grant of grants) {
    if (grant.status === "SUSPENDED") return denied("DELEGATION_SUSPENDED");
    if (grant.status === "REVOKED") return denied("DELEGATION_REVOKED");
    if (grant.requiresReview) return denied("DELEGATION_REQUIRES_REVIEW");
    if (!grantIsWithinEffectivePeriod(grant, now)) return denied("DELEGATION_EXPIRED");
    if (!scopeMatches(grant, context)) continue;

    if (context.evaluationId) {
      const evaluation = await prisma.evaluation.findUnique({
        where: { id: context.evaluationId },
        select: { disposition: true, status: true },
      });
      if (!evaluation || evaluation.disposition !== "ACTIVE" || ["COMPLETE", "SUBMITTED", "ACCEPTED", "RETURNED"].includes(evaluation.status)) {
        return denied("DELEGATION_RESOURCE_LOCKED");
      }
    }
    if (context.supportFormId) {
      const form = await prisma.supportForm.findUnique({
        where: { id: context.supportFormId },
        select: { soldierId: true, status: true, disposition: true },
      });
      if (!form || form.soldierId !== context.subjectUserId) return denied("DELEGATION_SUBJECT_MISMATCH");
      if (form.disposition !== "ACTIVE" || ["CONSUMED", "ARCHIVED", "QUARANTINED"].includes(form.status)) {
        return denied("DELEGATION_RESOURCE_LOCKED");
      }
    }

    return { allowed: true, grant };
  }

  return denied("DELEGATION_SCOPE_MISMATCH");
}

export function delegationAuditMetadata(
  grant: Delegate,
  capability: DelegationCapability,
  subjectUserId: string,
) {
  return {
    subjectUserId,
    delegationGrantId: grant.id,
    delegationCapability: capability,
  };
}

export function isGrantActive(status: DelegationStatus): boolean {
  return status === "ACTIVE";
}
