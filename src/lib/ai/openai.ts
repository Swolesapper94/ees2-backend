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

