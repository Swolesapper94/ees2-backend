import { Router } from "express";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { asyncHandler, HttpError } from "@/middleware/error";
import { requireAuth } from "@/middleware/auth";
import { generateBullets } from "@/lib/ai/openai";
import {
  SYSTEM_PROMPT,
  PROMPT_VERSION,
  SECTION_DEFINITIONS,
  buildSectionPrompt,
  buildRefinePrompt,
} from "@/lib/ai/prompts";

export const aiRouter = Router();

const generateSchema = z.object({
  evaluationId: z.string().min(1),
  section: z.string().min(1),
  soldierRank: z.string().min(1),
  soldierMos: z.string().min(1),
  dutyTitle: z.string().min(1),
  raterResponses: z.record(z.string()),
  entryIds: z.array(z.string()).default([]),
});

const refineSchema = z.object({
  section: z.string().min(1),
  originalBullet: z.string().min(1),
  instruction: z.string().min(1),
});

// POST /api/ai/generate-bullets
aiRouter.post(
  "/generate-bullets",
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = generateSchema.parse(req.body);

    const definition = SECTION_DEFINITIONS[body.section];
    if (!definition) throw new HttpError(400, `Unknown section: ${body.section}`);

    const entries = body.entryIds.length
      ? await prisma.supportFormEntry.findMany({
          where: { id: { in: body.entryIds } },
        })
      : [];

    const userPrompt = buildSectionPrompt({
      soldierRank: body.soldierRank,
      soldierMos: body.soldierMos,
      dutyTitle: body.dutyTitle,
      section: body.section,
      sectionDefinition: definition,
      raterResponses: body.raterResponses,
      supportEntries: entries.map((e) => e.rawText),
    });

    const bullets = await generateBullets({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
    });

    // Persist the generation for the audit trail.
    await prisma.aiGeneration.create({
      data: {
        evaluationId: body.evaluationId,
        section: body.section as never,
        promptVersion: PROMPT_VERSION,
        raterResponses: body.raterResponses,
        entryIds: body.entryIds,
        outputBullets: bullets,
      },
    });

    res.json({ bullets, promptVersion: PROMPT_VERSION });
  }),
);

// POST /api/ai/refine-bullet
aiRouter.post(
  "/refine-bullet",
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = refineSchema.parse(req.body);
    const bullets = await generateBullets({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: buildRefinePrompt(body),
      maxTokens: 512,
    });
    res.json({ bullet: bullets[0] ?? body.originalBullet });
  }),
);
