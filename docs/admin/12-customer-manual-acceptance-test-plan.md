# 12 - Customer Manual Acceptance Test Plan

## Purpose

Use this checklist to run a customer-style acceptance test of EES 2.0 from each role's perspective. Complete the checkbox beside each step, record pass/fail and evidence, then share the completed **Results Summary** with the engineering team.

This plan uses the isolated development fixture. It does not use quarantined legacy records. For the real-document test, use only a training, sanitized, or otherwise authorized support form. Do not upload live personnel records into an unaccredited development environment.

## What This Proves

| Test area | Primary evidence |
| --- | --- |
| Rated Soldier | Support-form visibility, evaluation initiation, later acknowledgment |
| Rater | Duty-description review, support-form upload/parse, AI suggestions, ratings, comments, and signature |
| Senior Rater | Read-only rater content, senior-rater assessment, succession planning, and signature |
| Supplementary Reviewer | Restricted review-only access and final signature on the NCOER path |
| Support-form pipeline | Full-document extraction, section classification, duty-data prefill, source-backed performance suggestions |
| Authorization and lifecycle | Ordered signatures, one-form/one-evaluation consumption, draft deletion, restored form, restricted reviewer actions |
| Officer path | OER assignment, CPT rater, MAJ senior rater, and OER narrative-comment handling |

## Preflight

### Environment

- [ ] Start the real backend, not the mock server:

```zsh
cd "/Users/peterscheuermann/Documents/Project Shit/EES2.0/ees2-backend"
npm run dev:real
```

- [ ] Start the frontend:

```zsh
cd "/Users/peterscheuermann/Documents/Project Shit/EES2.0/ees2-frontend"
npm run dev
```

- [ ] Confirm `OPENAI_API_KEY` and `OPENAI_MODEL` are configured in the backend environment. The document pipeline and AI suggestions require OpenAI.
- [ ] Open `http://localhost:3000/dev-login`.
- [ ] Seed or refresh the isolated workflow fixture:

```zsh
cd "/Users/peterscheuermann/Documents/Project Shit/EES2.0/ees2-backend"
npx tsx scripts/seed-workflow-test-data.ts
```

- [ ] For a populated dashboard demonstration under CPT Smith, seed the separate historical analytics fixture:

```zsh
cd "/Users/peterscheuermann/Documents/Project Shit/EES2.0/ees2-backend"
npm run seed:dashboard
```

This creates synthetic accepted/returned history, due-soon work, counseling milestones, and senior-rater profile data. It is additive and does not alter the persona workflow fixtures.

- [ ] Confirm no draft evaluation from a previous run remains for the intended test path. Use **All Evaluations** and the confirmation modal to delete only a `Draft` or `Rater In Progress` record. Deletion restores the consumed support form for another attempt.

### Test Personas

| Persona | Dev-login profile | Use in this plan |
| --- | --- | --- |
| SGT James Davis | `SGT Davis - Team Leader` | Rated Soldier for the full NCOER workflow |
| SSG Marcus Johnson | `SSG Johnson - Squad Leader` | Davis's rater |
| SFC Robert Williams | `SFC Williams - Platoon Sergeant` | Davis's senior rater |
| LTC Morgan Reed | `LTC Reed - Supplementary Reviewer` | Davis's supplementary reviewer |
| 1LT Maria Torres | `1LT Torres - PLT Leader` | Rated Soldier for the OER path |
| CPT Peter Smith | `CPT Smith - Company Commander` | Torres's OER rater |
| MAJ Jordan Lee | `MAJ Lee - Battalion Executive Officer` | Torres's OER senior rater |
| CPT Avery Quinn | `CPT Quinn - Servicing Administrator` | Administrative/lifecycle persona |

### Fixture Paths

| Path | Chain | Form | Expected review route |
| --- | --- | --- | --- |
| NCOER full workflow | `test-chain-davis-2026` | `test-sf-davis-2026` | Rater -> Senior Rater -> Davis -> LTC Reed |
| OER coverage | `test-chain-torres-2026` | Most recent active finalized `test-sf-torres-*` form | CPT Smith -> MAJ Lee -> Torres; no supplementary review |

