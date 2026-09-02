CREATE TYPE "PilotWorkflowType" AS ENUM ('SOLDIER_ENTRY', 'RATER_OBSERVATION');
CREATE TYPE "PilotMetricEventType" AS ENUM ('WORKFLOW_STARTED', 'EVIDENCE_STEP_REACHED', 'WORKFLOW_COMPLETED', 'WORKFLOW_FAILED', 'DRAFT_RECOVERED');

ALTER TABLE "performance_observations"
ADD COLUMN "captureSource" "EntrySubmissionSource" NOT NULL DEFAULT 'MERIT_PLATFORM',
ADD COLUMN "clientRequestId" TEXT;

CREATE UNIQUE INDEX "performance_observations_clientRequestId_key"
ON "performance_observations"("clientRequestId");

CREATE INDEX "performance_observations_captureSource_createdAt_idx"
ON "performance_observations"("captureSource", "createdAt");

CREATE TABLE "pilot_metric_events" (
    "id" TEXT NOT NULL,
    "clientEventId" TEXT NOT NULL,
    "pilotId" TEXT NOT NULL DEFAULT 'MERIT_MOBILE_PILOT',
    "actorId" TEXT NOT NULL,
    "unitId" TEXT,
    "workflowId" TEXT NOT NULL,
    "workflowType" "PilotWorkflowType" NOT NULL,
    "eventType" "PilotMetricEventType" NOT NULL,
    "client" TEXT NOT NULL DEFAULT 'MERIT_MOBILE',
    "durationMs" INTEGER,
    "hasEvidence" BOOLEAN,
    "evidenceCount" INTEGER,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pilot_metric_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pilot_metric_events_clientEventId_key"
ON "pilot_metric_events"("clientEventId");

CREATE INDEX "pilot_metric_events_pilotId_unitId_occurredAt_idx"
ON "pilot_metric_events"("pilotId", "unitId", "occurredAt");

CREATE INDEX "pilot_metric_events_actorId_occurredAt_idx"
ON "pilot_metric_events"("actorId", "occurredAt");

CREATE INDEX "pilot_metric_events_workflowId_eventType_idx"
ON "pilot_metric_events"("workflowId", "eventType");

CREATE UNIQUE INDEX "pilot_metric_events_actorId_workflowId_eventType_key"
ON "pilot_metric_events"("actorId", "workflowId", "eventType");

ALTER TABLE "pilot_metric_events"
ADD CONSTRAINT "pilot_metric_events_actorId_fkey"
FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pilot_metric_events"
ADD CONSTRAINT "pilot_metric_events_unitId_fkey"
FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;
