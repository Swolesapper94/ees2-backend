/**
 * Support Form AI Pipeline — EES 2.0 Phase 1
 *
 * Stage 1: Vision extraction (OpenAI vision sees the scanned/uploaded support form)
 * Stage 2: Parse raw extract into typed section entries
 * Stage 3: Generate ranked bullet candidates per section (injecting regulation context)
 *
 * All three stages run sequentially after file upload.
 * The rater is notified when Stage 3 completes.
 */

import fs from "fs";
import { prisma } from "@/lib/prisma";
import { extractTextFromImage, callOpenAIForJson, generateBullets, sanitizeBulletText } from "./openai";
import { extractPdfText, sanitizeTextForStorage } from "@/lib/pdf/extract-text";
import { searchRegulations } from "@/lib/regulations/search";
import { systemPromptForFormType } from "./prompts";
import { env } from "@/config/env";

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

const STAGE1_SYSTEM_PROMPT = `You are reading a scanned U.S. Army evaluation support form.
Extract all text you can read, including handwritten entries.
For each accomplishment or entry found, output it on its own line prefixed with the section label
if visible (e.g. "CHARACTER:", "ACHIEVES:"). If a date or timeframe is visible near the entry,
include it in brackets. Do not restructure, summarize, or interpret — only extract what you can read.
If a section is blank or illegible, write "[SECTION ILLEGIBLE]".
Output plain text only.`;

const DUTY_PREFILL_SYSTEM_PROMPT = `Extract only the duty description fields from a U.S. Army support form.
Return JSON only with these optional fields:
{
  "principalDutyTitle": "official duty title",
  "dutyMosc": "duty MOSC if present",
  "dailyDutiesScope": "significant duties and responsibilities",
  "areasOfSpecialEmphasis": "areas of emphasis if present",
  "appointedDuties": "appointed duties if present"
}
Do not invent information. Omit fields that are blank or illegible.`;

interface ExtractedDutyDescription {
  principalDutyTitle?: string;
  dutyMosc?: string;
  dailyDutiesScope?: string;
  areasOfSpecialEmphasis?: string;
  appointedDuties?: string;
}

function dutyValue(value: unknown, maxLength = 4000): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = sanitizeTextForStorage(value).slice(0, maxLength);
  return cleaned || undefined;
}

async function prefillEvaluationDutyDescription(
  evaluationId: string,
  rawExtract: string,
): Promise<void> {
  const evaluation = await prisma.evaluation.findUnique({
    where: { id: evaluationId },
    select: {
      principalDutyTitle: true,
      dutyMosc: true,
      dailyDutiesScope: true,
      areasOfSpecialEmphasis: true,
      appointedDuties: true,
    },
  });
  if (!evaluation || Object.values(evaluation).every((value) => value !== null)) return;

  try {
    const extracted = await callOpenAIForJson<ExtractedDutyDescription>({
      systemPrompt: DUTY_PREFILL_SYSTEM_PROMPT,
      userPrompt: rawExtract.slice(0, 8000),
      maxTokens: 1000,
    });
    const data = {
      ...(evaluation.principalDutyTitle ? {} : { principalDutyTitle: dutyValue(extracted.principalDutyTitle, 200) }),
      ...(evaluation.dutyMosc ? {} : { dutyMosc: dutyValue(extracted.dutyMosc, 100) }),
      ...(evaluation.dailyDutiesScope ? {} : { dailyDutiesScope: dutyValue(extracted.dailyDutiesScope) }),
      ...(evaluation.areasOfSpecialEmphasis ? {} : { areasOfSpecialEmphasis: dutyValue(extracted.areasOfSpecialEmphasis) }),
      ...(evaluation.appointedDuties ? {} : { appointedDuties: dutyValue(extracted.appointedDuties) }),
    };
    if (Object.values(data).some((value) => value !== undefined)) {
      await prisma.evaluation.update({ where: { id: evaluationId }, data });
    }
  } catch (error) {
    console.warn("[pipeline] Duty-description prefill unavailable", error);
  }
}

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
  let buffer: Buffer;

  // Load file from either remote URL or local file:// URL (dev mode)
  if (fileUrl.startsWith("file://")) {
    // Dev mode: read from local temp file
    const localPath = fileUrl.replace("file://", "");
    console.log(`[pipeline] Loading file from local temp path: ${localPath}`);
    buffer = fs.readFileSync(localPath);
  } else {
    // Production: fetch from remote URL
    const response = await fetch(fileUrl);
    buffer = Buffer.from(await response.arrayBuffer());
  }

  if (fileType === "image") {
    // Convert image buffer to base64 for OpenAI vision
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
    // Never fall back to raw PDF bytes: they may contain NUL characters and
    // cannot be stored in PostgreSQL text columns or safely sent to the model.
    const text = await extractPdfText(buffer);

    // pdf-parse already returns safe text. Stage 2 classifies it, avoiding a
    // second model call that can leave the pipeline stuck before parsing.
    rawExtract = text;
  }

  rawExtract = sanitizeTextForStorage(rawExtract);

  await prisma.supportFormUpload.update({
    where: { id: uploadId },
    data: { parseStatus: "PENDING_PARSE", rawExtract },
  });

  return rawExtract;
}

