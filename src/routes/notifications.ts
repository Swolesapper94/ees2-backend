import { Router } from "express";
import { prisma } from "@/lib/prisma";
import { asyncHandler, HttpError } from "@/middleware/error";
import { requireAuth } from "@/middleware/auth";
import { z } from "zod";

export const notificationsRouter = Router();

// GET /api/notifications — fetch active (non-dismissed) notifications for the current user
notificationsRouter.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.user) throw new HttpError(401, "Not authenticated");

    const notifications = await prisma.notification.findMany({
      where: { userId: req.user.id, isDismissed: false },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    const unreadCount = notifications.filter((n) => !n.readAt).length;
    res.json({ notifications, unreadCount });
  }),
);

// PATCH /api/notifications — mark all as read
notificationsRouter.patch(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.user) throw new HttpError(401, "Not authenticated");
    await prisma.notification.updateMany({
      where: { userId: req.user.id, readAt: null, isDismissed: false },
      data: { readAt: new Date() },
    });
    res.json({ success: true });
  }),
);

// DELETE /api/notifications — clear all (dismiss all) for current user
notificationsRouter.delete(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.user) throw new HttpError(401, "Not authenticated");
    await prisma.notification.updateMany({
      where: { userId: req.user.id, isDismissed: false },
      data: { isDismissed: true, readAt: new Date() },
    });
    res.json({ success: true });
  }),
);

const patchSchema = z.object({
  action: z.enum(["read", "dismiss"]),
});

// PATCH /api/notifications/:id — mark single notification read or dismissed
notificationsRouter.patch(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.user) throw new HttpError(401, "Not authenticated");
    const { action } = patchSchema.parse(req.body);

    const notification = await prisma.notification.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!notification) throw new HttpError(404, "Notification not found");

    const updated = await prisma.notification.update({
      where: { id: req.params.id },
      data:
        action === "dismiss"
          ? { isDismissed: true, readAt: notification.readAt ?? new Date() }
          : { readAt: new Date() },
    });

    res.json(updated);
  }),
);
