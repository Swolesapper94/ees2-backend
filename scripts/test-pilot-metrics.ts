import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";

type ApiResult = { status: number; body: Record<string, unknown> };

async function main() {
  if (!process.env.DATABASE_URL?.includes("merit_test")) {
    throw new Error("Pilot metrics integration tests may run only against the disposable merit_test database.");
  }

  const unit = await prisma.unit.findUniqueOrThrow({ where: { id: "dev-unit-721st-engineer" } });
  const existingUnitAdmin = await prisma.user.findUnique({ where: { email: "avery.quinn@army.mil" } });
  await prisma.user.upsert({
    where: { email: "avery.quinn@army.mil" },
    update: { roles: ["SOLDIER", "ADMIN"], applicationSupportRole: "NONE", unitId: unit.id },
    create: {
      id: "dev-admin-quinn",
      supabaseId: "dev-admin-quinn",
      email: "avery.quinn@army.mil",
      firstName: "Avery",
      lastName: "Quinn",
      rank: "CPT",
      mos: "42B",
      roles: ["SOLDIER", "ADMIN"],
      applicationSupportRole: "NONE",
      unitId: unit.id,
      category: "OFFICER",
    },
  });

  const app = createApp();
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}/api`;

  const request = async (path: string, token: string, init: RequestInit = {}): Promise<ApiResult> => {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    if (init.body) headers.set("Content-Type", "application/json");
    const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
    const body = await response.json().catch(() => ({})) as Record<string, unknown>;
    return { status: response.status, body };
  };

  const smith = "dev:peter.smith@army.mil:testpass";
  const commander = "dev:morgan.reed@army.mil:testpass";
  const unitAdmin = "dev:avery.quinn@army.mil:testpass";
  const davis = "dev:james.davis@army.mil:testpass";
  const workflowId = randomUUID();
  const completionEventId = randomUUID();

  try {
    const godSummary = await request("/pilot-metrics/summary?days=30", smith);
    assert.equal(godSummary.status, 200, "platform administrator should see pilot KPIs");
    assert.equal((godSummary.body.privacy as { aggregationOnly?: boolean }).aggregationOnly, true);

    assert.equal((await request("/pilot-metrics/summary?days=30", commander)).status, 403, "Army commander must not inherit KPI access");
    assert.equal((await request("/pilot-metrics/summary?days=30", unitAdmin)).status, 403, "unit ADMIN must not inherit platform access");

    const start = await request("/pilot-metrics/events", davis, {
      method: "POST",
      headers: { "X-MERIT-CLIENT": "mobile" },
      body: JSON.stringify({
        clientEventId: randomUUID(),
        pilotId: "MERIT_MOBILE_PILOT",
        workflowId,
        workflowType: "SOLDIER_ENTRY",
        eventType: "WORKFLOW_STARTED",
        occurredAt: new Date().toISOString(),
      }),
    });
    assert.equal(start.status, 201, "authenticated mobile workflow start should be recorded");

    const prematureCompletion = await request("/pilot-metrics/events", davis, {
      method: "POST",
      headers: { "X-MERIT-CLIENT": "mobile" },
      body: JSON.stringify({
        clientEventId: completionEventId,
        pilotId: "MERIT_MOBILE_PILOT",
        workflowId,
        workflowType: "SOLDIER_ENTRY",
        eventType: "WORKFLOW_COMPLETED",
        durationMs: 42_000,
        hasEvidence: false,
        evidenceCount: 0,
        occurredAt: new Date().toISOString(),
      }),
    });
    assert.equal(prematureCompletion.status, 409, "completion must be backed by a saved domain record");

    const entry = await request("/support-forms/dev-sf-davis-mobile-2026/entries", davis, {
      method: "POST",
      headers: { "X-MERIT-CLIENT": "mobile" },
      body: JSON.stringify({
        clientRequestId: workflowId,
        section: "ACHIEVES",
        entryType: "ACCOMPLISHMENT",
        rawText: "Pilot integration test entry",
        tags: ["automated-test"],
        entryDate: new Date().toISOString(),
      }),
    });
    assert.equal(entry.status, 201, "mobile domain record should be saved");

    const completionPayload = {
      clientEventId: completionEventId,
      pilotId: "MERIT_MOBILE_PILOT",
      workflowId,
      workflowType: "SOLDIER_ENTRY",
      eventType: "WORKFLOW_COMPLETED",
      durationMs: 42_000,
      hasEvidence: false,
      evidenceCount: 0,
      occurredAt: new Date().toISOString(),
    };
    const completion = await request("/pilot-metrics/events", davis, {
      method: "POST",
      headers: { "X-MERIT-CLIENT": "mobile" },
      body: JSON.stringify(completionPayload),
    });
    assert.equal(completion.status, 201, "saved mobile record should unlock completion telemetry");

    const duplicate = await request("/pilot-metrics/events", davis, {
      method: "POST",
      headers: { "X-MERIT-CLIENT": "mobile" },
      body: JSON.stringify({ ...completionPayload, clientEventId: randomUUID() }),
    });
    assert.equal(duplicate.status, 200, "workflow milestones should be logically idempotent even with a new event identifier");

    const updatedSummary = await request("/pilot-metrics/summary?days=30", smith);
    assert.equal(updatedSummary.status, 200);
    const adoption = updatedSummary.body.adoption as { activeParticipants: number; workflowsCompleted: number };
    const outcomes = updatedSummary.body.outcomes as { mobileRecords: number };
    assert.ok(adoption.activeParticipants >= 1, "summary should count an active participant");
    assert.ok(adoption.workflowsCompleted >= 1, "summary should count a completed workflow");
    assert.ok(outcomes.mobileRecords >= 1, "summary should count the saved mobile record");

    const nonMobile = await request("/pilot-metrics/events", davis, {
      method: "POST",
      body: JSON.stringify({
        clientEventId: randomUUID(),
        pilotId: "MERIT_MOBILE_PILOT",
        workflowId: randomUUID(),
        workflowType: "SOLDIER_ENTRY",
        eventType: "WORKFLOW_STARTED",
        occurredAt: new Date().toISOString(),
      }),
    });
    assert.equal(nonMobile.status, 422, "non-mobile clients must not write pilot telemetry");

    console.log("✓ platform administrator can view cross-unit pilot KPIs");
    console.log("✓ COMMANDER and unit ADMIN are denied");
    console.log("✓ telemetry is mobile-only, idempotent, and tied to a real MERIT record");
    console.log("✓ aggregate adoption and outcome counts update from saved data");
  } finally {
    await prisma.pilotMetricEvent.deleteMany({ where: { workflowId } });
    const createdEntry = await prisma.supportFormEntry.findUnique({ where: { clientRequestId: workflowId }, select: { id: true } });
    if (createdEntry) {
      await prisma.auditLog.deleteMany({ where: { entityType: "SupportFormEntry", entityId: createdEntry.id } });
      await prisma.supportFormEntry.delete({ where: { id: createdEntry.id } });
    }
    if (existingUnitAdmin) {
      await prisma.user.update({
        where: { id: existingUnitAdmin.id },
        data: {
          roles: existingUnitAdmin.roles,
          applicationSupportRole: existingUnitAdmin.applicationSupportRole,
          unitId: existingUnitAdmin.unitId,
        },
      });
    } else {
      await prisma.user.deleteMany({ where: { email: "avery.quinn@army.mil" } });
    }
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
