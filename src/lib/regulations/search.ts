/**
 * Regulation RAG (Retrieval-Augmented Generation) search
 *
 * Given a user query, embeds it and returns the top-K most semantically
 * similar regulation chunks from the pgvector table.
 */

import { OpenAI } from "openai";
import { prisma } from "@/lib/prisma";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface RegChunk {
  id: string;
  docTitle: string;
  section: string;
  heading: string;
  content: string;
  pageStart: number | null;
  similarity: number;
}

/**
 * Returns the top-K most relevant regulation chunks for a given query.
 * Uses cosine similarity (<=> operator) on the pgvector embedding column.
 */
export async function searchRegulations(
  query: string,
  topK = 4,
): Promise<RegChunk[]> {
  // Generate embedding for the user's query
  const { data } = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: query.slice(0, 1000), // truncate to avoid token limit
  });

  const vector = `[${data[0].embedding.join(",")}]`;

  // cosine similarity search — <=> is pgvector's cosine distance operator
  const rows = await prisma.$queryRawUnsafe<RegChunk[]>(
    `SELECT
       id,
       "docTitle",
       section,
       heading,
       content,
       "pageStart",
       1 - (embedding <=> $1::vector) AS similarity
     FROM regulation_chunks
     WHERE embedding IS NOT NULL
     ORDER BY embedding <=> $1::vector
     LIMIT $2`,
    vector,
    topK,
  );

  return rows;
}

/**
 * Formats retrieved chunks into a context block suitable for injecting
 * into the OpenAI system prompt.
 */
export function formatContext(chunks: RegChunk[]): string {
  if (chunks.length === 0) return "";

  return chunks
    .map(
      (c) =>
        `**${c.docTitle}${c.pageStart ? ` (p.${c.pageStart})` : ""} — ${c.heading}**\n${c.content}`,
    )
    .join("\n\n---\n\n");
}
