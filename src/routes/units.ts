import { Router } from "express";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { asyncHandler } from "@/middleware/error";
import { requireAuth, requireRole } from "@/middleware/auth";

export const unitsRouter = Router();

const createUnitSchema = z.object({
  name: z.string().min(1),
  uic: z.string().optional(),
  parentId: z.string().optional(),
});

unitsRouter.get(
  "/",
  requireAuth,
  asyncHandler(async (_req, res) => {
    const units = await prisma.unit.findMany({
      include: { children: true },
      orderBy: { name: "asc" },
    });
    res.json(units);
  }),
);

unitsRouter.post(
  "/",
  requireAuth,
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const body = createUnitSchema.parse(req.body);
    const unit = await prisma.unit.create({ data: body });
    res.status(201).json(unit);
  }),
);
