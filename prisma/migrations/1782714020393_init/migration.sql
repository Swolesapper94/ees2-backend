-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Rank" AS ENUM ('PVT', 'PV2', 'PFC', 'SPC', 'CPL', 'SGT', 'SSG', 'SFC', 'MSG', 'FIRST_SERGEANT', 'SGM', 'CSM', 'SMA', 'WO1', 'CW2', 'CW3', 'CW4', 'CW5', 'SECOND_LT', 'FIRST_LT', 'CPT', 'MAJ', 'LTC', 'COL', 'BG', 'MG', 'LTG', 'GEN', 'GA');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SOLDIER', 'RATER', 'SENIOR_RATER', 'REVIEWER', 'COMMANDER', 'ADMIN');

-- CreateEnum
CREATE TYPE "EvalFormType" AS ENUM ('NCOER_9_1', 'NCOER_9_2', 'NCOER_9_3', 'OER_67_10_1', 'OER_67_10_1A', 'OER_67_10_2', 'OER_67_10_2A', 'OER_67_10_3', 'OER_67_10_4');

-- CreateEnum
CREATE TYPE "RatingBinary" AS ENUM ('MET_STANDARD', 'DID_NOT_MEET_STANDARD');

-- CreateEnum
CREATE TYPE "RatingFourLevel" AS ENUM ('NOT_MET_STANDARD', 'QUALIFIED', 'EXCEEDED_STANDARD', 'FAR_EXCEEDED_STANDARD');

-- CreateEnum
CREATE TYPE "SeniorRaterRating" AS ENUM ('MOST_QUALIFIED', 'HIGHLY_QUALIFIED', 'QUALIFIED', 'NOT_QUALIFIED');

-- CreateEnum
CREATE TYPE "EvalStatus" AS ENUM ('DRAFT', 'RATER_IN_PROGRESS', 'PENDING_SENIOR_RATER', 'PENDING_SOLDIER_ACK', 'PENDING_SUPPLEMENTARY_REVIEW', 'COMPLETE', 'SUBMITTED', 'ACCEPTED', 'RETURNED');

-- CreateEnum
CREATE TYPE "SectionKey" AS ENUM ('CHARACTER', 'PRESENCE', 'INTELLECT', 'LEADS', 'DEVELOPS', 'ACHIEVES', 'RATER_OVERALL', 'SENIOR_RATER_OVERALL', 'SOLDIER_COMMENTS');

-- CreateEnum
CREATE TYPE "EntryType" AS ENUM ('OBJECTIVE', 'ACCOMPLISHMENT');

-- CreateEnum
CREATE TYPE "SignatureStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'SIGNED', 'DECLINED');

-- CreateEnum
CREATE TYPE "SupportFormUploadStatus" AS ENUM ('PENDING_EXTRACT', 'EXTRACTING', 'PENDING_PARSE', 'PARSING', 'PENDING_BULLETS', 'GENERATING', 'COMPLETE', 'FAILED');