## Test A - Rated Soldier Starts the NCOER

**Persona:** SGT Davis

- [ ] Sign in as SGT Davis.
- [ ] Open **Support Form** and confirm the Davis form is visible with a finalized state and logged entries.
- [ ] Add one new objective or accomplishment with a factual description; optionally attach proof as the rated Soldier.
- [ ] Sign in as SSG Johnson, open the Davis form, and confirm the rater can add an objective but does not receive the Soldier-only artifact attestation controls.
- [ ] When testing an assignment with no usable form, confirm **Start form** presents only effective current assignments and creates the new form under the selected rated Soldier/rater relationship.
- [ ] Open **My Eval** or **Start Evaluation**, choose the Rated Soldier path, and select the Davis rating chain.
- [ ] Confirm the selector shows only Davis's effective current assignment, including SSG Johnson as rater and SFC Williams as senior rater; it must not show repeated historical chains.
- [ ] Enter an in-period start/end date and select a valid reason for submission.
- [ ] Create the evaluation.
- [ ] Record the resulting evaluation ID: `____________________________`.

Expected result:

- [ ] The evaluation opens in `DRAFT`.
- [ ] The support form is consumed and is no longer offered for a second evaluation.
- [ ] The evaluation is connected to the published assignment and immutable rating snapshot.
- [ ] The rater can see the new evaluation after logging in.

**Evidence / notes:**

```text
Result: PASS / FAIL / BLOCKED
Observation:
Screenshot or error reference:
```

## Test B - Rater Uses a Real Support Form and Completes Part IV

**Persona:** SSG Johnson

### B1. Review Duty Data

- [ ] Sign in as SSG Johnson and open the Davis evaluation.
- [ ] Open **Duty Description**.
- [ ] Confirm the duty title and responsibilities are prefilled from the linked support form when available.
- [ ] Edit the duty description if needed and select **Save**.

Expected result:

- [ ] Support-form duty content is an editable starting point, not a locked value.
- [ ] A saved rater edit becomes the evaluation's Part III content.

### B2. Upload and Process a Real Support Form

- [ ] Navigate to a Part IV section of the Davis evaluation.
- [ ] Upload the approved real/training support-form PDF or image using **Soldier Support Form**.
- [ ] Record upload time: `____________________________`.
- [ ] Confirm the processing banner advances through extraction, classification, and suggestion generation.
- [ ] While the upload is processing, navigate to another Part IV section.

Expected result:

- [ ] All Part IV sections show the processing state until the full upload pipeline reaches `COMPLETE` or `FAILED`.
- [ ] The reviewer is not asked to work section-by-section while the document is still being parsed.
- [ ] If processing fails, the page displays the error; record it and stop the AI-specific checks.

### B3. Validate Parsed Content

- [ ] After processing completes, inspect **Character**, **Intellect**, **Leads**, and at least two additional Part IV sections.
- [ ] Confirm each section has AI performance suggestions generated from the uploaded support form.
- [ ] Confirm the extracted suggestions reflect recognizable facts from the uploaded document.
- [ ] Open **Original support form** from the AI workspace and confirm the uploaded document is readable without leaving the evaluation.
- [ ] Confirm each whole-document suggestion maps to one recognizable extracted fact, rather than five alternative phrasings of the same fact.
- [ ] For at least one AI suggestion, open **View source fact** and confirm its provenance matches the uploaded evidence.
- [ ] Select **Reprocess support form** and confirm a new run begins without deleting the earlier run's audit history.
- [ ] Reject at least one suggestion that is not useful.
- [ ] Edit at least one suggestion before using it.
- [ ] Add at least one manual rater comment/bullet.

Expected result:

- [ ] NCOER sections display bullet-style suggestions; OER sections display narrative performance comments.
- [ ] Suggestions are drafts only. The rater must use, edit, or reject each one before a section can be finalized.
- [ ] Unsupported factual claims appear as warnings rather than silently becoming final content.
- [ ] The final content shows AI provenance when AI text is used.

### B4. Complete and Sign as Rater

