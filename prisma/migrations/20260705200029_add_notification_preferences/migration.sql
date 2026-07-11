/*
  Warnings:

  - You are about to drop the column `embedding` on the `regulation_chunks` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "idx_regulation_chunks_embedding";

-- AlterTable
ALTER TABLE "regulation_chunks" DROP COLUMN "embedding";

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "notificationPreferences" JSONB;
