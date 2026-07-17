import { addDays, startOfDay } from "date-fns";
import { Notifications } from "@/lib/notifications/create";
import { env } from "@/config/env";
import { prisma } from "@/lib/prisma";

export async function runGoalTargetReminderSweep(): Promise<{ scanned: number; notified: number }> {
  const today = startOfDay(new Date());
  const deadline = addDays(today, env.goalReminderDays);
  const candidates = await prisma.goal.findMany({
    where: {
      targetDate: { gte: today, lte: deadline },
      raterAssessment: null,
      supportForm: { disposition: "ACTIVE", status: { notIn: ["ARCHIVED", "QUARANTINED"] } },
    },
    include: { supportForm: { include: { ratingChain: true, soldier: true } } },
  });
  let notified = 0;
  for (const goal of candidates) {
    const raterId = goal.supportForm.ratingChain?.raterId;
    if (!raterId || !goal.targetDate) continue;
    const recent = await prisma.auditLog.findFirst({
      where: { entityType: "Goal", entityId: goal.id, action: "GOAL_TARGET_REMINDER_SENT", createdAt: { gte: addDays(today, -1) } },
      select: { id: true },
    });
    if (recent) continue;
    await Notifications.goalTargetApproaching(raterId, goal.supportForm.id, goal.id, goal.title, goal.targetDate);
    await prisma.auditLog.create({ data: { actorId: raterId, action: "GOAL_TARGET_REMINDER_SENT", entityType: "Goal", entityId: goal.id, metadata: { targetDate: goal.targetDate } } });
    notified++;
  }
  return { scanned: candidates.length, notified };
}