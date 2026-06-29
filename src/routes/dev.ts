import { Router } from "express";
import { asyncHandler, HttpError } from "@/middleware/error";
import { requireAuth } from "@/middleware/auth";
import { Notifications } from "@/lib/notifications/create";
import { env } from "@/config/env";

export const devRouter = Router();

// Development-only endpoints — never available in production
if (env.nodeEnv !== "production") {
  // GET /api/dev/seed-notifications
  // Seeds the current user with one of each notification type for testing
  devRouter.get(
    "/seed-notifications",
    requireAuth,
    asyncHandler(async (req, res) => {
      if (!req.user) throw new HttpError(401, "Not authenticated");

      const userId = req.user.id;
      const evalId = "eval-demo-001"; // Mock eval ID for linking
      const soldierName = "SGT Davis, John";

      // Create one of each type
      await Promise.all([
        // EVAL_LIFECYCLE
        Notifications.evalPendingSR(userId, evalId, soldierName),
        Notifications.evalPendingSoldierAck(userId, evalId),
        Notifications.evalComplete(userId, evalId, soldierName),
        Notifications.evalReturned(
          userId,
          evalId,
          soldierName,
          "Missing Part IV comments — please revise ACHIEVES section",
        ),

        // MILESTONE
        Notifications.milestoneOverdue(
          userId,
          evalId,
          soldierName,
          "QUARTERLY_COUNSELING_1",
          3,
        ),

        // COLLABORATION
        Notifications.newComment(
          userId,
          evalId,
          "SFC Williams, Robert",
          "INTELLECT",
        ),
        Notifications.reviewRequested(
          userId,
          evalId,
          "SSG Johnson, Marcus",
          soldierName,
        ),

        // DELEGATE
        Notifications.delegateAppointed(
          userId,
          "CPT Smith, Peter J.",
          "PUSH_ALONG",
        ),
      ]);

      res.json({
        success: true,
        message: "Seeded 8 test notifications (one of each type)",
      });
    }),
  );

  // POST /api/dev/clear-notifications
  // Clear all notifications for the current user (for testing)
  devRouter.post(
    "/clear-notifications",
    requireAuth,
    asyncHandler(async (req, res) => {
      if (!req.user) throw new HttpError(401, "Not authenticated");

      const { prisma } = await import("@/lib/prisma");
      await prisma.notification.updateMany({
        where: { userId: req.user.id },
        data: { isDismissed: true },
      });

      res.json({ success: true, message: "Cleared all notifications" });
    }),
  );
} else {
  // Production: block access to dev endpoints
  devRouter.use((_req, _res, next) => {
    next(new HttpError(403, "Dev endpoints not available in production"));
  });
}