// ─── Stage 2: Parse into Typed Entries ───────────────────────────────────────

const STAGE2_SYSTEM_PROMPT = `You are classifying U.S. Army evaluation support form entries.
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

export interface ParsedEntry {
  section: string;
  what: string;
  impact?: string;
  date?: string;
  context?: string;
  factCategory?: string;
  quantityOrMetric?: string;
  sourcePage?: number;
  confidence?: "HIGH" | "MEDIUM" | "LOW";
}

const DEMO_SUPPORT_FORM_FIXTURE_NAME = "SGT_Davis_Demo_Support_Form.pdf";

const DEMO_SUPPORT_FORM_ENTRIES: ParsedEntry[] = [
  {
    section: "LEADS",
    what: "Led a nine-Soldier team through four battalion live-fire rehearsal iterations with zero safety violations.",
    impact: "Corrected three range-control deficiencies and trained two junior team leaders on PCC/PCI standards.",
    date: "12 June 2026",
    factCategory: "Leadership",
    quantityOrMetric: "9 Soldiers; 4 iterations; 0 safety violations; 3 deficiencies; 2 junior leaders",
    sourcePage: 1,
    confidence: "HIGH",
  },
  {
    section: "DEVELOPS",
    what: "Conducted six structured training sessions for twelve Soldiers from March through June 2026.",
    impact: "Ten Soldiers improved individual task evaluation scores and two junior leaders were certified to lead future training.",
    date: "March-June 2026",
    factCategory: "Training",
    quantityOrMetric: "6 sessions; 12 Soldiers; 10 improved; 2 certified",
    sourcePage: 1,
    confidence: "HIGH",
  },
  {
    section: "ACHIEVES",
    what: "Reorganized the team's equipment accountability process.",
    impact: "Reduced monthly inventory reconciliation time from four hours to ninety minutes and resolved eleven unmatched serial-number records.",
    date: "2026 rating period",
    factCategory: "Results",
    quantityOrMetric: "4 hours to 90 minutes; 11 records resolved",
    sourcePage: 1,
    confidence: "HIGH",
  },
  {
    section: "INTELLECT",
    what: "Developed a standardized range packet and pre-execution checklist.",
    impact: "Checklist was adopted by three squads during the June training cycle.",
    date: "June 2026",
    factCategory: "Process improvement",
    quantityOrMetric: "3 squads",
    sourcePage: 1,
    confidence: "HIGH",
  },
];

async function runStage2(
  uploadId: string,
  evaluationId: string,
  rawExtract: string,
  sourceDocumentName?: string,
  extractionMethod = "PDF_TEXT",
): Promise<ParsedEntry[]> {
  await prisma.supportFormUpload.update({
    where: { id: uploadId },
    data: { parseStatus: "PARSING" },
  });

  const validSections = new Set([
    "CHARACTER", "PRESENCE", "INTELLECT", "LEADS", "DEVELOPS", "ACHIEVES",
  ]);

  const parsed = env.supportFormParserMode === "DEMO_FIXTURE"
    ? DEMO_SUPPORT_FORM_ENTRIES
    : await callOpenAIForJson<ParsedEntry[]>({
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
      factCategory: e.factCategory ?? null,
      quantityOrMetric: e.quantityOrMetric ?? null,
      sourcePage: e.sourcePage ?? null,
      confidence: (e.confidence ?? "MEDIUM") as never,
      sourceDocumentName: sourceDocumentName ?? null,
      originalExtractedText: [e.what, e.impact, e.context].filter(Boolean).join(" ").trim() || e.what || "",
      reviewStatus: "PENDING_REVIEW" as never,
      extractionMethod,
    })),
  });

  await prisma.supportFormUpload.update({
    where: { id: uploadId },
    data: { parseStatus: "REVIEW_REQUIRED" },
  });

  return valid;
}

// ─── Stage 3: Generate Bullets per Section (with Regulation RAG) ─────────────

interface BulletCandidate {
  rank: number;
  text: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
}

function normalizeBulletCandidates(response: unknown): BulletCandidate[] {
  if (!Array.isArray(response)) return [];
  return response.flatMap((bullet, index) => {
    if (typeof bullet === "string" && bullet.trim()) {
      return [{
        rank: index + 1,
        text: bullet.replace(/^\s*\d+[.)]\s*/, ""),
        confidence: "MEDIUM" as const,
      }];
    }
    if (
      bullet &&
      typeof bullet === "object" &&
      "text" in bullet &&
      typeof bullet.text === "string" &&
      bullet.text.trim()
    ) {
      const candidate = bullet as Partial<BulletCandidate>;
      return [{
        rank: typeof candidate.rank === "number" ? candidate.rank : index + 1,
        text: candidate.text!.replace(/^\s*\d+[.)]\s*/, ""),
        confidence: candidate.confidence ?? "MEDIUM",
      }];
    }
    return [];
  });
}

export async function runStage3(
  uploadId: string,
  evaluationId: string,
  soldierInfo: { rank: string; mos: string; dutyTitle: string; formType: string },
  targetSectionKey?: string,
): Promise<void> {
  await prisma.supportFormUpload.update({
    where: { id: uploadId },
    data: { parseStatus: "GENERATING" },
  });

  const sections = targetSectionKey ? [targetSectionKey] : ["CHARACTER", "PRESENCE", "INTELLECT", "LEADS", "DEVELOPS", "ACHIEVES"];

  // Get the IDs of the stored AIExtractedEntry rows (for sourceEntryIds linking)
  const storedEntries = await prisma.aIExtractedEntry.findMany({
    where: { uploadId, reviewStatus: { in: ["ACCEPTED", "EDITED"] } },
    select: {
      id: true,
      section: true,
      what: true,
      impact: true,
      date: true,
      context: true,
      reviewedText: true,
      originalExtractedText: true,
      sourceDocumentName: true,
      sourcePage: true,
      reviewStatus: true,
      reviewedById: true,
      reviewedAt: true,
      extractionMethod: true,
    },
  });
  if (storedEntries.length === 0) {
    throw new Error("No human-reviewed extracted facts are available for bullet generation.");
  }
  const evaluation = await prisma.evaluation.findUnique({
    where: { id: evaluationId },
    select: {
      supportForm: {
        select: {
          goals: {
            where: { approvalStatus: "APPROVED" },
            select: { sectionKey: true, title: true, description: true },
          },
        },
      },
    },
  });
  const approvedGoalsBySection = new Map<string, string[]>();
  for (const goal of evaluation?.supportForm?.goals ?? []) {
    const summaries = approvedGoalsBySection.get(goal.sectionKey) ?? [];
    summaries.push(`${goal.title}: ${goal.description}`);
    approvedGoalsBySection.set(goal.sectionKey, summaries);
  }
  let persistedSuggestionCount = 0;
  const generationFailures: string[] = [];

  for (const sectionKey of sections) {
    const sectionEntries = storedEntries.filter((entry) => entry.section === sectionKey);
    if (sectionEntries.length === 0) continue;

    // Retrieve relevant regulation context for this section via RAG
    const formCategory = soldierInfo.formType.startsWith("OER") ? "OER" : "NCOER";
    const regQuery = `${formCategory} ${sectionKey} section performance writing ${SECTION_DEFINITIONS[sectionKey] ?? sectionKey}`;
    const regChunks = await searchRegulations(regQuery, 3);
    const regContext = regChunks
      .map((c) => `[${c.docTitle} ${c.section}] ${c.heading}:\n${c.content.slice(0, 600)}`)
      .join("\n\n");

    const formLabel = soldierInfo.formType.replaceAll("_", " ");

    const systemPrompt = `${systemPromptForFormType(soldierInfo.formType)}

