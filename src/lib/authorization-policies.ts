import { DelegationCapability, type Evaluation, type RatingChain, type SupportForm, type SupportFormEntry, type User } from "@prisma/client";
import { authorizeDelegatedAction } from "@/lib/access-assistance/authorization";

type AssignmentLike = Pick<RatingChain, "ratedSoldierId" | "raterId" | "seniorRaterId" | "reviewerId">;

function isAdmin(actor: Pick<User, "roles">): boolean {
  return actor.roles.includes("ADMIN");
}

function isChainMember(actor: Pick<User, "id" | "roles">, assignment: AssignmentLike): boolean {
  return isAdmin(actor) || [
    assignment.ratedSoldierId,
    assignment.raterId,
    assignment.seniorRaterId,
    assignment.reviewerId,
  ].includes(actor.id);
}

export function canViewSupportForm(
  actor: Pick<User, "id" | "roles">,
  supportForm: Pick<SupportForm, "soldierId">,
  assignment: AssignmentLike | null,
): boolean {
  return isAdmin(actor) || supportForm.soldierId === actor.id || Boolean(assignment && isChainMember(actor, assignment));
}

export async function authorizeSupportFormView(
  actor: Pick<User, "id" | "roles">,
  supportForm: Pick<SupportForm, "id" | "soldierId" | "ratingSchemeAssignmentId">,
  assignment: AssignmentLike | null,
) {
  if (canViewSupportForm(actor, supportForm, assignment)) return { allowed: true as const, source: "DIRECT" as const };
  const delegated = await authorizeDelegatedAction({
    actorUserId: actor.id,
    subjectUserId: supportForm.soldierId,
    capability: DelegationCapability.VIEW_SUPPORT_FORM,
    supportFormId: supportForm.id,
    ratingAssignmentId: supportForm.ratingSchemeAssignmentId ?? undefined,
  });
  return { ...delegated, source: "DELEGATION" as const };
}

export function canEditSupportFormField(
  actor: Pick<User, "id" | "roles">,
  supportForm: Pick<SupportForm, "soldierId" | "status" | "disposition">,
  field: string,
  assignment: AssignmentLike | null,
): boolean {
  if (isAdmin(actor)) return true;
  if (supportForm.soldierId !== actor.id) return false;
  return ["soldierGoals", "completedAt", "finalizedAt", "status"].includes(field) && Boolean(assignment);
}

export function canCreateSupportFormEntry(
  actor: Pick<User, "id" | "roles">,
  supportForm: Pick<SupportForm, "soldierId" | "status" | "disposition">,
  entryType: string,
  assignment: AssignmentLike | null,
): boolean {
  if (supportForm.status === "CONSUMED" || supportForm.status === "ARCHIVED" || supportForm.disposition !== "ACTIVE") return false;
  if (isAdmin(actor)) return true;
  if (actor.id === supportForm.soldierId) return true;
  return Boolean(assignment && actor.id === assignment.raterId && entryType === "OBJECTIVE");
}

export async function authorizeSupportFormEntryCreate(
  actor: Pick<User, "id" | "roles">,
  supportForm: Pick<SupportForm, "id" | "soldierId" | "status" | "disposition" | "ratingSchemeAssignmentId">,
  entryType: string,
  assignment: AssignmentLike | null,
) {
  if (canCreateSupportFormEntry(actor, supportForm, entryType, assignment)) return { allowed: true as const, source: "DIRECT" as const };
  const delegated = await authorizeDelegatedAction({
    actorUserId: actor.id,
    subjectUserId: supportForm.soldierId,
    capability: DelegationCapability.ADD_DRAFT_SUPPORT_ENTRY,
    supportFormId: supportForm.id,
    ratingAssignmentId: supportForm.ratingSchemeAssignmentId ?? undefined,
  });
  return { ...delegated, source: "DELEGATION" as const };
}

export function canConfirmSupportFormEntry(
  actor: Pick<User, "id" | "roles">,
  _entry: Pick<SupportFormEntry, "id">,
  assignment: AssignmentLike | null,
): boolean {
  return isAdmin(actor) || Boolean(assignment && (actor.id === assignment.raterId || actor.id === assignment.seniorRaterId));
}

export function canViewEvaluation(
  actor: Pick<User, "id" | "roles">,
  _evaluation: Pick<Evaluation, "id" | "disposition">,
  assignment: AssignmentLike,
): boolean {
  return isChainMember(actor, assignment);
}

export async function authorizeEvaluationView(
  actor: Pick<User, "id" | "roles">,
  evaluation: Pick<Evaluation, "id" | "disposition">,
  assignment: AssignmentLike,
) {
  if (canViewEvaluation(actor, evaluation, assignment)) return { allowed: true as const, source: "DIRECT" as const };
  const delegated = await authorizeDelegatedAction({
    actorUserId: actor.id,
    subjectUserId: assignment.ratedSoldierId,
    capability: DelegationCapability.VIEW_PERMITTED_EVALUATION_DATA,
    evaluationId: evaluation.id,
  });
  return { ...delegated, source: "DELEGATION" as const };
}

export function canEditEvaluationSection(
  actor: Pick<User, "id" | "roles">,
  section: string,
  assignment: AssignmentLike,
): boolean {
  if (isAdmin(actor)) return false;
  if (section === "SENIOR_RATER_OVERALL") return actor.id === assignment.seniorRaterId;
  if (section === "SOLDIER_COMMENTS") return actor.id === assignment.ratedSoldierId;
  return actor.id === assignment.raterId;
}

export function canSignEvaluationAs(
  actor: Pick<User, "id" | "roles">,
  signatureRole: string,
  assignment: AssignmentLike,
): boolean {
  if (isAdmin(actor)) return false;
  const assignedUserId = {
    RATER: assignment.raterId,
    SENIOR_RATER: assignment.seniorRaterId,
    REVIEWER: assignment.reviewerId,
    SOLDIER: assignment.ratedSoldierId,
  }[signatureRole];
  return assignedUserId === actor.id;
}

export function canViewFormation(actor: Pick<User, "roles">, actorUnitId: string | null, targetUnitId: string | null): boolean {
  return isAdmin(actor) || (actor.roles.includes("COMMANDER") && actorUnitId !== null && actorUnitId === targetUnitId);
}