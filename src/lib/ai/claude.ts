import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/config/env";

let client: Anthropic | null = null;

export function getClaude(): Anthropic {
  if (!client) {
    if (!env.anthropicApiKey) {
      throw new Error("ANTHROPIC_API_KEY is not configured.");
    }
    client = new Anthropic({ apiKey: env.anthropicApiKey });
  }
  return client;
}

export interface GenerateBulletsArgs {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
}

/**
 * Calls Claude and parses a JSON array of bullet strings from the response.
 * The system prompt instructs the model to return ONLY a JSON array.
 */
export async function generateBullets(
  args: GenerateBulletsArgs,
): Promise<string[]> {
  const message = await getClaude().messages.create({
    model: env.anthropicModel,
    max_tokens: args.maxTokens ?? 1024,
    system: args.systemPrompt,
    messages: [{ role: "user", content: args.userPrompt }],
  });

  const text = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();

  return parseBulletArray(text);
}

/**
 * Calls Claude with a base64-encoded image (or PDF via URL) for vision extraction.
 * Returns the raw text response.
 */
export async function extractTextFromImage(args: {
  imageBase64: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  systemPrompt: string;
}): Promise<string> {
  const message = await getClaude().messages.create({
    model: env.anthropicModel,
    max_tokens: 4096,
    system: args.systemPrompt,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: args.mediaType,
              data: args.imageBase64,
            },
          },
          { type: "text", text: "Extract all text from this support form as instructed." },
        ],
      },
    ],
  });

  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();
}

/**
 * Calls Claude with a text prompt and expects a JSON response.
 * Returns the parsed JSON or throws on parse failure.
 */
export async function callClaudeForJson<T = unknown>(args: {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
}): Promise<T> {
  const message = await getClaude().messages.create({
    model: env.anthropicModel,
    max_tokens: args.maxTokens ?? 2048,
    system: args.systemPrompt,
    messages: [{ role: "user", content: args.userPrompt }],
  });

  let text = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();

  // Strip markdown fences if present
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

  // Extract first JSON object or array
  const start = Math.min(
    text.indexOf("[") !== -1 ? text.indexOf("[") : Infinity,
    text.indexOf("{") !== -1 ? text.indexOf("{") : Infinity,
  );
  const lastClose = Math.max(text.lastIndexOf("]"), text.lastIndexOf("}"));
  if (start !== Infinity && lastClose > start) {
    text = text.slice(start, lastClose + 1);
  }

  return JSON.parse(text) as T;
}

/**
 * Defensive parse: strips accidental code fences and extracts the JSON array.
 */
export function parseBulletArray(raw: string): string[] {
  let cleaned = raw.trim();

  // Strip markdown code fences if the model added them despite instructions.
  cleaned = cleaned
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  // Grab the first [...] block if there's extra prose.
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start !== -1 && end !== -1 && end > start) {
    cleaned = cleaned.slice(start, end + 1);
  }

  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
      return parsed.filter((b): b is string => typeof b === "string");
    }
  } catch {
    // fall through
  }
  return [];
}
