/*
  Warnings:

  - You are about to drop the `ai_generations` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "EntryConfirmationStatus" AS ENUM ('UNREVIEWED', 'CONFIRMED', 'NEEDS_CLARIFICATION', 'NOT_USED');

-- DropForeignKey
ALTER TABLE "ai_generations" DROP CONSTRAINT "ai_generations_evaluationId_fkey";

-- AlterTable
ALTER TABLE "support_form_entries" ADD COLUMN     "clarificationNote" TEXT,
ADD COLUMN     "confirmationStatus" "EntryConfirmationStatus" NOT NULL DEFAULT 'UNREVIEWED',
ADD COLUMN     "confirmedAt" TIMESTAMP(3),
ADD COLUMN     "confirmedById" TEXT;

-- DropTable
DROP TABLE "ai_generations";