ARMY REGULATION CONTEXT (for accuracy):
${regContext}`;
    const goalContext = approvedGoalsBySection.get(sectionKey) ?? [];

    for (const [entryIndex, entry] of sectionEntries.entries()) {
      const reviewedFact = entry.reviewedText ?? entry.originalExtractedText ?? entry.what;
      const evidence = [
        `What happened: ${reviewedFact}`,
        ...(entry.impact ? [`Impact: ${entry.impact}`] : []),
        ...(entry.date ? [`Date or period: ${entry.date}`] : []),
        ...(entry.context ? [`Context: ${entry.context}`] : []),
      ].join("\n");
      const userPrompt = `You are writing one rater performance suggestion for the ${sectionKey} section of a ${formLabel} evaluation.
You are writing on behalf of the rater.

SOLDIER: ${soldierInfo.rank}, MOS ${soldierInfo.mos}
DUTY TITLE: ${soldierInfo.dutyTitle}

SECTION DEFINITION:
${SECTION_DEFINITIONS[sectionKey] ?? sectionKey}

SOURCE FACT:
${evidence}

${goalContext.length ? `APPROVED PERFORMANCE GOAL CONTEXT:
${goalContext.join("\n")}

` : ""}Use any approved goal only as context for relevance or intended impact. It is not evidence that the goal was achieved; ground every factual claim only in the reviewed source fact.