- [ ] Select an appropriate rating for each of the six Part IV sections.
- [ ] Resolve every pending AI suggestion in every section.
- [ ] Mark all six sections complete.
- [ ] Attempt to sign as Rater before all six are complete, if safe to do so.
- [ ] Sign as `RATER` after all six are complete.

Expected result:

- [ ] Early rater signing is rejected with `RATER_SECTIONS_INCOMPLETE`.
- [ ] After valid rater signature, status becomes `PENDING_SENIOR_RATER`.

**Evidence / notes:**

```text
Result: PASS / FAIL / BLOCKED
Character items recognized from uploaded form:
Intellect items recognized from uploaded form:
AI suggestion quality notes:
Screenshot or error reference:
```

## Test C - Senior Rater Review and Signature

**Persona:** SFC Williams

- [ ] Sign in as SFC Williams and open the Davis evaluation.
- [ ] Confirm completed rater content is visible.
- [ ] Attempt to edit a rater-owned Part IV section.
- [ ] Open **Senior Rater**.
- [ ] Select a senior-rater overall assessment.
- [ ] Complete succession-planning fields as appropriate.
- [ ] Save and sign as `SENIOR_RATER`.

Expected result:

- [ ] The senior rater cannot edit rater-owned Part IV content.
- [ ] Senior-rater signature before the rater signs is rejected with `SIGNATURE_OUT_OF_SEQUENCE`.
- [ ] Signing without an overall assessment is rejected with `SENIOR_RATER_ASSESSMENT_REQUIRED`.
- [ ] After valid signature, status becomes `PENDING_SOLDIER_ACK`.

**Evidence / notes:**

```text
Result: PASS / FAIL / BLOCKED
Observation:
Screenshot or error reference:
```

## Test D - Rated Soldier Acknowledgment

**Persona:** SGT Davis

- [ ] Sign in as SGT Davis and reopen the evaluation.
- [ ] Review the rater and senior-rater content.
- [ ] Confirm the rated Soldier cannot edit rater-owned Part IV content.
- [ ] Sign as `SOLDIER`.

Expected result:

- [ ] The Davis NCOER status becomes `PENDING_SUPPLEMENTARY_REVIEW`.
- [ ] The signed content remains traceable through signatures and audit records.

**Evidence / notes:**

```text
Result: PASS / FAIL / BLOCKED
Observation:
Screenshot or error reference:
```

## Test E - Supplementary Reviewer

**Persona:** LTC Reed

- [ ] Sign in as LTC Reed.
- [ ] Open **All Evaluations** and locate the Davis evaluation in `Pending Review` state.
- [ ] Confirm the evaluation is viewable.
- [ ] Attempt to edit Part IV content or generate AI content.
- [ ] Attempt to sign before Soldier acknowledgment, if safe to do so.
- [ ] Sign as `REVIEWER` after the Soldier has signed.

Expected result:

- [ ] Reviewer cannot author rater/senior-rater content, generate suggestions, or confirm support-form entries.
- [ ] Reviewer signature before Soldier acknowledgment is rejected with `SIGNATURE_OUT_OF_SEQUENCE`.
- [ ] After valid review signature, status becomes `COMPLETE`.

**Evidence / notes:**

```text
Result: PASS / FAIL / BLOCKED
Observation:
Screenshot or error reference:
```

## Test F - Final Review and Submission

**Persona:** SSG Johnson or SGT Davis

- [ ] Open **Review** and confirm all six sections are complete.
- [ ] Run the consistency check.
- [ ] Resolve or document all blocking findings.
- [ ] Confirm all required signatures are displayed.
- [ ] Submit to HDQA.

Expected result:

- [ ] A complete, signed NCOER changes to `SUBMITTED`.
- [ ] Submission is blocked when required signatures or blocking validation findings remain.

**Evidence / notes:**

```text
Result: PASS / FAIL / BLOCKED
Observation:
Screenshot or error reference:
```

## Test G - OER and MAJ Senior-Rater Coverage

**Personas:** 1LT Torres, CPT Smith, MAJ Lee

