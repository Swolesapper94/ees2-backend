/**
 * Support Form AI Pipeline — EES 2.0 Phase 1
 *
 * Stage 1: Vision extraction (Claude sees the scanned/uploaded support form)
 * Stage 2: Parse raw extract into typed section entries
 * Stage 3: Generate ranked bullet candidates per section (injecting regulation context)
 *
 * All three stages run sequentially after file upload.
 * The rater is notified when Stage 3 completes.
 */

import fs from "fs";
import { prisma } from "@/lib/prisma";
import { extractTextFromImage, callClaudeForJson, generateBullets } from "./claude";
import { searchRegulations } from "@/lib/regulations/search";
import { SYSTEM_PROMPT } from "./prompts";

// ─── Section definitions for regulation-aware bullet generation ───────────────

const SECTION_DEFINITIONS: Record<string, string> = {
  CHARACTER:
    "Army Values (Loyalty, Duty, Respect, Selfless Service, Honor, Integrity, Personal Courage), Empathy, Warrior Ethos, and discipline in conduct and bearing.",
  PRESENCE:
    "Military and professional bearing, physical fitness, confidence, and resilience under pressure.",
  INTELLECT:
    "Mental agility, sound judgment, innovation, tact, and technical/tactical expertise.",
  LEADS:
    "Leads others, builds trust, extends influence, leads by example, and communicates effectively.",
  DEVELOPS:
    "Fosters a positive environment, prepares self and others for future roles, develops leaders, and stewards the profession.",
  ACHIEVES:
    "Gets results. Mission accomplishment, task completion, and tangible impact.",
};

// ─── Stage 1: Vision Extraction ───────────────────────────────────────────────

const STAGE1_SYSTEM_PROMPT = `You are reading a scanned U.S. Army DA 2166-9-1A Support Form.
Extract all text you can read, including handwritten entries.
For each accomplishment or entry found, output it on its own line prefixed with the section label
if visible (e.g. "CHARACTER:", "ACHIEVES:"). If a date or timeframe is visible near the entry,
include it in brackets. Do not restructure, summarize, or interpret — only extract what you can read.
If a section is blank or illegible, write "[SECTION ILLEGIBLE]".
Output plain text only.`;

async function runStage1(
  uploadId: string,
  fileUrl: string,
  fileType: string,
): Promise<string> {
  await prisma.supportFormUpload.update({
    where: { id: uploadId },
    data: { parseStatus: "EXTRACTING" },
  });

  let rawExtract: string;

  if (fileType === "image") {
    // Download the image and convert to base64 for Claude vision
    const response = await fetch(fileUrl);
    const buffer = Buffer.from(await response.arrayBuffer());
    const base64 = buffer.toString("base64");

    // Detect media type from URL
    const lowerUrl = fileUrl.toLowerCase();
    let mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif" = "image/jpeg";
    if (lowerUrl.includes(".png")) mediaType = "image/png";
    else if (lowerUrl.includes(".webp")) mediaType = "image/webp";
    else if (lowerUrl.includes(".gif")) mediaType = "image/gif";

    rawExtract = await extractTextFromImage({
      imageBase64: base64,
      mediaType,
      systemPrompt: STAGE1_SYSTEM_PROMPT,
    });
  } else {
    // PDF — use pdf-parse to extract text, then send to Claude for normalization
    const { default: pdfParse } = await import("pdf-parse");
    const response = await fetch(fileUrl);
    const buffer = Buffer.from(await response.arrayBuffer());
    const { text } = await pdfParse(buffer);

    // For typed PDFs, send the extracted text to Claude to normalize/label it
    rawExtract = await callClaudeForJson<string>({
      systemPrompt: STAGE1_SYSTEM_PROMPT,
      userPrompt: `The following is raw text extracted from a DA 2166-9-1A support form PDF:\n\n${text.slice(0, 6000)}\n\nNormalize it into the labeled format as instructed. Return as a plain string (not JSON).`,
      maxTokens: 4096,
    }).catch(async () => {
      // If JSON parse fails, Claude returned plain text — fall back to Claude text call
      const { callClaudeForJson: _, ...rest } = await import("./claude");
      void rest;
      return text; // use raw extracted text as fallback
    });
  }

  await prisma.supportFormUpload.update({
    where: { id: uploadId },
    data: { parseStatus: "PENDING_PARSE", rawExtract },
  });

  return rawExtract;
}

// ─── Stage 2: Parse into Typed Entries ───────────────────────────────────────

