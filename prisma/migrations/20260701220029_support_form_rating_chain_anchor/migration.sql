-- CreateEnum
CREATE TYPE "EvalCategory" AS ENUM ('NCOER', 'OER');

-- AlterTable
ALTER TABLE "support_forms" ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "evalCategory" "EvalCategory",
ADD COLUMN     "ratingChainId" TEXT,
ADD COLUMN     "ssdNcoesMet" BOOLEAN;

-- AddForeignKey
ALTER TABLE "support_forms" ADD CONSTRAINT "support_forms_ratingChainId_fkey" FOREIGN KEY ("ratingChainId") REFERENCES "rating_chains"("id") ON DELETE SET NULL ON UPDATE CASCADE;
