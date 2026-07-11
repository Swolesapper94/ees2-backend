-- AlterTable
ALTER TABLE "regulation_chunks" ADD COLUMN     "embedding" vector(1536);

-- Recreate the ivfflat index for fast vector search (Prisma's schema diff
-- can't generate this — the column type itself is declared `Unsupported`
-- specifically so this ADD COLUMN survives future `migrate dev` runs, but
-- the index still has to be hand-maintained here).
CREATE INDEX "idx_regulation_chunks_embedding" ON "regulation_chunks" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 100);
