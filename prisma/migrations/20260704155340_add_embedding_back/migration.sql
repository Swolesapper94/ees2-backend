-- Restore the embedding column that was accidentally dropped
-- This enables vector search for regulation chunks

-- Add the embedding column back to regulation_chunks
ALTER TABLE "regulation_chunks" ADD COLUMN "embedding" vector(1536);

-- Recreate the index for fast vector search
CREATE INDEX "idx_regulation_chunks_embedding" ON "regulation_chunks" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 100);
