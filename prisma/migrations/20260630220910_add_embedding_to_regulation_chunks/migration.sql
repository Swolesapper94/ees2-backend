-- Enable pgvector extension for vector similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- AlterTable
ALTER TABLE "regulation_chunks" ADD COLUMN "embedding" vector(1536);

-- Create index for faster similarity search
CREATE INDEX "idx_regulation_chunks_embedding" ON "regulation_chunks" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 100);

