-- CreateEnum
CREATE TYPE "ArtifactType" AS ENUM ('CERTIFICATE', 'SCORE_SHEET', 'PHOTO', 'DOCUMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "ArtifactCaptionStatus" AS ENUM ('PENDING', 'COMPLETE', 'FAILED');

-- CreateTable
CREATE TABLE "support_form_entry_artifacts" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "type" "ArtifactType" NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "aiCaption" TEXT,
    "aiCaptionStatus" "ArtifactCaptionStatus" NOT NULL DEFAULT 'PENDING',
    "aiCaptionError" TEXT,
    "flaggedByServiceMember" BOOLEAN NOT NULL DEFAULT false,
    "flagNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_form_entry_artifacts_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "support_form_entry_artifacts" ADD CONSTRAINT "support_form_entry_artifacts_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "support_form_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
