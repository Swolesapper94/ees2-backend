/**
 * Artifact Captioning
 *
 * Runs once per artifact, right after upload. Produces a short, factual
 * description of what the artifact shows/proves (e.g. "DA Form 87 Certificate
 * of Training — Combatives Level 1, dated 12 MAR 2025, awarded to SGT Smith").
 *
 * The caption is stored on the artifact and reused as text context in every
 * subsequent bullet-generation call — we do NOT re-send the raw image/PDF to
 * OpenAI on each generation, which keeps prompts fast and cheap.
 */

import { prisma } from "@/lib/prisma";
import { extractTextFromImage, callOpenAIForJson } from "./openai";
import { extractPdfText, sanitizeTextForStorage } from "@/lib/pdf/extract-text";

const CAPTION_SYSTEM_PROMPT = `You are reading proof/evidence a soldier attached to a support form entry
(a certificate, score sheet, photo, or other document). Describe factually and concisely — one or two
sentences, no more than 240 characters — what the document/photo shows and what it proves. Include any
visible names, dates, scores, course/award titles, or units. Do NOT speculate or embellish beyond what is
visible. If the image/document is illegible or unrelated, say so plainly.
Output plain text only — no preamble, no markdown.`;

function detectMediaType(fileUrl: string): "image/jpeg" | "image/png" | "image/webp" | "image/gif" {
  const lower = fileUrl.toLowerCase();
  if (lower.includes(".png")) return "image/png";
  if (lower.includes(".webp")) return "image/webp";
  if (lower.includes(".gif")) return "image/gif";
  return "image/jpeg";
}

/**
 * Generates and persists the AI caption for a single artifact.
 * Designed to be called fire-and-forget right after upload (mirrors the
 * pattern used by runSupportFormPipeline for whole-document uploads).
 */
export async function generateArtifactCaption(artifactId: string): Promise<void> {
  const artifact = await prisma.supportFormEntryArtifact.findUnique({
    where: { id: artifactId },
  });
  if (!artifact) return;

  try {
    let caption: string;

    if (artifact.fileType === "image") {
      const response = await fetch(artifact.fileUrl);
      const buffer = Buffer.from(await response.arrayBuffer());
      const base64 = buffer.toString("base64");

      caption = await extractTextFromImage({
        imageBase64: base64,
        mediaType: detectMediaType(artifact.fileUrl),
        systemPrompt: CAPTION_SYSTEM_PROMPT,
      });
    } else {
      // PDF — extract text, then have OpenAI summarize it factually
      const response = await fetch(artifact.fileUrl);
      const buffer = Buffer.from(await response.arrayBuffer());
      const text = await extractPdfText(buffer);

      caption = await callOpenAIForJson<string>({
        systemPrompt: CAPTION_SYSTEM_PROMPT,
        userPrompt: `Raw text extracted from the uploaded PDF:\n\n${text.slice(0, 4000)}\n\nDescribe what it shows, per the instructions. Return as a plain string (not JSON).`,
        maxTokens: 300,
      }).catch(() => text.slice(0, 240));
    }

    await prisma.supportFormEntryArtifact.update({
      where: { id: artifactId },
      data: {
        aiCaption: sanitizeTextForStorage(caption).slice(0, 500),
        aiCaptionStatus: "COMPLETE",
        aiCaptionError: null,
      },
    });
  } catch (err) {
    console.error("[artifact-captioning] Error captioning artifact:", artifactId, err);
    await prisma.supportFormEntryArtifact.update({
      where: { id: artifactId },
      data: {
        aiCaptionStatus: "FAILED",
        aiCaptionError: sanitizeTextForStorage(err instanceof Error ? err.message : String(err)),
      },
    });
  }
}
