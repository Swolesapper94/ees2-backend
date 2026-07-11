-- AlterTable
ALTER TABLE "ai_bullet_suggestions" ADD COLUMN     "sourceSnapshot" JSONB,
ADD COLUMN     "unsupportedClaims" JSONB;

-- AlterTable
ALTER TABLE "eval_sections" ADD COLUMN     "bulletProvenance" JSONB;
