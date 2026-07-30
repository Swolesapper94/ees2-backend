ALTER TABLE "support_form_entries"
ADD COLUMN "clientRequestId" TEXT;

CREATE TYPE "EntrySubmissionSource" AS ENUM ('MERIT_PLATFORM', 'MOBILE_CAPTURE');

ALTER TABLE "support_form_entries"
ADD COLUMN "submissionSource" "EntrySubmissionSource" NOT NULL DEFAULT 'MERIT_PLATFORM';

ALTER TABLE "support_form_entries"
ADD COLUMN "withdrawnAt" TIMESTAMP(3),
ADD COLUMN "withdrawnById" TEXT,
ADD COLUMN "withdrawalReason" TEXT;

CREATE UNIQUE INDEX "support_form_entries_clientRequestId_key"
ON "support_form_entries"("clientRequestId");