const STAGE2_SYSTEM_PROMPT = `You are classifying U.S. Army NCOER support form entries for the DA 2166-9-1A form.
Given the following raw extracted text, output a JSON array only — no preamble, no markdown fences.
Each object must have:
{ "section": one of [CHARACTER, PRESENCE, INTELLECT, LEADS, DEVELOPS, ACHIEVES],
  "what": "what happened",
  "impact": "result or effect if visible" (optional),
  "date": "date or period if visible" (optional),
  "context": "any additional context" (optional) }
Classify each entry to the section it most directly supports.
An entry about personal conduct → CHARACTER.
Training others → DEVELOPS.
Results/task execution → ACHIEVES.
Leading a team → LEADS.
Physical fitness or appearance → PRESENCE.
Creative thinking or technical expertise → INTELLECT.
If ambiguous, default to ACHIEVES.
Output JSON array only.`;

interface ParsedEntry {
  section: string;
  what: string;
  impact?: string;
  date?: string;
  context?: string;
}

async function runStage2(
  uploadId: string,
  evaluationId: string,
  rawExtract: string,
): Promise<ParsedEntry[]> {
  await prisma.supportFormUpload.update({
    where: { id: uploadId },
    data: { parseStatus: "PARSING" },
  });

  const validSections = new Set([
    "CHARACTER", "PRESENCE", "INTELLECT", "LEADS", "DEVELOPS", "ACHIEVES",
  ]);

  const parsed = await callClaudeForJson<ParsedEntry[]>({
    systemPrompt: STAGE2_SYSTEM_PROMPT,
    userPrompt: rawExtract,
    maxTokens: 3000,
  });

  // Filter to valid sections only
  const valid = parsed.filter((e) => validSections.has(e.section?.toUpperCase()));

  // Persist to AIExtractedEntry
  await prisma.aIExtractedEntry.createMany({
    data: valid.map((e) => ({
      uploadId,
      evaluationId,
      section: e.section.toUpperCase() as never,
      what: e.what ?? "",
      impact: e.impact ?? null,
      date: e.date ?? null,
      context: e.context ?? null,
    })),
  });

  await prisma.supportFormUpload.update({
    where: { id: uploadId },
    data: { parseStatus: "PENDING_BULLETS" },
  });

  return valid;
}

// ─── Stage 3: Generate Bullets per Section (with Regulation RAG) ─────────────

interface BulletCandidate {
  rank: number;
  text: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
}

async function runStage3(
  uploadId: string,
  evaluationId: string,
  entries: ParsedEntry[],
  soldierInfo: { rank: string; mos: string; dutyTitle: string; formType: string },
): Promise<void> {
  await prisma.supportFormUpload.update({
    where: { id: uploadId },
    data: { parseStatus: "GENERATING" },
  });

  const sections = ["CHARACTER", "PRESENCE", "INTELLECT", "LEADS", "DEVELOPS", "ACHIEVES"];

  // Get the IDs of the stored AIExtractedEntry rows (for sourceEntryIds linking)
  const storedEntries = await prisma.aIExtractedEntry.findMany({
    where: { uploadId },
    select: { id: true, section: true, what: true },
  });

  for (const sectionKey of sections) {
    const sectionEntries = entries.filter(
      (e) => e.section.toUpperCase() === sectionKey,
    );

    if (sectionEntries.length === 0) {
      // Generate with just the section definition (no support form entries for this section)
    }

    // Retrieve relevant regulation context for this section via RAG
    const regQuery = `NCOER ${sectionKey} section bullet writing ${SECTION_DEFINITIONS[sectionKey] ?? sectionKey}`;
    const regChunks = await searchRegulations(regQuery, 3);
    const regContext = regChunks
      .map((c) => `[${c.docTitle} ${c.section}] ${c.heading}:\n${c.content.slice(0, 600)}`)
      .join("\n\n");

    const formNumber = soldierInfo.formType.includes("9_1") ? "9-1" : "9-2";

    const systemPrompt = `${SYSTEM_PROMPT}

ARMY REGULATION CONTEXT (for accuracy):
${regContext}`;

    const userPrompt = `You are a senior NCO writing NCOER bullets for the ${sectionKey} section of a DA 2166-${formNumber} evaluation.
You are writing on behalf of the rater.

SOLDIER: ${soldierInfo.rank}, MOS ${soldierInfo.mos}
DUTY TITLE: ${soldierInfo.dutyTitle}

SECTION DEFINITION:
${SECTION_DEFINITIONS[sectionKey] ?? sectionKey}

SUPPORT FORM ENTRIES FOR THIS SECTION:
${
  sectionEntries.length > 0
    ? sectionEntries.map((e, i) => {
        const parts = [`${i + 1}. ${e.what}`];
        if (e.impact) parts.push(`   Impact: ${e.impact}`);
        if (e.date) parts.push(`   Date: ${e.date}`);
        if (e.context) parts.push(`   Context: ${e.context}`);
        return parts.join("\n");
      }).join("\n")
    : "(No support form entries for this section — generate based on role/rank/MOS context)"
}

Write exactly 5 bullet candidates, ranked best to worst. Each bullet must:
- Start with a strong action verb (past tense: "Led", "Trained", "Achieved", "Developed", etc.)
- Follow the Army action-impact format: what the soldier did, and what resulted
- Contain NO personal pronouns (no "he", "she", "they", "his", "her")
- Be 200 characters or fewer
- Sound like a senior leader wrote it

Output JSON only. No preamble. No markdown. Format:
[{ "rank": 1, "text": "...", "confidence": "HIGH|MEDIUM|LOW" }]`;

    let bullets: BulletCandidate[] = [];
    try {
      bullets = await callClaudeForJson<BulletCandidate[]>({
        systemPrompt,
        userPrompt,
        maxTokens: 1500,
      });
    } catch {
      // If JSON parse fails, skip this section
      continue;
    }

    // Get sourceEntryIds for this section
    const sectionStoredEntries = storedEntries.filter(
      (e) => e.section === sectionKey,
    );
    const sourceIds = sectionStoredEntries.map((e) => e.id);

    // Persist bullet suggestions
    await prisma.aIBulletSuggestion.createMany({
      data: bullets
        .filter((b) => b.text && typeof b.text === "string")
        .map((b) => ({
          evaluationId,
          uploadId,
          sectionKey: sectionKey as never,
          text: b.text.slice(0, 300),
          confidence: (b.confidence ?? "MEDIUM") as never,
          rank: b.rank ?? 1,
          status: "PENDING_REVIEW" as never,
          sourceEntryIds: sourceIds,
        })),
    });
  }

  await prisma.supportFormUpload.update({
    where: { id: uploadId },
    data: { parseStatus: "COMPLETE" },
  });
}

