# MERIT pilot deployment checklist

This checklist separates the deterministic demonstration from the live unit pilot. The demonstration can show the full mobile workflow with stable sample data. The live pilot must use the API, Supabase Auth, the MERIT database, and aggregate KPI dashboard.

## Controls already implemented

- The mobile capture workflow emits idempotent, content-free telemetry and writes pilot-created domain records to the API.
- Pilot KPI access is restricted to the platform `ADMINISTRATOR` support role. Army `COMMANDER` and unit `ADMIN` roles do not inherit access.
- Every public application table has row-level security enabled and the browser roles have no direct database privileges. Domain data flows through the authenticated Node API.
- The `evaluations` evidence bucket is private. Database rows retain stable storage references; authorized responses issue five-minute signed links or stream the file from the API.
- Hosted schema changes are versioned under `supabase/migrations/`.

## Required before live participant onboarding

1. Deploy the Node API to a managed host with health checks, TLS, logs, and a stable URL.
2. Set production `DATABASE_URL`, `DIRECT_URL`, Supabase server credentials, approved `CORS_ORIGIN` values, and any AI provider key on that host. Never expose the service-role key to the mobile client.
3. Configure the mobile build with the hosted API URL and the existing Supabase project URL and publishable key.
4. Create one Supabase Auth identity per approved participant and map it to the corresponding MERIT `users.authId`. Test at least the Soldier, rater, and platform-administrator paths.
5. Keep the participant site allowlist private until the pilot roster is approved.
6. Move the Supabase project to a plan that will not pause for inactivity, or formally accept and rehearse the restore risk before the pilot begins.
7. Capture a two-to-four-week baseline and obtain command approval of the KPI targets in `PILOT_MEASUREMENT.md` before collecting post-pilot results.
8. Run an operational rehearsal: sign in, create records with and without evidence, review as the rater, open the administrator KPI dashboard, export the briefing summary, and verify anonymous database and storage access remain denied.

## Release gate

The environment is ready for participant use only when the hosted mobile client can complete the rehearsal against the hosted API, all participant identities are mapped, anonymous data/evidence checks fail closed, and a named owner is responsible for weekly KPI and incident review.
