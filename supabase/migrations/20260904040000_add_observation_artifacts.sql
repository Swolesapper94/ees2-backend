CREATE TABLE "public"."performance_observation_artifacts" (
    "id" TEXT NOT NULL,
    "observationId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "type" "public"."ArtifactType" NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "aiCaption" TEXT,
    "aiCaptionStatus" "public"."ArtifactCaptionStatus" NOT NULL DEFAULT 'PENDING',
    "aiCaptionError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "performance_observation_artifacts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "performance_observation_artifacts_observationId_idx"
ON "public"."performance_observation_artifacts"("observationId");

ALTER TABLE "public"."performance_observation_artifacts"
ADD CONSTRAINT "performance_observation_artifacts_observationId_fkey"
FOREIGN KEY ("observationId") REFERENCES "public"."performance_observations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."performance_observation_artifacts" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "public"."performance_observation_artifacts" FROM "anon", "authenticated";