Write exactly one evaluation performance candidate grounded only in the source fact. Do not combine it with another accomplishment and do not invent missing details. The candidate must:
- Start with a strong past-tense action verb
- Follow the Army action-impact format when the source supports an impact
- Contain no personal pronouns
- Be 200 characters or fewer

If the source fact cannot support an evaluation candidate, return an empty JSON array.
Output JSON only. No preamble. No markdown. Format:
[{ "rank": 1, "text": "...", "confidence": "HIGH|MEDIUM|LOW" }]`;

      let response: unknown;
      try {
        response = await callOpenAIForJson<unknown>({
          systemPrompt,
          userPrompt,
          maxTokens: 500,
        });
      } catch (error) {
        const message = sanitizeTextForStorage(error instanceof Error ? error.message : String(error));
        generationFailures.push(`${sectionKey}: ${message}`);
        console.warn(`[pipeline] Bullet generation failed for ${sectionKey}: ${message}`);
        continue;
      }

      const candidate = normalizeBulletCandidates(response)[0];
      if (!candidate) {
        const responseSummary = sanitizeTextForStorage(JSON.stringify(response)).slice(0, 300);
        const message = `Model returned no evidence-grounded candidate${responseSummary ? `: ${responseSummary}` : ""}`;
        generationFailures.push(`${sectionKey}: ${message}`);
        console.warn(`[pipeline] Bullet generation skipped ${sectionKey} source ${entry.id}: ${message}`);
        continue;
      }

      const created = await prisma.aIBulletSuggestion.create({
        data: {
          evaluationId,
          uploadId,
          sectionKey: sectionKey as never,
          text: sanitizeBulletText(candidate.text).slice(0, 300),
          confidence: (candidate.confidence ?? "MEDIUM") as never,
          rank: entryIndex + 1,
          status: "PENDING_REVIEW" as never,
          sourceEntryIds: [entry.id],
          sourceSnapshot: [{
            entryId: entry.id,
            rawText: evidence,
            artifactCaptions: [],
            sourceDocumentId: uploadId,
            sourceDocumentName: entry.sourceDocumentName,
            sourcePage: entry.sourcePage,
            originalExtractedText: entry.originalExtractedText,
            reviewedText: entry.reviewedText,
            reviewedBy: entry.reviewedById,
            reviewedAt: entry.reviewedAt,
            extractionMethod: entry.extractionMethod,
          }],
        },
      });
      persistedSuggestionCount += created ? 1 : 0;
    }
  }

  if (persistedSuggestionCount === 0) {
    throw new Error(`No bullet suggestions were generated. ${generationFailures.join(" ")}`.trim());
  }

  await prisma.supportFormUpload.update({
    where: { id: uploadId },
    data: { parseStatus: "COMPLETE", parseError: null },
  });
}

// ─── Main pipeline entrypoint ─────────────────────────────────────────────────

export interface PipelineArgs {
  uploadId: string;
  evaluationId: string;
  fileUrl: string;
  fileType: string;
  originalFileName?: string;
  fileSha256?: string;
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
    if (env.supportFormParserMode === "DEMO_FIXTURE") {
      if (args.originalFileName !== DEMO_SUPPORT_FORM_FIXTURE_NAME) {
        throw new Error(`Demo fixture mode only accepts ${DEMO_SUPPORT_FORM_FIXTURE_NAME}.`);
      }
      if (env.demoSupportFormSha256 && args.fileSha256 !== env.demoSupportFormSha256) {
        throw new Error("Uploaded demo support form does not match the approved fixture hash.");
      }
    }
    const rawExtract = await runStage1(args.uploadId, args.fileUrl, args.fileType);
    await prefillEvaluationDutyDescription(args.evaluationId, rawExtract);
    await runStage2(
      args.uploadId,
      args.evaluationId,
      rawExtract,
      args.originalFileName,
      args.fileType === "pdf" ? "PDF_TEXT" : "IMAGE_VISION",
    );
  } catch (err) {
    console.error("[pipeline] Error in support form pipeline:", err);
    await prisma.supportFormUpload.update({
      where: { id: args.uploadId },
      data: {
        parseStatus: "FAILED",
        parseError: sanitizeTextForStorage(err instanceof Error ? err.message : String(err)),
      },
    });
  }
}

export async function generateBulletsFromReviewedUpload(args: {
  uploadId: string;
  evaluationId: string;
  sectionKey?: string;
  soldierInfo: { rank: string; mos: string; dutyTitle: string; formType: string };
}): Promise<void> {
  await prisma.supportFormUpload.update({
    where: { id: args.uploadId },
    data: { parseStatus: "PENDING_BULLETS", parseError: null },
  });
  await runStage3(args.uploadId, args.evaluationId, args.soldierInfo, args.sectionKey);
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
  const formCategory = args.soldierInfo.formType.startsWith("OER") ? "OER" : "NCOER";
  const regQuery = `${formCategory} ${args.sectionKey} section ${SECTION_DEFINITIONS[args.sectionKey] ?? args.sectionKey}`;
  const regChunks = await searchRegulations(regQuery, 3);
  const regContext = regChunks
    .map((c) => `[${c.docTitle} ${c.section}] ${c.heading}:\n${c.content.slice(0, 600)}`)
    .join("\n\n");

  const formLabel = args.soldierInfo.formType.replaceAll("_", " ");

  const systemPrompt = `${systemPromptForFormType(args.soldierInfo.formType)}

