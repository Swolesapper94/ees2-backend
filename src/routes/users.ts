import { Router } from "express";
import { z } from "zod";
import { Rank, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { asyncHandler, HttpError } from "@/middleware/error";
import { requireAuth, requireRole } from "@/middleware/auth";
import { isProd } from "@/config/env";

export const usersRouter = Router();

const createUserSchema = z.object({
  supabaseId: z.string().min(1),
  email: z.string().email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  rank: z.nativeEnum(Rank),
  mos: z.string().min(1),
  roles: z.array(z.nativeEnum(UserRole)).min(1).default(["SOLDIER"]),
  unitId: z.string().nullable().optional(),
  dodid: z.string().nullable().optional(),
});

const updateUserSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  rank: z.nativeEnum(Rank).optional(),
  mos: z.string().min(1).optional(),
  roles: z.array(z.nativeEnum(UserRole)).min(1).optional(),
  unitId: z.string().nullable().optional(),
  dodid: z.string().nullable().optional(),
  profilePictureUrl: z.string().url().nullable().optional(),
});

// GET /api/users — list (admin)
usersRouter.get(
  "/",
  requireAuth,
  requireRole("ADMIN"),
  asyncHandler(async (_req, res) => {
    if (isProd) throw new HttpError(410, "Use /api/admin/identity-access/records for production identity access administration.");
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
    const identitySourceRecord = await prisma.identitySourceRecord.findUnique({ where: { userId: req.user.id } });
    res.json({ ...req.user, unit, identitySourceRecord });
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
    if (isProd) throw new HttpError(403, "Production administrators cannot manually create personnel records.");
    const body = createUserSchema.parse(req.body);
    const user = await prisma.user.create({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: body as any,
    });
    res.status(201).json(user);
  }),
);

// PATCH /api/users/:id — editable account attributes only (admin)
// Email and Supabase identity are intentionally immutable here because they
// anchor authentication and cross-system identity.
usersRouter.patch(
  "/:id",
  requireAuth,
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    if (isProd) throw new HttpError(403, "Production administrators cannot edit authoritative identity fields.");
    const body = updateUserSchema.parse(req.body);
    const updated = await prisma.user.update({
      where: { id: req.params.id },
      data: body,
      include: { unit: true },
    });
    res.json(updated);
  }),
);
