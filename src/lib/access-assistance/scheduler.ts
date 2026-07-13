import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notifications/create";

const EXPIRING_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Keeps grant lifecycle state and notifications aligned with effective dates.
 * Authorization independently checks the effective window, so this sweep is
 * operational visibility rather than the only expiry safeguard.
 */
export async function runAccessGrantLifecycleSweep(): Promise<{ expired: number; expiringNotified: number }> {
  const now = new Date();
  const expiringBy = new Date(now.getTime() + EXPIRING_WINDOW_MS);
  const expiredGrants = await prisma.delegate.findMany({
    where: {
      status: { in: ["PENDING", "ACTIVE"] },
      effectiveTo: { lte: now },
    },
  });

  let expired = 0;
  for (const grant of expiredGrants) {
    await prisma.$transaction(async (transaction) => {
      await transaction.delegate.update({
        where: { id: grant.id },
        data: { status: "EXPIRED", isActive: false },
      });
      await transaction.auditLog.create({
        data: {
          actorId: grant.grantorUserId ?? grant.createdByUserId ?? grant.delegateUserId,
          subjectUserId: grant.subjectUserId,
          delegationGrantId: grant.id,
          action: "ACCESS_GRANT_EXPIRED",
          entityType: "DelegationGrant",
          entityId: grant.id,
          metadata: { effectiveTo: grant.effectiveTo?.toISOString() ?? null, automated: true },
        },
      });
    });
    await notify({
      userId: grant.delegateUserId,
      category: "DELEGATE",
      title: "Access and Assistance Expired",
      message: "Your scoped assistance access has expired and can no longer be used.",
      actionUrl: "/access-assistance?view=i-assist",
      actionLabel: "View access grants",
      evaluationId: grant.evaluationId ?? undefined,
    });
    if (grant.grantorUserId && grant.grantorUserId !== grant.delegateUserId) {
      await notify({
        userId: grant.grantorUserId,
        category: "DELEGATE",
        title: "Access and Assistance Expired",
        message: "A scoped assistance grant you created has expired.",
        actionUrl: "/access-assistance?view=helping-me",
        actionLabel: "View access grants",
        evaluationId: grant.evaluationId ?? undefined,
      });
    }
    expired++;
  }

  const expiringGrants = await prisma.delegate.findMany({
    where: {
      status: { in: ["PENDING", "ACTIVE"] },
      effectiveTo: { gt: now, lte: expiringBy },
    },
  });

  let expiringNotified = 0;
  for (const grant of expiringGrants) {
    const alreadyNotified = await prisma.auditLog.findFirst({
      where: { delegationGrantId: grant.id, action: "ACCESS_GRANT_EXPIRING_NOTICE_SENT" },
      select: { id: true },
    });
    if (alreadyNotified) continue;

    await notify({
      userId: grant.delegateUserId,
      category: "DELEGATE",
      title: "Access and Assistance Expiring Soon",
      message: "Your scoped assistance access expires within seven days.",
      actionUrl: "/access-assistance?view=i-assist",
      actionLabel: "View access grants",
      evaluationId: grant.evaluationId ?? undefined,
    });
    if (grant.grantorUserId && grant.grantorUserId !== grant.delegateUserId) {
      await notify({
        userId: grant.grantorUserId,
        category: "DELEGATE",
        title: "Access and Assistance Expiring Soon",
        message: "A scoped assistance grant you created expires within seven days.",
        actionUrl: "/access-assistance?view=helping-me",
        actionLabel: "View access grants",
        evaluationId: grant.evaluationId ?? undefined,
      });
    }
    await prisma.auditLog.create({
      data: {
        actorId: grant.grantorUserId ?? grant.createdByUserId ?? grant.delegateUserId,
        subjectUserId: grant.subjectUserId,
        delegationGrantId: grant.id,
        action: "ACCESS_GRANT_EXPIRING_NOTICE_SENT",
        entityType: "DelegationGrant",
        entityId: grant.id,
        metadata: { effectiveTo: grant.effectiveTo?.toISOString() ?? null, automated: true },
      },
    });
    expiringNotified++;
  }

  return { expired, expiringNotified };
}