ARMY REGULATION CONTEXT (for accuracy):
${regContext}`;

  const userPrompt = `SOLDIER: ${args.soldierInfo.rank}, MOS ${args.soldierInfo.mos}
DUTY TITLE: ${args.soldierInfo.dutyTitle}
SECTION: ${args.sectionKey}

SECTION DEFINITION:
${SECTION_DEFINITIONS[args.sectionKey] ?? args.sectionKey}

RATER'S DESCRIPTION:
${args.raterDescription}

Write 5 evaluation bullet candidates for ${formLabel}. Rank best to worst.
Each bullet: action verb, action-impact format, no pronouns, ≤200 chars.
Do not just add punctuation or lightly reorder the rater's own words — fully
restructure the description into Army bullet grammar and frame it against the
SECTION DEFINITION above. If the description already names a number, unit
size, score, date, or award, keep it exactly (never round up or invent a new
one); if it doesn't, write an honestly smaller, specific bullet rather than a
generic one. Vary the 5 candidates by which real detail or angle from the
description each one emphasizes — do not just reorder the same sentence five ways.
Output JSON only: [{ "rank": 1, "text": "...", "confidence": "HIGH|MEDIUM|LOW" }]`;

  const response = await callOpenAIForJson<unknown>({
    systemPrompt,
    userPrompt,
    maxTokens: 1500,
  });
  return normalizeBulletCandidates(response);
}
// \u2500\u2500\u2500 Generate bullets from selected Support Form entries (guided-flow entries) \u2500\u2500\u2500\u2500\u2500\u2500

/**
 * Generate bullet suggestions from soldier-logged SupportFormEntry rows
 * (guided support form flow), rather than a whole-document upload. Any
 * attached artifacts' AI captions (see artifact-captioning.ts) are folded
 * in as supporting evidence context. Also surfaces any soldier-flagged
 * artifacts so the rater knows to verify before relying on the bullet.
 */
export async function generateBulletsFromEntries(args: {
  evaluationId: string;
  sectionKey: string;
  entryIds: string[];
  observationIds?: string[];
  soldierInfo: { rank: string; mos: string; dutyTitle: string; formType: string };
}): Promise<{ bullets: BulletCandidate[]; hasFlaggedArtifacts: boolean }> {
  const entries = await prisma.supportFormEntry.findMany({
    where: { id: { in: args.entryIds } },
    include: {
      artifacts: true,
      goalLinks: {
        include: {
          goal: {
            select: { title: true, description: true, approvalStatus: true },
          },
        },
      },
    },
  });

  const hasFlaggedArtifacts = entries.some((e) =>
    e.artifacts.some((a) => a.flaggedByServiceMember),
  );
  const observations = await prisma.performanceObservation.findMany({
    where: { id: { in: args.observationIds ?? [] } },
    include: {
      observer: { select: { firstName: true, lastName: true, rank: true } },
      goal: { select: { title: true, description: true, approvalStatus: true } },
      discussedInCounselingSession: { select: { sessionDate: true } },
    },
  });

  const formCategory = args.soldierInfo.formType.startsWith("OER") ? "OER" : "NCOER";
  const regQuery = `${formCategory} ${args.sectionKey} section ${SECTION_DEFINITIONS[args.sectionKey] ?? args.sectionKey}`;
  const regChunks = await searchRegulations(regQuery, 3);
  const regContext = regChunks
    .map((c) => `[${c.docTitle} ${c.section}] ${c.heading}:\n${c.content.slice(0, 600)}`)
    .join("\n\n");

  const formLabel = args.soldierInfo.formType.replaceAll("_", " ");

  const systemPrompt = `${systemPromptForFormType(args.soldierInfo.formType)}

