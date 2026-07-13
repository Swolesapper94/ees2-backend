import {
  DelegationCapability,
  DelegationStatus,
  DelegationType,
  PrismaClient,
} from "@prisma/client";

const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");

type Report = {
  total: number;
  migrated: number;
  suspended: number;
  expired: number;
  invalid: number;
  duplicate: number;
  missingUsers: number;
  missingScope: number;
};

const safePersonalCapabilities: DelegationCapability[] = [
  "VIEW_WORKFLOW_STATUS",
  "VIEW_SUPPORT_FORM",
  "ADD_DRAFT_SUPPORT_ENTRY",
  "EDIT_OWN_DRAFT_SUPPORT_ENTRY",
  "UPLOAD_ARTIFACT",
  "ORGANIZE_ARTIFACT",
  "REQUEST_SOLDIER_REVIEW",
  "SEND_WORKFLOW_REMINDER",
];

async function main() {
  const delegates = await prisma.delegate.findMany({
    include: { principal: true, delegateUser: true, capabilities: true },
    orderBy: { createdAt: "asc" },
  });
  const report: Report = { total: delegates.length, migrated: 0, suspended: 0, expired: 0, invalid: 0, duplicate: 0, missingUsers: 0, missingScope: 0 };
  const rows: Array<Record<string, unknown>> = [];

  for (const legacy of delegates) {
    if (legacy.delegationType || legacy.status !== "PENDING" || legacy.capabilities.length > 0) {
      report.duplicate++;
      rows.push({ id: legacy.id, outcome: "ALREADY_MIGRATED", status: legacy.status });
      continue;
    }

    const now = new Date();
    const expired = Boolean(legacy.expiryDate && legacy.expiryDate <= now);
    const validPeople = legacy.principalId !== legacy.delegateUserId && Boolean(legacy.principal) && Boolean(legacy.delegateUser);
    if (!validPeople) report.missingUsers++;

    const activeChain = validPeople
      ? await prisma.ratingChain.findFirst({
          where: { ratedSoldierId: legacy.principalId, isActive: true },
          orderBy: { effectiveDate: "desc" },
        })
      : null;
    const supportForm = activeChain
      ? await prisma.supportForm.findFirst({
          where: { ratingChainId: activeChain.id, disposition: "ACTIVE", isActive: true },
          orderBy: { createdAt: "desc" },
        })
      : null;

    let status: DelegationStatus = "SUSPENDED";
    let type: DelegationType | null = null;
    let capabilities: DelegationCapability[] = [];
    let requiresReview = true;
    let outcome = "SUSPENDED_REQUIRES_REVIEW";

    if (expired) {
      status = "EXPIRED";
      report.expired++;
      outcome = "EXPIRED";
    } else if (validPeople && supportForm && legacy.principalId === supportForm.soldierId) {
      type = "PERSONAL_ASSISTANT";
      capabilities = legacy.accessLevel === "PUSH_ALONG"
        ? safePersonalCapabilities
        : ["VIEW_WORKFLOW_STATUS", "VIEW_SUPPORT_FORM"];
      status = legacy.isActive ? "ACTIVE" : "REVOKED";
      requiresReview = false;
      report.migrated++;
      outcome = "MIGRATED_PERSONAL_ASSISTANT";
    } else {
      report.suspended++;
      if (!activeChain && !expired) report.missingScope++;
      if (!validPeople) report.invalid++;
    }

    rows.push({ id: legacy.id, outcome, status, supportFormId: supportForm?.id ?? null, capabilities });
    if (!apply) continue;

    await prisma.$transaction(async (transaction) => {
      await transaction.delegate.update({
        where: { id: legacy.id },
        data: {
          grantorUserId: legacy.principalId,
          subjectUserId: legacy.principalId,
          delegationType: type,
          status,
          effectiveFrom: legacy.effectiveDate,
          effectiveTo: legacy.expiryDate ?? (activeChain?.endDate ?? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)),
          supportFormId: supportForm?.id ?? null,
          ratingAssignmentId: supportForm?.ratingSchemeAssignmentId ?? null,
          justification: legacy.appointedReason,
          requiresReview,
          createdByUserId: legacy.principalId,
          revokedAt: status === "REVOKED" ? now : null,
        },
      });
      if (capabilities.length > 0) {
        await transaction.delegationCapabilityGrant.createMany({
          data: capabilities.map((capability) => ({ delegationGrantId: legacy.id, capability })),
          skipDuplicates: true,
        });
      }
      await transaction.auditLog.create({
        data: {
          actorId: legacy.principalId,
          subjectUserId: legacy.principalId,
          delegationGrantId: legacy.id,
          action: "LEGACY_DELEGATE_MIGRATED",
          entityType: "Delegate",
          entityId: legacy.id,
          metadata: { outcome, legacyAccessLevel: legacy.accessLevel, capabilities, requiresReview },
        },
      });
    });
  }

  console.table(rows);
  console.log(report);
  if (!apply) console.log("Dry run only. Re-run with --apply after reviewing the report.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
