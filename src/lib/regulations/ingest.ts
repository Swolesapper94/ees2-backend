/**
 * Regulation ingestion pipeline
 *
 * Reads a PDF, chunks it into overlapping passages, generates OpenAI embeddings,
 * and stores them in PostgreSQL (pgvector) for RAG retrieval by the support bot.
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register src/lib/regulations/ingest.ts \
 *     --file /path/to/da-pam-623-3-ncoer.pdf \
 *     --doc "DA PAM 623-3"
 */

import "dotenv/config";
import fs from "fs";
import path from "path";
import { OpenAI } from "openai";
import { PrismaClient } from "@prisma/client";

// pdf-parse v1 is CommonJS, matching this project's compiler configuration.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pdfParse = require("pdf-parse") as (
  buffer: Buffer,
  options?: Record<string, unknown>,
) => Promise<{ text: string; numpages: number }>;
const prisma = new PrismaClient();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ─── Chunking config ────────────────────────────────────────────
const CHUNK_SIZE = 700;    // target words per chunk
const CHUNK_OVERLAP = 100; // overlap words between chunks (for context continuity)
const EMBED_BATCH = 20;    // embeddings per API call (max 2048 inputs, but keep small)

// ─── Types ──────────────────────────────────────────────────────
interface Chunk {
  docTitle: string;
  section: string;
  heading: string;
  content: string;
  pageStart?: number;
  pageEnd?: number;
}

// ─── PDF → text ─────────────────────────────────────────────────
async function parsePdf(filePath: string): Promise<{ text: string; numPages: number }> {
  const buffer = fs.readFileSync(filePath);
  const data = await pdfParse(buffer);
  return { text: data.text, numPages: data.numpages };
}

// ─── Text → chunks ──────────────────────────────────────────────
function chunkText(
  text: string,
  docTitle: string,
  numPages: number,
): Chunk[] {
  const chunks: Chunk[] = [];

  // Split into paragraphs / sections by blank lines and heading markers
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length > 40); // drop short fragments

  let currentSection = "General";
  let currentHeading = docTitle;
  let buffer: string[] = [];
  let wordCount = 0;

  function flush() {
    if (buffer.length === 0) return;
    const content = buffer.join(" ").trim();
    if (content.length < 80) return; // skip stub chunks

    // Rough page estimation
    const pageStart = Math.floor((chunks.length / paragraphs.length) * numPages) + 1;

    chunks.push({
      docTitle,
      section: currentSection,
      heading: currentHeading,
      content,
      pageStart,
      pageEnd: pageStart,
    });

    // Keep overlap — last N words carry over into next chunk
    const words = buffer.join(" ").split(" ");
    const overlap = words.slice(-CHUNK_OVERLAP).join(" ");
    buffer = overlap ? [overlap] : [];
    wordCount = buffer.length;
  }

  for (const para of paragraphs) {
    // Detect chapter/section headings: all-caps or numbered e.g. "Chapter 3" / "3-1."
    const isHeading =
      /^(chapter|section|appendix|table|figure)\s+\d/i.test(para) ||
      /^\d+[-–]\d+\.?\s+[A-Z]/.test(para) ||
      (para.length < 120 && para === para.toUpperCase() && /[A-Z]{3}/.test(para));

    if (isHeading) {
      flush(); // save current buffer before starting new section
      currentSection = para.slice(0, 60).trim();
      currentHeading = para.slice(0, 100).trim();
      continue;
    }

    const words = para.split(" ");
    buffer.push(para);
    wordCount += words.length;

    if (wordCount >= CHUNK_SIZE) {
      flush();
    }
  }

  flush(); // flush remainder

  return chunks;
}

// ─── Embeddings in batches ──────────────────────────────────────
async function embedBatch(texts: string[]): Promise<number[][]> {
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small", // 1536 dims, fast & cheap ($0.02/1M tokens)
    input: texts,
  });
  return response.data.map((d) => d.embedding);
}

// ─── Upsert chunk + vector via raw SQL ──────────────────────────
async function upsertChunk(chunk: Chunk, embedding: number[]): Promise<void> {
  // First upsert the row via Prisma ORM
  const row = await prisma.regulationChunk.upsert({
    where: {
      // Unique on combo of docTitle + section + heading content hash
      // We'll use a generated field below instead — for now use create+catch
      id: "placeholder", // will be overridden
    },
    create: {
      docTitle: chunk.docTitle,
      section:  chunk.section,
      heading:  chunk.heading,
      content:  chunk.content,
      pageStart: chunk.pageStart,
      pageEnd:   chunk.pageEnd,
    },
    update: {
      content:   chunk.content,
      pageStart: chunk.pageStart,
      pageEnd:   chunk.pageEnd,
    },
  }).catch(async () => {
    // Fallback: plain create
    return prisma.regulationChunk.create({
      data: {
        docTitle:  chunk.docTitle,
        section:   chunk.section,
        heading:   chunk.heading,
        content:   chunk.content,
        pageStart: chunk.pageStart,
        pageEnd:   chunk.pageEnd,
      },
    });
  });

  // Then write the vector via raw SQL (Prisma doesn't support vector type)
  await prisma.$executeRawUnsafe(
    `UPDATE regulation_chunks SET embedding = $1::vector WHERE id = $2`,
    `[${embedding.join(",")}]`,
    row.id,
  );
}

// ─── Main ───────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const fileIdx = args.indexOf("--file");
  const docIdx  = args.indexOf("--doc");

  if (fileIdx === -1) {
    console.error("Usage: ingest.ts --file <path> [--doc <title>]");
    process.exit(1);
  }

  const filePath = args[fileIdx + 1];
  if (!filePath) {
    console.error("Usage: ingest.ts --file <path> [--doc <title>]");
    return;
  }
  const suppliedDocTitle = docIdx !== -1 ? args[docIdx + 1] : undefined;
  const docTitle = suppliedDocTitle?.trim() || path.basename(filePath, ".pdf");

  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  console.log(`\n📄  Parsing: ${filePath}`);
  const { text, numPages } = await parsePdf(filePath);
  console.log(`    Pages: ${numPages} | Characters: ${text.length.toLocaleString()}`);

  const chunks = chunkText(text, docTitle, numPages);
  console.log(`✂️   Chunks created: ${chunks.length}`);

  // Wipe existing chunks for this document before re-indexing
  const deleted = await prisma.regulationChunk.deleteMany({
    where: { docTitle },
  });
  if (deleted.count > 0) {
    console.log(`🗑   Removed ${deleted.count} existing chunks for "${docTitle}"`);
  }

  // Embed + store in batches
  let done = 0;
  for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
    const batch = chunks.slice(i, i + EMBED_BATCH);
    const texts = batch.map(
      (c) => `${c.docTitle} | ${c.section} | ${c.heading}\n\n${c.content}`,
    );

    const embeddings = await embedBatch(texts);

    await Promise.all(batch.map((chunk, index) => {
      const embedding = embeddings[index];
      if (!embedding) throw new Error(`Embedding response omitted item ${index} in batch.`);
      return upsertChunk(chunk, embedding);
    }));

    done += batch.length;
    process.stdout.write(`\r⚡  Indexed: ${done}/${chunks.length}`);
  }

  console.log(`\n✅  Done! Indexed ${chunks.length} chunks from "${docTitle}".`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  prisma.$disconnect();
  process.exit(1);
});