ARMY REGULATION CONTEXT (for accuracy):
${regContext}`;

  const entryText = entries
    .map((e, i) => {
      const parts = [`${i + 1}. ${e.rawText}`];
      const captions = e.artifacts
        .filter((a) => a.aiCaptionStatus === "COMPLETE" && a.aiCaption)
        .map((a) => a.aiCaption);
      if (captions.length > 0) {
        parts.push(`   Supporting evidence: ${captions.join("; ")}`);
      }
      const goals = e.goalLinks
        .map((link) => link.goal)
        .filter((goal) => goal.approvalStatus === "APPROVED")
        .map((goal) => `${goal.title}: ${goal.description}`);
      if (goals.length > 0) {
        parts.push(`   Linked performance goal context: ${goals.join("; ")}`);
      }
      return parts.join("\n");
    })
    .join("\n");

  const observationText = observations
    .map((observation, index) => {
      const parts = [
        `${index + 1}. ${observation.factualNote}`,
        `   Rater observation by ${observation.observer.rank} ${observation.observer.lastName} on ${observation.occurredAt.toLocaleDateString()}.`,
        `   Feedback type: ${observation.feedbackType.toLowerCase()}.`,
      ];
      if (observation.goal?.approvalStatus === "APPROVED") {
        parts.push(`   Linked performance goal context: ${observation.goal.title}: ${observation.goal.description}`);
      }
      if (observation.releaseState === "RELEASED_IN_COUNSELING" && observation.discussedInCounselingSession) {
        parts.push(`   Discussed in counseling on ${observation.discussedInCounselingSession.sessionDate.toLocaleDateString()}.`);
      }
      return parts.join("\n");
    })
    .join("\n");

  const userPrompt = `SOLDIER: ${args.soldierInfo.rank}, MOS ${args.soldierInfo.mos}
DUTY TITLE: ${args.soldierInfo.dutyTitle}
SECTION: ${args.sectionKey}

SECTION DEFINITION:
${SECTION_DEFINITIONS[args.sectionKey] ?? args.sectionKey}

SOLDIER-LOGGED ACCOMPLISHMENTS SELECTED BY THE RATER:
${entryText || "(none)"}

RATER OBSERVATIONS SELECTED BY THE RATER:
${observationText || "(none)"}

Use linked performance goals only as context for the intended result or developmental focus. An approved goal is not evidence that it was achieved; use only the accomplishments and supporting evidence to make factual claims.

Write 5 evaluation bullet candidates for ${formLabel}. Rank best to worst.
Each bullet: action verb, action-impact format, no pronouns, \u2264200 chars.
Output JSON only: [{ "rank": 1, "text": "...", "confidence": "HIGH|MEDIUM|LOW" }]`;

  const response = await callOpenAIForJson<unknown>({
    systemPrompt,
    userPrompt,
    maxTokens: 1500,
  });
  const bullets = normalizeBulletCandidates(response);

  return { bullets, hasFlaggedArtifacts };
}