- [ ] Sign in as 1LT Torres and start an OER using the active Torres support form and `test-chain-torres-2026`.
- [ ] Confirm the form type is `OER_67_10_1`.
- [ ] Confirm the duty description is prefilled from the support form or an editable rank/MOS starter draft when support-form duty data is absent.
- [ ] Sign in as CPT Smith and confirm rater access.
- [ ] If uploading a support form, confirm OER sections display **performance comments**, not an NCOER-format refusal.
- [ ] Sign in as MAJ Lee and confirm senior-rater access and assessment screen availability.

Expected result:

- [ ] Snapshot identifies CPT Smith as rater and MAJ Lee as senior rater.
- [ ] The OER path does not require a supplementary reviewer for this fixture.
- [ ] OER narrative/comment generation is handled as an OER-specific workflow.

**Evidence / notes:**

```text
Result: PASS / FAIL / BLOCKED
Observation:
Screenshot or error reference:
```

## Test H - Draft Deletion and Support-Form Restoration

**Persona:** Rated Soldier or assigned Rater

- [ ] Open **All Evaluations**.
- [ ] Confirm only active evaluations appear; quarantined legacy drafts should not be listed.
- [ ] Select **Delete** on a `Draft` or `Rater In Progress` evaluation.
- [ ] Read the confirmation modal and select **Cancel** once to verify no deletion occurs.
- [ ] Open the modal again and select **Delete Draft**.

Expected result:

- [ ] No delete control appears for routed, complete, submitted, accepted, or returned evaluations.
- [ ] The deleted row disappears from the list.
- [ ] The consumed support form is restored to active/finalized and can support a new attempt.
- [ ] The server rejects any attempt to delete a non-draft/non-in-progress evaluation.

**Evidence / notes:**

```text
Result: PASS / FAIL / BLOCKED
Evaluation deleted:
Support form restored:
Screenshot or error reference:
```

## Test I - Access-Control Spot Checks

Use a persona that is not assigned to the active evaluation.

- [ ] Attempt to open an evaluation URL from another chain.
- [ ] Attempt to open a support form URL from another chain.
- [ ] Attempt to generate AI content as LTC Reed.
- [ ] Attempt to confirm an entry as LTC Reed.

Expected result:

- [ ] Cross-chain records return a not-found or forbidden response without exposing content.
- [ ] Reviewer authoring/confirmation actions return `403`.

**Evidence / notes:**

```text
Result: PASS / FAIL / BLOCKED
Observation:
Screenshot or error reference:
```

## Test J - Identity and Access Administration

**Persona:** CPT Quinn

- [ ] Open **Identity and Access** and confirm summary cards display synchronized identities, sync exceptions, pending access reviews, suspended accounts, and unmatched records.
- [ ] Search for `Davis`, apply sync/access/unit filters, then clear the filters.
- [ ] Open a record and confirm authoritative identity fields are read-only.
- [ ] Inspect assignment history and confirm rater/senior-rater authority appears there rather than as editable role checkboxes.
- [ ] Select **Sync now** in the development environment and verify the source/sync status updates.
- [ ] Update an EES support role, access-review state, or break-glass eligibility and confirm rating assignments and authoritative identity fields remain unchanged.
- [ ] Assign then remove a servicing-administrator scope; confirm both actions appear in audit history.
- [ ] Suspend a non-admin test persona with a reason, then reactivate it; verify the audit history records both actions.
- [ ] Visit `/dev/personas` in development and confirm test-persona management is visibly marked non-production and separate from Identity and Access.

Expected result:

- [ ] Only an application administrator can load this page's data; non-admin API requests return `403` before counts or records are returned.
- [ ] The page does not offer manual Soldier creation, authoritative identity edits, rating-role checkboxes, or destructive user deletion.
- [ ] Suspension, reactivation, synchronization, exception resolution, and reconciliation are server-authorized and audited.

**Evidence / notes:**

```text
Result: PASS / FAIL / BLOCKED
Edited user ID:
Screenshot or error reference:
```

## Test K - Access and Assistance

**Personas:** SGT Davis, SGT Rivera, CPT Quinn, SFC Morgan