-- CreateEnum
CREATE TYPE "AIBulletStatus" AS ENUM ('PENDING_REVIEW', 'ACCEPTED', 'EDITED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AIBulletConfidence" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "StaleReason" AS ENUM ('FIELD_EDIT', 'ADMIN_CORRECTION');

-- CreateEnum
CREATE TYPE "CounselingType" AS ENUM ('INITIAL', 'QUARTERLY');

-- CreateEnum
CREATE TYPE "ReturnReason" AS ENUM ('ADMIN_ERROR', 'PROHIBITED_LANGUAGE', 'MISSING_SIGNATURE', 'RATING_PERIOD_ERROR', 'OTHER');

-- CreateEnum
CREATE TYPE "NotificationCategory" AS ENUM ('EVAL_LIFECYCLE', 'MILESTONE', 'COLLABORATION', 'DELEGATE', 'SYSTEM');

-- CreateEnum
CREATE TYPE "MilestoneType" AS ENUM ('INITIAL_COUNSELING_DUE', 'QUARTERLY_COUNSELING_1', 'QUARTERLY_COUNSELING_2', 'QUARTERLY_COUNSELING_3', 'RATER_SECTION_DUE', 'SENIOR_RATER_DUE', 'SOLDIER_ACK_DUE', 'EVAL_SUBMISSION_DUE');

-- CreateEnum
CREATE TYPE "MilestoneStatus" AS ENUM ('UPCOMING', 'DUE_SOON', 'OVERDUE', 'COMPLETE', 'WAIVED');

-- CreateEnum
CREATE TYPE "CommentStatus" AS ENUM ('OPEN', 'RESOLVED', 'ACKNOWLEDGED');

-- CreateEnum
CREATE TYPE "DelegateAccessLevel" AS ENUM ('VIEW_ONLY', 'PUSH_ALONG');

-- CreateTable
CREATE TABLE "units" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "uic" TEXT,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "supabaseId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "rank" "Rank" NOT NULL,
    "mos" TEXT NOT NULL,
    "roles" "UserRole"[],
    "unitId" TEXT,
    "dodid" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rating_chains" (
    "id" TEXT NOT NULL,
    "ratedSoldierId" TEXT NOT NULL,
    "raterId" TEXT NOT NULL,
    "seniorRaterId" TEXT NOT NULL,
    "reviewerId" TEXT,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rating_chains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "counseling_sessions" (
    "id" TEXT NOT NULL,
    "ratingChainId" TEXT NOT NULL,
    "type" "CounselingType" NOT NULL,
    "sessionDate" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "raterInitials" TEXT,
    "soldierInitials" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "counseling_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_forms" (
    "id" TEXT NOT NULL,
    "soldierId" TEXT NOT NULL,
    "ratingPeriodStart" TIMESTAMP(3) NOT NULL,
    "ratingPeriodEnd" TIMESTAMP(3),
    "dutyTitle" TEXT NOT NULL,
    "dutyMosc" TEXT NOT NULL,
    "dailyDutiesScope" TEXT,
    "areasOfEmphasis" TEXT,
    "appointedDuties" TEXT,
    "soldierGoals" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_forms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_form_entries" (
    "id" TEXT NOT NULL,
    "supportFormId" TEXT NOT NULL,
    "entryDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "section" "SectionKey" NOT NULL,
    "entryType" "EntryType" NOT NULL,
    "rawText" TEXT NOT NULL,
    "tags" TEXT[],
    "isHighlight" BOOLEAN NOT NULL DEFAULT false,
    "counseled" BOOLEAN NOT NULL DEFAULT false,
    "counseledDate" TIMESTAMP(3),
    "usedInEvalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_form_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluations" (
    "id" TEXT NOT NULL,
    "ratingChainId" TEXT NOT NULL,
    "supportFormId" TEXT,
    "formType" "EvalFormType" NOT NULL,
    "status" "EvalStatus" NOT NULL DEFAULT 'DRAFT',
    "requiresSupplementaryReview" BOOLEAN NOT NULL DEFAULT false,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "ratedMonths" INTEGER NOT NULL,
    "nonRatedMonths" INTEGER NOT NULL DEFAULT 0,
    "nonRatedCodes" TEXT,
    "reasonForSubmission" TEXT NOT NULL,
    "statusCode" TEXT,
    "numberOfEnclosures" INTEGER NOT NULL DEFAULT 0,
    "principalDutyTitle" TEXT,
    "dutyMosc" TEXT,
    "dailyDutiesScope" TEXT,
    "areasOfSpecialEmphasis" TEXT,
    "appointedDuties" TEXT,
    "successiveAssignment1" TEXT,
    "successiveAssignment2" TEXT,
    "broadeningAssignment" TEXT,
    "seniorRaterRating" "SeniorRaterRating",
    "acftPassFail" TEXT,
    "acftDate" TIMESTAMP(3),
    "heightInches" INTEGER,
    "weightLbs" INTEGER,
    "withinWeightStandard" BOOLEAN,
    "submittedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluation_returns" (
    "id" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "returnReason" "ReturnReason" NOT NULL,
    "returnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evaluation_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eval_sections" (
    "id" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "section" "SectionKey" NOT NULL,
    "ratingBinary" "RatingBinary",
    "ratingFourLevel" "RatingFourLevel",
    "stagingBullets" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "finalBullets" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "bulletSources" JSONB,
    "isComplete" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "eval_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "senior_rater_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "profileData" JSONB NOT NULL DEFAULT '{}',
    "lastUpdated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "senior_rater_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signatures" (
    "id" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "status" "SignatureStatus" NOT NULL DEFAULT 'PENDING',
    "signedAt" TIMESTAMP(3),
    "declineReason" TEXT,
    "notifiedAt" TIMESTAMP(3),
    "nameConfirmation" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "cacCertSerial" TEXT,
    "pkiTokenHash" TEXT,
    "contentHash" TEXT,
    "isStale" BOOLEAN NOT NULL DEFAULT false,
    "staledAt" TIMESTAMP(3),
    "staledByUserId" TEXT,
    "staledReason" "StaleReason",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "signatures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_generations" (
    "id" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "section" "SectionKey" NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "raterResponses" JSONB,
    "entryIds" TEXT[],
    "outputBullets" TEXT[],
    "selectionLog" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_generations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "evaluationId" TEXT,
    "category" "NotificationCategory" NOT NULL DEFAULT 'SYSTEM',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "actionUrl" TEXT,
    "actionLabel" TEXT,
    "isDismissed" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "evaluationId" TEXT,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eval_milestones" (
    "id" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "type" "MilestoneType" NOT NULL,
    "status" "MilestoneStatus" NOT NULL DEFAULT 'UPCOMING',
    "dueDate" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "waivedAt" TIMESTAMP(3),
    "waivedById" TEXT,
    "waivedReason" TEXT,
    "notifiedAt" TIMESTAMP(3),
    "escalatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "eval_milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eval_comments" (
    "id" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "sectionKey" "SectionKey",
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" "CommentStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "eval_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delegates" (
    "id" TEXT NOT NULL,
    "principalId" TEXT NOT NULL,
    "delegateUserId" TEXT NOT NULL,
    "accessLevel" "DelegateAccessLevel" NOT NULL DEFAULT 'VIEW_ONLY',
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "expiryDate" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "appointedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delegates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regulation_chunks" (
    "id" TEXT NOT NULL,
    "docTitle" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "heading" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "pageStart" INTEGER,
    "pageEnd" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "regulation_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_form_uploads" (
    "id" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "parseStatus" "SupportFormUploadStatus" NOT NULL DEFAULT 'PENDING_EXTRACT',
    "parseError" TEXT,
    "rawExtract" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_form_uploads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_extracted_entries" (
    "id" TEXT NOT NULL,
    "uploadId" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "section" "SectionKey" NOT NULL,
    "what" TEXT NOT NULL,
    "impact" TEXT,
    "date" TEXT,
    "context" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_extracted_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_bullet_suggestions" (
    "id" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "uploadId" TEXT,
    "sectionKey" "SectionKey" NOT NULL,
    "text" TEXT NOT NULL,
    "confidence" "AIBulletConfidence" NOT NULL DEFAULT 'MEDIUM',
    "rank" INTEGER NOT NULL,
    "status" "AIBulletStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "editedText" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "sourceEntryIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_bullet_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "units_uic_key" ON "units"("uic");

-- CreateIndex
CREATE UNIQUE INDEX "users_supabaseId_key" ON "users"("supabaseId");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_dodid_key" ON "users"("dodid");

-- CreateIndex
CREATE UNIQUE INDEX "eval_sections_evaluationId_section_key" ON "eval_sections"("evaluationId", "section");

-- CreateIndex
CREATE UNIQUE INDEX "senior_rater_profiles_userId_key" ON "senior_rater_profiles"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "signatures_evaluationId_role_key" ON "signatures"("evaluationId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "eval_milestones_evaluationId_type_key" ON "eval_milestones"("evaluationId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "delegates_principalId_delegateUserId_key" ON "delegates"("principalId", "delegateUserId");

-- CreateIndex
CREATE INDEX "regulation_chunks_docTitle_section_idx" ON "regulation_chunks"("docTitle", "section");

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rating_chains" ADD CONSTRAINT "rating_chains_ratedSoldierId_fkey" FOREIGN KEY ("ratedSoldierId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rating_chains" ADD CONSTRAINT "rating_chains_raterId_fkey" FOREIGN KEY ("raterId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rating_chains" ADD CONSTRAINT "rating_chains_seniorRaterId_fkey" FOREIGN KEY ("seniorRaterId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rating_chains" ADD CONSTRAINT "rating_chains_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counseling_sessions" ADD CONSTRAINT "counseling_sessions_ratingChainId_fkey" FOREIGN KEY ("ratingChainId") REFERENCES "rating_chains"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_forms" ADD CONSTRAINT "support_forms_soldierId_fkey" FOREIGN KEY ("soldierId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_form_entries" ADD CONSTRAINT "support_form_entries_supportFormId_fkey" FOREIGN KEY ("supportFormId") REFERENCES "support_forms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_ratingChainId_fkey" FOREIGN KEY ("ratingChainId") REFERENCES "rating_chains"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_supportFormId_fkey" FOREIGN KEY ("supportFormId") REFERENCES "support_forms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_returns" ADD CONSTRAINT "evaluation_returns_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "evaluations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eval_sections" ADD CONSTRAINT "eval_sections_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "evaluations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "senior_rater_profiles" ADD CONSTRAINT "senior_rater_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signatures" ADD CONSTRAINT "signatures_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "evaluations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signatures" ADD CONSTRAINT "signatures_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "evaluations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "evaluations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "evaluations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eval_milestones" ADD CONSTRAINT "eval_milestones_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "evaluations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eval_comments" ADD CONSTRAINT "eval_comments_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "evaluations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eval_comments" ADD CONSTRAINT "eval_comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eval_comments" ADD CONSTRAINT "eval_comments_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "eval_comments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delegates" ADD CONSTRAINT "delegates_principalId_fkey" FOREIGN KEY ("principalId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delegates" ADD CONSTRAINT "delegates_delegateUserId_fkey" FOREIGN KEY ("delegateUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_form_uploads" ADD CONSTRAINT "support_form_uploads_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "evaluations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_form_uploads" ADD CONSTRAINT "support_form_uploads_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_extracted_entries" ADD CONSTRAINT "ai_extracted_entries_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "support_form_uploads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_bullet_suggestions" ADD CONSTRAINT "ai_bullet_suggestions_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "evaluations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_bullet_suggestions" ADD CONSTRAINT "ai_bullet_suggestions_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "support_form_uploads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

