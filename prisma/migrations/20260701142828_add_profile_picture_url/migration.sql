/*
  Warnings:

  - The values [UNIT_COMMANDER,UNIT_ENLISTED_LEADER] on the enum `UserRole` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `embedding` on the `regulation_chunks` table. All the data in the column will be lost.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "UserRole_new" AS ENUM ('SOLDIER', 'RATER', 'SENIOR_RATER', 'REVIEWER', 'COMMANDER', 'ADMIN');
ALTER TABLE "users" ALTER COLUMN "roles" TYPE "UserRole_new"[] USING ("roles"::text::"UserRole_new"[]);
ALTER TABLE "signatures" ALTER COLUMN "role" TYPE "UserRole_new" USING ("role"::text::"UserRole_new");
ALTER TYPE "UserRole" RENAME TO "UserRole_old";
ALTER TYPE "UserRole_new" RENAME TO "UserRole";
DROP TYPE "public"."UserRole_old";
COMMIT;

-- AlterTable
ALTER TABLE "regulation_chunks" DROP COLUMN "embedding";

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "profilePictureUrl" TEXT;
