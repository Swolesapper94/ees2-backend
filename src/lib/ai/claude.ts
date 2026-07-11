import OpenAI from "openai";
import { env } from "@/config/env";

let client: OpenAI | null = null;

export function getOpenAI(): OpenAI {
  if (!client) {
    if (!env.openaiApiKey) {
      throw new Error("OPENAI_API_KEY is not configured.");
    }
    client = new OpenAI({ apiKey: env.openaiApiKey });
  }
  return client;
}

export interface GenerateBulletsArgs {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
}

/**
 * Calls OpenAI and parses a JSON array of bullet strings from the response.
 * The system prompt instructs the model to return ONLY a JSON array.
 */
export async function generateBullets(
  args: GenerateBulletsArgs,
): Promise<string[]> {
  const message = await getOpenAI().chat.completions.create({
    model: env.openaiModel,
    max_tokens: args.maxTokens ?? 1024,
    messages: [
      { role: "system", content: args.systemPrompt },
      { role: "user", content: args.userPrompt },
    ],
  });

  const text = message.choices
    .filter((choice) => choice.message.content)
    .map((choice) => choice.message.content || "")
    .join("")
    .trim();

  return parseBulletArray(text);
}

/**
 * Calls OpenAI with a base64-encoded image (or PDF via URL) for vision extraction.
 * Returns the raw text response.
 */
export async function extractTextFromImage(args: {
  imageBase64: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  systemPrompt: string;
}): Promise<string> {
  const message = await getOpenAI().chat.completions.create({
    model: env.openaiModel,
    max_tokens: 4096,
    messages: [
      { role: "system", content: args.systemPrompt },
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: {
              url: `data:${args.mediaType};base64,${args.imageBase64}`,
            },
          },
          { type: "text", text: "Extract all text from this support form as instructed." },
        ] as Array<OpenAI.ChatCompletionContentPart>,
      },
    ],
  });

  return message.choices
    .filter((choice) => choice.message.content)
    .map((choice) => choice.message.content || "")
    .join("")
    .trim();
}

/**
 * Calls OpenAI with a text prompt and expects a JSON response.
 * Returns the parsed JSON or throws on parse failure.
 */
export async function callClaudeForJson<T = unknown>(args: {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
}): Promise<T> {
  const message = await getOpenAI().chat.completions.create({
    model: env.openaiModel,
    max_tokens: args.maxTokens ?? 2048,
    messages: [
      { role: "system", content: args.systemPrompt },
      { role: "user", content: args.userPrompt },
    ],
  });

  let text = message.choices
    .filter((choice) => choice.message.content)
    .map((choice) => choice.message.content || "")
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
 * Defensive style filter: the system prompt tells Claude never to use em/en
 * dashes, but LLM output isn't guaranteed to comply. This is the last line
 * of defense before bullet text is persisted or shown to a rater.
 */
export function sanitizeBulletText(text: string): string {
  return text
    .replace(/\s*[\u2014\u2013]\s*/g, ", ") // em dash (—) / en dash (–) → comma
    .replace(/,\s*,/g, ",") // collapse any doubled commas the substitution creates
    .replace(/,\s*$/g, "") // trim a trailing comma left at the end of the bullet
    .trim();
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
