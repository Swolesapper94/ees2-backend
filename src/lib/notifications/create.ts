import { prisma } from "@/lib/prisma";
import type { NotificationCategory } from "@prisma/client";

export interface NotificationInput {
  userId: string;
  category: NotificationCategory;
  title: string;
  message: string;
  actionUrl?: string;
  actionLabel?: string;
  evaluationId?: string;
}

/** Create a notification for a single user. */
export async function notify(input: NotificationInput) {
  // If evaluationId is provided, verify it exists before creating the notification
  if (input.evaluationId) {
    const evalExists = await prisma.evaluation.findUnique({
      where: { id: input.evaluationId },
      select: { id: true },
    });
    if (!evalExists) {
      // Silently skip if the evaluation doesn't exist — don't crash the route
      return;
    }
  }

  // Respect the recipient's notification preferences (Settings page). A
  // missing key defaults to enabled, so users who've never touched Settings
  // keep getting every category.
  const recipient = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { notificationPreferences: true },
  });
  const prefs = (recipient?.notificationPreferences as Record<string, boolean> | null) ?? {};
  if (prefs[input.category] === false) {
    return;
  }

  return prisma.notification.create({ data: input }).catch(() => {
    // Never let notification creation crash a route
  });
}

/** Fan-out a system notification to every active user. */
export async function notifyAll(
  input: Omit<NotificationInput, "userId">,
) {
  const users = await prisma.user.findMany({
    select: { id: true, notificationPreferences: true },
  });
  const recipients = users.filter((u) => {
    const prefs = (u.notificationPreferences as Record<string, boolean> | null) ?? {};
    return prefs[input.category] !== false;
  });
  return prisma.notification
    .createMany({
      data: recipients.map((u) => ({ ...input, userId: u.id })),
      skipDuplicates: true,
    })
    .catch(() => {});
}

// ── Typed factory helpers ───────────────────────────────────────────────────

export const Notifications = {
  /** Rater section complete — notify Senior Rater it's their turn. */
  evalPendingSR(userId: string, evalId: string, soldierName: string) {
    return notify({
      userId,
      category: "EVAL_LIFECYCLE",
      title: "Evaluation Needs Your Review",
      message: `The rater has completed their sections for ${soldierName}'s evaluation. Your SR section is now open.`,
      actionUrl: `/evaluations/${evalId}`,
      actionLabel: "Open Evaluation",
      evaluationId: evalId,
    });
  },

  /** SR complete — notify rated soldier to acknowledge. */
  evalPendingSoldierAck(userId: string, evalId: string) {
    return notify({
      userId,
      category: "EVAL_LIFECYCLE",
      title: "Your Evaluation Is Ready to Sign",
      message:
        "Your rater and senior rater have completed your evaluation. Please review and acknowledge.",
      actionUrl: `/evaluations/${evalId}/sign`,
      actionLabel: "Review & Sign",
      evaluationId: evalId,
    });
  },

  /** Soldier acknowledged — notify supplementary reviewer (when applicable). */
  evalPendingSupplementaryReview(
    userId: string,
    evalId: string,
    soldierName: string,
  ) {
    return notify({
      userId,
      category: "EVAL_LIFECYCLE",
      title: "Supplementary Review Required",
      message: `${soldierName}'s evaluation requires your supplementary review signature (rater is a 1LT).`,
      actionUrl: `/evaluations/${evalId}/review`,
      actionLabel: "Review Evaluation",
      evaluationId: evalId,
    });
  },

  /** Evaluation signed by soldier — notify rater + SR it's complete. */
  evalComplete(userId: string, evalId: string, soldierName: string) {
    return notify({
      userId,
      category: "EVAL_LIFECYCLE",
      title: "Evaluation Complete",
      message: `${soldierName} has signed and acknowledged their evaluation. All signatures collected.`,
      actionUrl: `/evaluations/${evalId}`,
      actionLabel: "View Evaluation",
      evaluationId: evalId,
    });
  },

  /** Eval returned for correction. */
  evalReturned(userId: string, evalId: string, soldierName: string, reason?: string) {
    return notify({
      userId,
      category: "EVAL_LIFECYCLE",
      title: "Evaluation Returned for Correction",
      message: `The evaluation for ${soldierName} has been returned.${reason ? ` Reason: ${reason}` : ""} Please correct and re-submit.`,
      actionUrl: `/evaluations/${evalId}`,
      actionLabel: "View & Correct",
      evaluationId: evalId,
    });
  },

  /** Milestone is overdue. */
  milestoneOverdue(
    userId: string,
    evalId: string,
    soldierName: string,
    milestoneType: string,
    daysOverdue: number,
  ) {
    const label = milestoneType.replace(/_/g, " ").toLowerCase();
    return notify({
      userId,
      category: "MILESTONE",
      title: "Overdue Milestone",
      message: `${soldierName}'s ${label} is ${daysOverdue} day${daysOverdue !== 1 ? "s" : ""} overdue. AR 623-3 compliance at risk.`,
      actionUrl: `/evaluations/${evalId}`,
      actionLabel: "View Milestones",
      evaluationId: evalId,
    });
  },

  /** New comment posted on a section. */
  newComment(
    userId: string,
    evalId: string,
    authorName: string,
    sectionKey?: string | null,
  ) {
    const where = sectionKey ? `on the ${sectionKey} section` : "on the evaluation";
    return notify({
      userId,
      category: "COLLABORATION",
      title: "New Comment",
      message: `${authorName} left a comment ${where}.`,
      actionUrl: `/evaluations/${evalId}`,
      actionLabel: "View Comment",
      evaluationId: evalId,
    });
  },

  /** Informal review requested. */
  reviewRequested(
    userId: string,
    evalId: string,
    requesterName: string,
    soldierName: string,
  ) {
    return notify({
      userId,
      category: "COLLABORATION",
      title: "Informal Review Requested",
      message: `${requesterName} is requesting your feedback on ${soldierName}'s evaluation before formal routing.`,
      actionUrl: `/evaluations/${evalId}`,
      actionLabel: "Give Feedback",
      evaluationId: evalId,
    });
  },

  /** Delegate appointed. */
  delegateAppointed(
    userId: string,
    principalName: string,
    accessLevel: string,
  ) {
    return notify({
      userId,
      category: "DELEGATE",
      title: "Delegate Access Granted",
      message: `${principalName} has appointed you as a delegate with ${accessLevel === "PUSH_ALONG" ? "push-along" : "view-only"} access.`,
      actionUrl: "/dashboard",
      actionLabel: "View Dashboard",
    });
  },

  /** Delegate access revoked. */
  delegateRevoked(userId: string, principalName: string) {
    return notify({
      userId,
      category: "DELEGATE",
      title: "Delegate Access Revoked",
      message: `Your delegate access granted by ${principalName} has been removed.`,
    });
  },

  /** System-wide announcement (fan-out). */
  systemAnnouncement(title: string, message: string, actionUrl?: string) {
    return notifyAll({
      category: "SYSTEM",
      title,
      message,
      actionUrl,
      actionLabel: actionUrl ? "Learn More" : undefined,
    });
  },
} as const;
