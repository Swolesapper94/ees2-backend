CREATE TYPE "ObservationFeedbackType" AS ENUM ('POSITIVE', 'DEVELOPMENTAL', 'NEUTRAL');
CREATE TYPE "ObservationReleaseState" AS ENUM ('PRIVATE_TO_RATER', 'RELEASED_IN_COUNSELING');

CREATE TABLE "performance_observations" (
    "id" TEXT NOT NULL,
    "supportFormId" TEXT NOT NULL,
    "ratedSoldierId" TEXT NOT NULL,
    "observerId" TEXT NOT NULL,
    "goalId" TEXT,
    "sectionKey" "SectionKey" NOT NULL,
    "feedbackType" "ObservationFeedbackType" NOT NULL,
    "factualNote" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[] NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "releaseState" "ObservationReleaseState" NOT NULL DEFAULT 'PRIVATE_TO_RATER',
    "discussedAt" TIMESTAMP(3),
    "discussedInCounselingSessionId" TEXT,
    "lastEditedAt" TIMESTAMP(3),
    "lastEditedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "performance_observations_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ai_bullet_suggestions" ADD COLUMN "evidenceReferences" JSONB;

CREATE INDEX "performance_observations_supportFormId_occurredAt_idx" ON "performance_observations"("supportFormId", "occurredAt");
CREATE INDEX "performance_observations_goalId_idx" ON "performance_observations"("goalId");
CREATE INDEX "performance_observations_ratedSoldierId_releaseState_idx" ON "performance_observations"("ratedSoldierId", "releaseState");

ALTER TABLE "performance_observations" ADD CONSTRAINT "performance_observations_supportFormId_fkey" FOREIGN KEY ("supportFormId") REFERENCES "support_forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "performance_observations" ADD CONSTRAINT "performance_observations_ratedSoldierId_fkey" FOREIGN KEY ("ratedSoldierId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "performance_observations" ADD CONSTRAINT "performance_observations_observerId_fkey" FOREIGN KEY ("observerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "performance_observations" ADD CONSTRAINT "performance_observations_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "goals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "performance_observations" ADD CONSTRAINT "performance_observations_discussedInCounselingSessionId_fkey" FOREIGN KEY ("discussedInCounselingSessionId") REFERENCES "counseling_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;