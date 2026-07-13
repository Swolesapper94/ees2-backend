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

export async function generateBullets(
  args: GenerateBulletsArgs,
): Promise<string[]> {
  const message = await getOpenAI().chat.completions.create({
    model: env.openaiModel,
    max_completion_tokens: args.maxTokens ?? 1024,
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

export async function extractTextFromImage(args: {
  imageBase64: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  systemPrompt: string;
}): Promise<string> {
  const message = await getOpenAI().chat.completions.create({
    model: env.openaiModel,
    max_completion_tokens: 4096,
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

export async function callOpenAIForJson<T = unknown>(args: {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
}): Promise<T> {
  const message = await getOpenAI().chat.completions.create({
    model: env.openaiModel,
    max_completion_tokens: args.maxTokens ?? 2048,
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

  text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

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

export function sanitizeBulletText(text: string): string {
  return text
    .replace(/\s*[\u2014\u2013]\s*/g, ", ")
    .replace(/,\s*,/g, ",")
    .replace(/,\s*$/g, "")
    .trim();
}

export function parseBulletArray(raw: string): string[] {
  let cleaned = raw.trim();
  cleaned = cleaned
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start !== -1 && end !== -1 && end > start) {
    cleaned = cleaned.slice(start, end + 1);
  }

  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
      return parsed.filter((bullet): bullet is string => typeof bullet === "string");
    }
  } catch {
    // Return an empty list when the model response is not a JSON array.
  }
  return [];
}

