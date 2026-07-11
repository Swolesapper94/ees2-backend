import { Router } from "express";
import { requireAuth } from "@/middleware/auth";
import { asyncHandler } from "@/middleware/error";
import { searchRegulations } from "@/lib/regulations/search";

export const regulationsRouter = Router();

// Search queries used to find the most relevant AR 623-3 / DA PAM 623-3
// passage for each NCOER Part IV attribute/competency. Mirrors the
// section definitions used for AI bullet generation grounding.
const SECTION_QUERY: Record<string, string> = {
  CHARACTER:
    "NCOER Character attribute Army Values Loyalty Duty Respect Selfless Service Honor Integrity Personal Courage Empathy Warrior Ethos discipline",
  PRESENCE:
    "NCOER Presence attribute military bearing professional bearing physical fitness confidence resilience",
  INTELLECT:
    "NCOER Intellect attribute mental agility sound judgment innovation interpersonal tact expertise",
  LEADS:
    "NCOER Leads competency leading others building trust extending influence leading by example communicating",
  DEVELOPS:
    "NCOER Develops competency creating a positive environment developing others stewardship of the profession",
  ACHIEVES: "NCOER Achieves competency getting results",
};

export interface RegulationCitation {
  docTitle: string;
  section: string;
  pageStart: number | null;
}

// GET /api/regulations/citation/:sectionKey
// Returns the best-matching regulation citation for a Part IV section,
// or { citation: null } if regulation search is unavailable (e.g. the
// vector embeddings haven't been ingested yet).
regulationsRouter.get(
  "/citation/:sectionKey",
  requireAuth,
  asyncHandler(async (req, res) => {
    const sectionKey = (req.params.sectionKey ?? "").toUpperCase();
    const query = SECTION_QUERY[sectionKey];
    if (!query) {
      res.json({ citation: null });
      return;
    }

    const [chunk] = await searchRegulations(query, 1);
    if (!chunk) {
      res.json({ citation: null });
      return;
    }

    const citation: RegulationCitation = {
      docTitle: chunk.docTitle,
      section: chunk.section,
      pageStart: chunk.pageStart,
    };
    res.json({ citation });
  }),
);
