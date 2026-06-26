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