- [ ] Run `npm run seed:access-assistance`.
- [ ] Sign in as SGT Davis and open **Access and Assistance**.
- [ ] Confirm the active scoped helper grant appears under **People helping me**.
- [ ] Sign in as SGT Rivera and open **Access and Assistance**.
- [ ] Confirm Davis appears under **People I assist** with a scoped support-form grant.
- [ ] Open the scoped form from the grant card.
- [ ] Confirm the assistance banner states that Rivera is assisting Davis and cannot sign, acknowledge, make ratings, or confirm evidence.
- [ ] Add one draft support-form entry as Rivera.
- [ ] Edit Rivera's own unlocked draft and reclassify one attached artifact; confirm Davis cannot edit that helper-owned draft and Rivera cannot flag evidence for Davis.
- [ ] Request Davis's review and send the rater a workflow reminder from the scoped form.
- [ ] Sign in as Davis and confirm the entry displays the real helper attribution.
- [ ] Attempt to open an unrelated evaluation as Rivera.
- [ ] Sign in as SFC Morgan, open the scoped active evaluation, complete one administrative field, record an administrative-return response, and download a working copy.
- [ ] Attempt to sign that evaluation as Morgan.
- [ ] As Davis, create a new temporary grant to CPT Quinn, then accept it as Quinn and revoke it as Davis.

Expected result:

- [ ] The helper acts under their own account and never appears in My Evaluation or My Soldiers.
- [ ] The draft entry records helper, subject, access grant, and `ADD_DRAFT_SUPPORT_ENTRY` in the audit history.
- [ ] Draft edits, artifact organization, review requests, reminders, administrative fields, administrative responses, and working-copy downloads record their explicit capability in the audit history.
- [ ] Unrelated evaluation access is concealed.
- [ ] Evidence attestation and signatures remain forbidden to helpers.
- [ ] Invitation acceptance and revocation update grant status without changing any rating chain.

**Evidence / notes:**

```text
Result: PASS / FAIL / BLOCKED
Grant ID:
Delegated entry ID:
Screenshot or error reference:
```

## Known Constraints to Record, Not Work Around

- The supplementary-reviewer queue is available through the evaluation list; a dedicated reviewer dashboard view is not yet implemented.
- The OER workflow is operational for assignment, access, duty data, upload processing, comments, and senior-rater handoff, but is not at full NCOER user-interface parity.
- Evaluation comments require a direct evaluation relationship or an explicit, scoped `ADD_NON_EVALUATIVE_COMMENT` capability. Comments remain non-evaluative and never grant rating or signature authority.
- A support form is single-use once an evaluation consumes it. Delete an eligible draft or rerun the fixture script to obtain a fresh test form; do not attempt to force reuse.
- AI is a drafting aid. Every suggestion requires a human decision before the section can be finalized.

## Results Summary to Share

Copy this section, fill it out, and send it with screenshots or error text.

```text
EES 2.0 Manual Acceptance Test Results
Date:
Tester:
Environment / browser:
OpenAI document pipeline used: Yes / No
Document type used: PDF / image / not tested

A. Rated Soldier initiation: PASS / FAIL / BLOCKED
B. Real support-form upload and extraction: PASS / FAIL / BLOCKED
   Character facts recognized:
   Intellect facts recognized:
   Overall suggestion quality:
C. Rater workflow and signature: PASS / FAIL / BLOCKED
D. Senior Rater workflow and signature: PASS / FAIL / BLOCKED
E. Soldier acknowledgment: PASS / FAIL / BLOCKED
F. Supplementary reviewer: PASS / FAIL / BLOCKED
G. Submission gate: PASS / FAIL / BLOCKED
H. OER and MAJ senior-rater path: PASS / FAIL / BLOCKED
I. Draft deletion / restored support form: PASS / FAIL / BLOCKED
J. Access-control spot checks: PASS / FAIL / BLOCKED
K. Identity and Access Administration: PASS / FAIL / BLOCKED
L. Access and Assistance: PASS / FAIL / BLOCKED

Top three strengths:
1.
2.
3.

Top three defects, surprises, or usability issues:
1.
2.
3.

Blocking issue details, request/response text, or screenshots:

Recommended next test:
```
