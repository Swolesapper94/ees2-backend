import { Router } from "express";
import { z } from "zod";
import { asyncHandler, HttpError } from "@/middleware/error";
import { requireAuth } from "@/middleware/auth";
import { Notifications } from "@/lib/notifications/create";
import { env } from "@/config/env";
import { prisma } from "@/lib/prisma";
import { Rank, UserRole } from "@prisma/client";

export const devRouter = Router();

// Development-only endpoints — never available in production
if (env.nodeEnv !== "production") {
  const createPersonaSchema = z.object({
    supabaseId: z.string().min(1),
    email: z.string().email(),
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    rank: z.nativeEnum(Rank),
    mos: z.string().min(1),
    roles: z.array(z.nativeEnum(UserRole)).min(1).default(["SOLDIER"]),
    unitId: z.string().nullable().optional(),
  });

  devRouter.get("/personas", requireAuth, asyncHandler(async (_req, res) => {
    const personas = await prisma.user.findMany({ include: { unit: true, identitySourceRecord: true }, orderBy: { lastName: "asc" } });
    res.json({ personas, environment: env.nodeEnv });
  }));

  devRouter.post("/personas", requireAuth, asyncHandler(async (req, res) => {
    const body = createPersonaSchema.parse(req.body);
    const persona = await prisma.user.create({
      data: {
        ...body,
        applicationAccessStatus: "ACTIVE",
        accessReviewStatus: "CURRENT",
        identitySourceRecord: {
          create: {
            sourceSystem: "DEVELOPMENT_SEED",
            authoritativePersonId: body.supabaseId,
            authoritativeEmail: body.email,
            syncStatus: "CURRENT",
            lastSynchronizedAt: new Date(),
            sourcePayload: { mode: "development-persona" },
          },
        },
      },
      include: { unit: true, identitySourceRecord: true },
    });
    await prisma.auditLog.create({ data: { actorId: req.user!.id, subjectUserId: persona.id, action: "DEVELOPMENT_PERSONA_CREATED", entityType: "User", entityId: persona.id } });
    res.status(201).json(persona);
  }));

  devRouter.post("/personas/:id/reset", requireAuth, asyncHandler(async (req, res) => {
    const persona = await prisma.user.update({
      where: { id: req.params.id },
      data: { applicationAccessStatus: "ACTIVE", accessReviewStatus: "CURRENT", suspensionReason: null, suspendedAt: null, suspendedByUserId: null },
      include: { identitySourceRecord: true },
    });
    await prisma.identitySourceRecord.upsert({
      where: { userId: persona.id },
      update: { sourceSystem: "DEVELOPMENT_SEED", syncStatus: "CURRENT", lastSynchronizedAt: new Date(), syncError: null },
      create: { userId: persona.id, sourceSystem: "DEVELOPMENT_SEED", syncStatus: "CURRENT", authoritativePersonId: persona.supabaseId, authoritativeEmail: persona.email, lastSynchronizedAt: new Date() },
    });
    await prisma.auditLog.create({ data: { actorId: req.user!.id, subjectUserId: persona.id, action: "DEVELOPMENT_PERSONA_RESET", entityType: "User", entityId: persona.id } });
    res.json({ persona, reset: true });
  }));

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
