# 12 - Customer Manual Acceptance Test Plan

> **Purpose:** A customer-facing acceptance checklist for confirming that an EES 2.0 environment supports the intended evidence-to-evaluation workflow. This is the concise execution and sign-off document. The detailed procedural source is [FLOWS - Workflow Test Runbook](./FLOWS.md).

## Before testing

| Check | Acceptance criterion |
| --- | --- |
| Environment | Test the real backend (`npm run dev:real`), not the mock server. |
| Database | Required Prisma migrations are applied and `npx prisma migrate status` reports no pending migrations for the target environment. |
| Test data | Use an isolated, published assignment-backed fixture set. Do not use quarantined historical records as a demo path. |
| Personas | Confirm the test personas can authenticate and each maps to the expected persisted EES `User`. |
| AI dependency | If AI drafting is in scope, set `OPENAI_API_KEY`; manual entry remains valid when AI is unavailable. |
| Evidence | Capture tester name, date/time, environment, executed persona, result, and supporting screenshots or request IDs for each failed item. |

## Required acceptance path: NCOER workflow

Use the Davis NCOER fixture from [FLOWS](./FLOWS.md). Mark each item pass/fail and record a defect for every failure.

### 1. Rated soldier: evidence and initiation

- [ ] The rated soldier sees only their current support form and assignment.
- [ ] The soldier can add an accomplishment and an allowed evidence artifact to their own entry.
- [ ] Artifact type, file validation, and soldier discrepancy disclosure behave as expected.
- [ ] The soldier can create and submit a goal for rater review.
- [ ] A hard-complete finalized support form is required before evaluation initiation.
- [ ] Evaluation creation selects only an effective published assignment and creates an immutable rating snapshot.
- [ ] Reusing the consumed form for another evaluation is rejected.

### 2. Rater: authoring and evidence-grounded drafting

- [ ] Only the assigned rater can edit rater-owned evaluation content.
- [ ] The rater can complete all required Part IV sections with manual bullets.
- [ ] When AI is configured, selected support-form entries produce reviewable suggestions rather than direct final bullets.
- [ ] Every suggestion requires accept, edit, or reject review before section completion.
- [ ] Accepted AI bullets retain a visible source trail to the contributing evidence snapshot.
- [ ] A double accept/retry does not create duplicate final bullets.
- [ ] Prohibited language and other blocking validation errors are rejected server-side, including when a direct API client attempts to bypass the UI.
- [ ] The rater cannot sign before required rater content is complete.

### 3. Senior rater and supplementary reviewer

- [ ] The senior rater can view rater content and complete only senior-rater-owned content.
- [ ] The senior rater cannot replace rater narrative or generate rater bullets.
- [ ] The senior rater cannot sign before rater completion/signature.
- [ ] If the assignment requires supplementary review, the reviewer is scoped to that evaluation and can sign only at the correct workflow stage.
- [ ] A supplementary reviewer cannot edit narrative, generate bullets, or confirm support-form evidence.

### 4. Soldier acknowledgment and final-form review

- [ ] The rated soldier can acknowledge only after the required rater/senior-rater work is complete.
- [ ] The final-form review renders the current populated PDF.
- [ ] A changed form invalidates the prior final-form confirmation.
- [ ] The evaluation reaches `COMPLETE` only after all required signatures and final-form confirmation.

### 5. Submission, export, and auditability

- [ ] The consistency check displays blocking errors, confirmation-required items, warnings, and informational items distinctly.
- [ ] Submission is rejected while a blocking error remains.
- [ ] A completed evaluation can be submitted to HDQA.
- [ ] A non-final evaluation PDF displays `DRAFT - NOT FOR OFFICIAL USE`; completed/submitted/accepted exports do not display that watermark.
- [ ] A user outside the evaluation relationship cannot retrieve the evaluation or PDF by guessing an ID.
- [ ] Audit history contains the relevant actions, including evidence artifact activity, suggestion decision, status/signature changes, and PDF export.

## Required acceptance path: OER boundary

- [ ] The officer fixture presents the correct OER form type and immutable assignment snapshot.
- [ ] The officer, rater, and senior rater each see only their authorized work.
- [ ] The acceptance record notes the known limitation: the OER builder is not yet at full NCOER authoring parity.

## Negative authorization checks

Run at least one test with a persona outside the assignment.

- [ ] Direct support-form/evaluation/PDF access by guessed ID is rejected without returning protected content.
- [ ] A rated soldier cannot author rater content or sign as another role.
- [ ] A helper with a scoped assistance grant can perform only explicitly granted capabilities and cannot gain rating authority, sign, acknowledge, rate, or impersonate.
- [ ] A suspended user cannot use normal EES workflow access.

## Results handoff

| Field | Record |
| --- | --- |
| Environment / build | |
| Database migration status | |
| Test fixture version | |
| Test date and participants | |
| Required NCOER path | Pass / Fail |
| OER boundary path | Pass / Fail / Not in scope |
| Authorization negative checks | Pass / Fail |
| Blocking defects | |
| Non-blocking observations | |
| Evidence location | |
| Customer acceptance decision | Accept / Accept with conditions / Reject |

## Related documents

- [FLOWS - Workflow Test Runbook](./FLOWS.md) - detailed personas, commands, sequence, expected error codes, and known constraints.
- [08 - Data Flow and API Contract](./08-data-flow-and-api-contract.md) - current API and authorization contract.
- [10 - Regulatory Remediation Status](./10-regulatory-remediation-status.md) - current remediation and deployment context.
- [14 - Supabase PostgreSQL Database Schema Reference](./14-database-schema-reference.md) - database model and migration reference.