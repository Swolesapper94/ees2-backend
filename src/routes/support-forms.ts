import { Router } from "express";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { asyncHandler } from "@/middleware/error";
import { requireAuth } from "@/middleware/auth";

export const supportFormsRouter = Router();

const createFormSchema = z.object({
  soldierId: z.string().min(1),
  ratingPeriodStart: z.coerce.date(),
  ratingPeriodEnd: z.coerce.date().optional(),
  dutyTitle: z.string().min(1),
  dutyMosc: z.string().min(1),
  dailyDutiesScope: z.string().optional(),
  areasOfEmphasis: z.string().optional(),
  appointedDuties: z.string().optional(),
  soldierGoals: z.string().optional(),
});

const createEntrySchema = z.object({
  section: z.string().min(1),
  entryType: z.enum(["OBJECTIVE", "ACCOMPLISHMENT"]),
  rawText: z.string().min(1),
  tags: z.array(z.string()).default([]),
  isHighlight: z.boolean().default(false),
  entryDate: z.coerce.date().optional(),
});

// GET /api/support-forms?soldierId=...
supportFormsRouter.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const soldierId =
      typeof req.query.soldierId === "string" ? req.query.soldierId : undefined;
    const forms = await prisma.supportForm.findMany({
      where: soldierId ? { soldierId } : undefined,
      include: { entries: { orderBy: { entryDate: "desc" } } },
      orderBy: { createdAt: "desc" },
    });
    res.json(forms);
  }),
);

// POST /api/support-forms
supportFormsRouter.post(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = createFormSchema.parse(req.body);
    const form = await prisma.supportForm.create({ data: body });
    res.status(201).json(form);
  }),
);

// GET /api/support-forms/:id
supportFormsRouter.get(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const form = await prisma.supportForm.findUnique({
      where: { id: req.params.id },
      include: { entries: { orderBy: { entryDate: "desc" } }, soldier: true },
    });
    if (!form) {
      res.status(404).json({ error: "Support form not found" });
      return;
    }
    res.json(form);
  }),
);

// POST /api/support-forms/:id/entries
supportFormsRouter.post(
  "/:id/entries",
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = createEntrySchema.parse(req.body);
    const entry = await prisma.supportFormEntry.create({
      data: {
        supportFormId: req.params.id!,
        section: body.section as never,
        entryType: body.entryType as never,
        rawText: body.rawText,
        tags: body.tags,
        isHighlight: body.isHighlight,
        ...(body.entryDate ? { entryDate: body.entryDate } : {}),
      },
    });
    res.status(201).json(entry);
  }),
);
