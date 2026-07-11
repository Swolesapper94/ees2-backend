/**
 * Regulation RAG (Retrieval-Augmented Generation) search
 *
 * Given a user query, embeds it and returns the top-K most semantically
 * similar regulation chunks from the pgvector table.
 *
 * NOTE: If the embedding column does not exist in the database, this
 * gracefully returns an empty array. The database migration must be run
 * to enable vector search (see prisma/migrations).
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
 *
 * If the embedding column doesn't exist, returns empty array (graceful degradation).
 */
export async function searchRegulations(
  query: string,
  topK = 4,
): Promise<RegChunk[]> {
  try {
    // Generate embedding for the user's query
    const { data } = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: query.slice(0, 1000), // truncate to avoid token limit
    });

    const embedding = data[0]?.embedding;
    if (!embedding) return [];
    const vector = `[${embedding.join(",")}]`;

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
  } catch (error: any) {
    // Graceful degradation: if embedding column doesn't exist, log and return empty
    if (error?.meta?.code === "42703" && error?.meta?.message?.includes("embedding")) {
      console.warn(
        "[searchRegulations] Embedding column not found. Vector search unavailable. " +
        "Run `npx prisma migrate deploy` to enable this feature.",
      );
      return [];
    }

    // Re-throw other errors
    throw error;
  }
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
