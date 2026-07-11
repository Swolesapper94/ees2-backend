import { Router } from "express";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { asyncHandler } from "@/middleware/error";
import { requireAuth, requireRole } from "@/middleware/auth";

export const usersRouter = Router();

const createUserSchema = z.object({
  supabaseId: z.string().min(1),
  email: z.string().email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  rank: z.string().min(1),
  mos: z.string().min(1),
  roles: z.array(z.string()).default(["SOLDIER"]),
  unitId: z.string().optional(),
  dodid: z.string().optional(),
});

// GET /api/users — list (admin)
usersRouter.get(
  "/",
  requireAuth,
  requireRole("ADMIN"),
  asyncHandler(async (_req, res) => {
    const users = await prisma.user.findMany({
      include: { unit: true },
      orderBy: { lastName: "asc" },
    });
    res.json(users);
  }),
);

// GET /api/users/me — current user profile
usersRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.user) {
      res.status(404).json({ error: "User record not found" });
      return;
    }
    const unit = req.user.unitId
      ? await prisma.unit.findUnique({ where: { id: req.user.unitId } })
      : null;
    res.json({ ...req.user, unit });
  }),
);

const updateMeSchema = z.object({
  profilePictureUrl: z.string().url().nullable().optional(),
  notificationPreferences: z.record(z.boolean()).optional(),
});

// PATCH /api/users/me — self-service profile & notification-preference updates
usersRouter.patch(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    const body = updateMeSchema.parse(req.body);
    const data: { profilePictureUrl?: string | null; notificationPreferences?: object } = {};

    if (body.profilePictureUrl !== undefined) {
      data.profilePictureUrl = body.profilePictureUrl;
    }
    if (body.notificationPreferences !== undefined) {
      const existing =
        (req.user.notificationPreferences as Record<string, boolean> | null) ?? {};
      data.notificationPreferences = { ...existing, ...body.notificationPreferences };
    }

    const updated = await prisma.user.update({ where: { id: req.user.id }, data });
    res.json(updated);
  }),
);

// POST /api/users — create (admin)
usersRouter.post(
  "/",
  requireAuth,
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const body = createUserSchema.parse(req.body);
    const user = await prisma.user.create({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: body as any,
    });
    res.status(201).json(user);
  }),
);