// ─── Main pipeline entrypoint ─────────────────────────────────────────────────

export interface PipelineArgs {
  uploadId: string;
  evaluationId: string;
  fileUrl: string;
  fileType: string;
  soldierInfo: {
    rank: string;
    mos: string;
    dutyTitle: string;
    formType: string;
  };
}

/**
 * Runs all three stages sequentially.
 * Designed to be called async (fire-and-forget from the upload endpoint).
 * Updates parseStatus at each stage boundary so the UI can poll progress.
 */
export async function runSupportFormPipeline(args: PipelineArgs): Promise<void> {
  try {
    const rawExtract = await runStage1(args.uploadId, args.fileUrl, args.fileType);
    const entries = await runStage2(args.uploadId, args.evaluationId, rawExtract);
    await runStage3(args.uploadId, args.evaluationId, entries, args.soldierInfo);
  } catch (err) {
    console.error("[pipeline] Error in support form pipeline:", err);
    await prisma.supportFormUpload.update({
      where: { id: args.uploadId },
      data: {
        parseStatus: "FAILED",
        parseError: err instanceof Error ? err.message : String(err),
      },
    });
  }
}

// ─── From-Scratch bullet generation (no support form) ────────────────────────

/**
 * Generate bullet suggestions from a rater's free-text description.
 * Injects regulation context the same way as Stage 3.
 */
export async function generateBulletsFromScratch(args: {
  evaluationId: string;
  sectionKey: string;
  raterDescription: string;
  soldierInfo: { rank: string; mos: string; dutyTitle: string; formType: string };
}): Promise<BulletCandidate[]> {
  const regQuery = `NCOER ${args.sectionKey} section ${SECTION_DEFINITIONS[args.sectionKey] ?? args.sectionKey}`;
  const regChunks = await searchRegulations(regQuery, 3);
  const regContext = regChunks
    .map((c) => `[${c.docTitle} ${c.section}] ${c.heading}:\n${c.content.slice(0, 600)}`)
    .join("\n\n");

  const formNumber = args.soldierInfo.formType.includes("9_1") ? "9-1" : "9-2";

  const systemPrompt = `${SYSTEM_PROMPT}

ARMY REGULATION CONTEXT (for accuracy):
${regContext}`;

  const userPrompt = `SOLDIER: ${args.soldierInfo.rank}, MOS ${args.soldierInfo.mos}
DUTY TITLE: ${args.soldierInfo.dutyTitle}
SECTION: ${args.sectionKey}

SECTION DEFINITION:
${SECTION_DEFINITIONS[args.sectionKey] ?? args.sectionKey}

RATER'S DESCRIPTION:
${args.raterDescription}

Write 5 NCOER bullet candidates for DA 2166-${formNumber}. Rank best to worst.
Each bullet: action verb, action-impact format, no pronouns, ≤200 chars.
Output JSON only: [{ "rank": 1, "text": "...", "confidence": "HIGH|MEDIUM|LOW" }]`;

  return callClaudeForJson<BulletCandidate[]>({
    systemPrompt,
    userPrompt,
    maxTokens: 1500,
  });
}
