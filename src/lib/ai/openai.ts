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
  const response = await getOpenAI().chat.completions.create({
    model: env.openaiModel,
    max_tokens: args.maxTokens ?? 1024,
    messages: [
      { role: "system", content: args.systemPrompt },
      { role: "user", content: args.userPrompt },
    ],
    response_format: { type: "json_object" },
  });

  const text = response.choices[0]?.message?.content?.trim() ?? "";
  return parseBulletArray(text);
}

/**
 * Defensive parse: handles both {"bullets":[...]} and raw [...] responses.
 */
export function parseBulletArray(raw: string): string[] {
  let cleaned = raw.trim();

  // Strip markdown code fences if added despite instructions.
  cleaned = cleaned
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned);
    // Handle {"bullets": [...]} wrapper that json_object mode may produce
    if (Array.isArray(parsed)) {
      return parsed.filter((b): b is string => typeof b === "string");
    }
    if (parsed && typeof parsed === "object") {
      const arr = parsed.bullets ?? parsed.result ?? parsed.data ?? Object.values(parsed)[0];
      if (Array.isArray(arr)) {
        return arr.filter((b): b is string => typeof b === "string");
      }
    }
  } catch {
    // fall through — try to extract raw array
  }

  // Fallback: grab first [...] block
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start !== -1 && end !== -1 && end > start) {
    try {
      const parsed = JSON.parse(cleaned.slice(start, end + 1));
      if (Array.isArray(parsed)) {
        return parsed.filter((b): b is string => typeof b === "string");
      }
    } catch {
      // give up
    }
  }

  return [];
}
