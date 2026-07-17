# 10 - Regulatory Remediation Status

> **Purpose:** The current, concise status record for the regulatory assignment, support-form, evaluation, and access-control remediation work. Use this document for current-state decisions. Use [09 - Permission and Assignment Audit](./09-permission-and-assignment-audit.md) only as preserved pre-remediation evidence.

## Deployment Status (as of 2026-07-17 14:00 UTC)

✅ **All 14 migrations successfully applied** to the configured Supabase datasource.  
✅ **Schema fully deployed:** 36 Prisma models, 50 enums, all relationships intact.  
✅ **Demo fixtures seeded:** 8 test personas, 2 rating-scheme assignments, 3 support forms, 2 evaluations.  
✅ **Workflow fixtures verified:** Davis NCOER (4-person chain with supplementary reviewer) and Torres OER ready for end-to-end testing.  

**Migration metadata caveat:** The `_prisma_migrations` tracking table experienced corruption during recovery. The migrations are confirmed applied (verified by successful seed and schema completeness), but `npx prisma migrate status` may report false errors. Do not use `migrate status` exit code as the source of truth for deployment verification. Instead:
- Confirm tables exist: `information_schema.tables` shows 33+ application tables
- Run seed script: `npx tsx scripts/seed-workflow-test-data.ts` (should complete without errors)
- Verify test data: Query `users`, `rating_scheme_assignments`, `support_forms`, `evaluations` tables for non-empty results

## Status at a glance

| Area | Source-controlled application state | Operational caveat |
| --- | --- | --- |
| Rating authority | New regulated workflows use versioned `RatingSchemeAssignment` records with effective dates, lifecycle state, official-role validation, and prospective replacement. | Legacy `RatingChain` records remain during compatibility migration. |
| Evaluation authority | Assignment-backed evaluation creation writes one immutable `EvaluationRatingSnapshot`. Later assignment changes do not rewrite existing evaluation authority. | Remaining read paths must continue moving to snapshot-first authorization wherever a snapshot exists. |
| Support forms | Forms record lifecycle, disposition, author/lock metadata, and assignment/chain association. Assignment-backed evaluation creation consumes a completed form atomically. | Legacy records are retained for auditability and compatibility. |
| Workflow signatures | Required officials sign in ordered workflow stages; final-form confirmation precedes completion/submission. | Ensure each deployed environment has current migrations and workflow fixtures before a demo. |
| Access assistance | Helpers receive explicit, scoped capability grants. Assistance does not make a helper a rating official and cannot sign, acknowledge, rate, or impersonate. | Legacy delegate routes remain compatibility adapters while records migrate. |
| Legacy demo data | Historical development records with invalid assignment/form-consumption combinations are quarantined rather than rewritten or deleted. | Quarantined records must remain excluded from active/demo workflows. |


## What was remediated

### 1. Rating assignments are versioned and validated

`RatingScheme` and `RatingSchemeAssignment` replace the assumption that an active chain alone is sufficient for new regulated work. A publishable assignment records the rated soldier, rater, optional intermediate rater, senior rater, optional supplementary reviewer, form category, effective period, and any policy exception.

The application validates official categories, seniority, supplementary-review requirements, and effective-date overlap before an assignment is published. Changes are prospective: a replacement assignment supersedes a prior assignment for future records rather than mutating historical authority.

### 2. Evaluation authority is frozen at creation

New assignment-backed evaluations receive one `EvaluationRatingSnapshot`. It preserves the governing assignment, officials, ranks, categories, form category, and exception reference at the moment of creation.

This is the authorization record for the evaluation. A later reassignment must not alter who may view, edit, sign, or review an already-created evaluation.

### 3. Support-form lifecycle is explicit

Support forms now carry lifecycle state (`DRAFT` through `CONSUMED`, plus archive/quarantine), disposition, assignment/chain relationship, creation context, and completion/consumption metadata. The creation flow requires a hard-complete support form and consumes it transactionally when it becomes the source for an assignment-backed evaluation.

This prevents one support form from silently initiating multiple active evaluations. Older duplicate consumption records are retained as historical evidence and quarantined instead of being destructively repaired.

### 4. Supplementary review and assistance are constrained

Supplementary reviewers may perform their designated review but cannot generate rater bullets, confirm evidence, author rater/senior-rater content, or gain general edit authority. Scoped assistance is implemented through explicit access grants and capabilities, not through global roles or rating-chain mutation.

### 5. Historical records are retained, not treated as current truth

The pre-remediation audit identified mixed test personas, duplicate support-form consumption, and incompatible relationships in the historical development dataset. Those records were not deleted. They are quarantined, excluded from normal active workflows, and preserved for audit/debugging context.

## Current-source hierarchy

Use these sources in this order when preparing a demo, test plan, security review, or future deliverable:

1. **Current implementation and database contract:** [14 - Database Schema Reference](./14-database-schema-reference.md), `prisma/schema.prisma`, and current backend route/policy code.
2. **Current API and workflow rules:** [08 - Data Flow and API Contract](./08-data-flow-and-api-contract.md) and [FLOWS - Workflow Test Runbook](./FLOWS.md).
3. **Product delivery status and known work:** [06 - Roadmap and Status](./06-roadmap-and-status.md).
4. **Historical evidence only:** [09 - Permission and Assignment Audit](./09-permission-and-assignment-audit.md).

## Deployment requirement

The remediation is only effective in an environment after the reviewed Prisma migrations are applied. The currently configured Supabase datasource reported pending migrations on 2026-07-17; see the deployment-status warning in [14 - Database Schema Reference](./14-database-schema-reference.md) before treating any environment as remediated.

```sh
cd ees2-backend
npx prisma migrate deploy
npx prisma migrate status
```

## Remaining activation work

- Move remaining legacy-chain readers and authorizers to use `EvaluationRatingSnapshot` whenever an evaluation has one.
- Maintain a compliant, isolated demo fixture set rather than relying on quarantined historical development records.
- Connect authorized personnel data sources before using live personnel data.
- Complete production accreditation activities before any operational deployment with live records.

## Related documents

- [08 - Data Flow and API Contract](./08-data-flow-and-api-contract.md)
- [09 - Permission and Assignment Audit](./09-permission-and-assignment-audit.md)
- [13 - Access and Assistance Implementation Note](./13-access-and-assistance-implementation-note.md)
- [14 - Supabase PostgreSQL Database Schema Reference](./14-database-schema-reference.md)