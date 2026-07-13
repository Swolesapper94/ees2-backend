import { DelegationCapability, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const personalCapabilities: DelegationCapability[] = [
  "VIEW_WORKFLOW_STATUS",
  "VIEW_SUPPORT_FORM",
  "ADD_DRAFT_SUPPORT_ENTRY",
  "EDIT_OWN_DRAFT_SUPPORT_ENTRY",
  "UPLOAD_ARTIFACT",
  "ORGANIZE_ARTIFACT",
  "REQUEST_SOLDIER_REVIEW",
  "SEND_WORKFLOW_REMINDER",
];

async function upsertGrant(input: {
  id: string;
  grantorId: string;
  delegateId: string;
  subjectId: string;
  status: "PENDING" | "ACTIVE" | "EXPIRED" | "REVOKED" | "SUSPENDED";
  type: "PERSONAL_ASSISTANT" | "RATING_OFFICIAL_ASSISTANT" | "SERVICING_ADMIN_ASSIGNMENT";
  supportFormId?: string;
  evaluationId?: string;
  capabilities: DelegationCapability[];
  requiresReview?: boolean;
}) {
  const now = new Date();
  const effectiveFrom = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const effectiveTo = input.status === "EXPIRED"
    ? new Date(now.getTime() - 60 * 60 * 1000)
    : new Date(now.getTime() + 21 * 24 * 60 * 60 * 1000);
  const existingGrant = await prisma.delegate.findUnique({ where: { id: input.id } });
  const grantData = {
      grantorUserId: input.grantorId,
      subjectUserId: input.subjectId,
      delegationType: input.type,
      status: input.status,
      effectiveFrom,
      effectiveTo,
      supportFormId: input.supportFormId ?? null,
      evaluationId: input.evaluationId ?? null,
      requiresReview: input.requiresReview ?? false,
      isActive: input.status === "ACTIVE",
      acceptedAt: input.status === "ACTIVE" ? now : null,
      revokedAt: input.status === "REVOKED" ? now : null,
      revokedByUserId: input.status === "REVOKED" ? input.grantorId : null,
      appointedReason: "Access and Assistance demonstration fixture",
      justification: "Access and Assistance demonstration fixture",
      createdByUserId: input.grantorId,
  };
  const grant = existingGrant
    ? await prisma.delegate.update({ where: { id: input.id }, data: grantData })
    : await prisma.delegate.create({
      data: {
        id: input.id,
      principalId: input.grantorId,
      delegateUserId: input.delegateId,
      accessLevel: "VIEW_ONLY",
      effectiveDate: effectiveFrom,
      expiryDate: effectiveTo,
      appointedReason: "Access and Assistance demonstration fixture",
        ...grantData,
      },
    });
  await prisma.delegationCapabilityGrant.deleteMany({ where: { delegationGrantId: grant.id } });
  if (input.capabilities.length) {
    await prisma.delegationCapabilityGrant.createMany({
      data: input.capabilities.map((capability) => ({ delegationGrantId: grant.id, capability })),
    });
  }
  return grant;
}

async function main() {
  const unit = await prisma.unit.findUniqueOrThrow({ where: { uic: "DEV-505" } });
  const [davis, torres, johnson, smith, quinn] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { email: "james.davis@army.mil" } }),
    prisma.user.findUniqueOrThrow({ where: { email: "maria.torres@army.mil" } }),
    prisma.user.findUniqueOrThrow({ where: { email: "marcus.johnson@army.mil" } }),
    prisma.user.findUniqueOrThrow({ where: { email: "peter.smith@army.mil" } }),
    prisma.user.findUniqueOrThrow({ where: { email: "avery.quinn@army.mil" } }),
  ]);
  const assistant = await prisma.user.upsert({
    where: { email: "alex.rivera@army.mil" },
    update: { category: "NCO", roles: ["SOLDIER"], unitId: unit.id },
    create: {
      id: "dev-assistant-rivera",
      supabaseId: "dev-assistant-rivera",
      email: "alex.rivera@army.mil",
      firstName: "Alex",
      lastName: "Rivera",
      rank: "SGT",
      category: "NCO",
      mos: "42A",
      roles: ["SOLDIER"],
      unitId: unit.id,
    },
  });
  const administrativeAssistant = await prisma.user.upsert({
    where: { email: "taylor.morgan@army.mil" },
    update: { category: "NCO", roles: ["SOLDIER"], unitId: unit.id },
    create: {
      id: "dev-assistant-morgan",
      supabaseId: "dev-assistant-morgan",
      email: "taylor.morgan@army.mil",
      firstName: "Taylor",
      lastName: "Morgan",
      rank: "SFC",
      category: "NCO",
      mos: "42A",
      roles: ["SOLDIER"],
      unitId: unit.id,
    },
  });

  const [davisForm, torresForm, smithEvaluation] = await Promise.all([
    prisma.supportForm.findFirstOrThrow({ where: { soldierId: davis.id, isActive: true, disposition: "ACTIVE" }, orderBy: { createdAt: "desc" } }),
    prisma.supportForm.findFirstOrThrow({ where: { soldierId: torres.id, isActive: true, disposition: "ACTIVE" }, orderBy: { createdAt: "desc" } }),
    prisma.evaluation.findFirstOrThrow({ where: { ratingChain: { raterId: smith.id }, disposition: "ACTIVE", status: { in: ["DRAFT", "RATER_IN_PROGRESS", "PENDING_SENIOR_RATER"] } }, include: { ratingChain: true }, orderBy: { updatedAt: "desc" } }),
  ]);

  const grants = await Promise.all([
    upsertGrant({ id: "access-grant-davis-rivera", grantorId: davis.id, delegateId: assistant.id, subjectId: davis.id, status: "ACTIVE", type: "PERSONAL_ASSISTANT", supportFormId: davisForm.id, capabilities: personalCapabilities }),
    upsertGrant({ id: "access-grant-torres-rivera-pending", grantorId: torres.id, delegateId: assistant.id, subjectId: torres.id, status: "PENDING", type: "PERSONAL_ASSISTANT", supportFormId: torresForm.id, capabilities: ["VIEW_WORKFLOW_STATUS", "VIEW_SUPPORT_FORM"] }),
    upsertGrant({ id: "access-grant-johnson-rivera-expired", grantorId: johnson.id, delegateId: assistant.id, subjectId: johnson.id, status: "EXPIRED", type: "PERSONAL_ASSISTANT", capabilities: [] }),
    upsertGrant({ id: "access-grant-smith-rivera-revoked", grantorId: smith.id, delegateId: assistant.id, subjectId: smith.id, status: "REVOKED", type: "RATING_OFFICIAL_ASSISTANT", evaluationId: smithEvaluation.id, capabilities: [] }),
    upsertGrant({ id: "access-grant-smith-quinn", grantorId: smith.id, delegateId: quinn.id, subjectId: smithEvaluation.ratingChain.ratedSoldierId, status: "ACTIVE", type: "RATING_OFFICIAL_ASSISTANT", evaluationId: smithEvaluation.id, capabilities: ["VIEW_WORKFLOW_STATUS", "VIEW_ADMINISTRATIVE_DATA", "SEND_WORKFLOW_REMINDER", "ADD_NON_EVALUATIVE_COMMENT"] }),
    upsertGrant({ id: "access-grant-quinn-morgan", grantorId: quinn.id, delegateId: administrativeAssistant.id, subjectId: smithEvaluation.ratingChain.ratedSoldierId, status: "ACTIVE", type: "SERVICING_ADMIN_ASSIGNMENT", evaluationId: smithEvaluation.id, capabilities: ["VIEW_WORKFLOW_STATUS", "VIEW_ADMINISTRATIVE_DATA", "VIEW_PERMITTED_EVALUATION_DATA", "COMPLETE_ADMINISTRATIVE_FIELD", "RESPOND_TO_ADMIN_RETURN", "DOWNLOAD_WORKING_COPY"] }),
    upsertGrant({ id: "access-grant-johnson-quinn-suspended", grantorId: johnson.id, delegateId: quinn.id, subjectId: johnson.id, status: "SUSPENDED", type: "PERSONAL_ASSISTANT", capabilities: [], requiresReview: true }),
  ]);

  for (const grant of grants) {
    await prisma.auditLog.upsert({
      where: { id: `audit-${grant.id}` },
      update: {},
      create: {
        id: `audit-${grant.id}`,
        actorId: grant.grantorUserId ?? grant.principalId,
        subjectUserId: grant.subjectUserId,
        delegationGrantId: grant.id,
        action: "ACCESS_GRANT_FIXTURE_CREATED",
        entityType: "DelegationGrant",
        entityId: grant.id,
        metadata: { status: grant.status, delegationType: grant.delegationType },
      },
    });
  }

  console.log(`Access and Assistance fixtures ready: ${grants.length} grants, including active, pending, expired, revoked, and suspended states.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
