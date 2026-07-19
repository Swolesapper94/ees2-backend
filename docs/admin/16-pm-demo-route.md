# 16 - MERIT PM Demo Route: Authoritative Data to AI-Supported Evaluations

> **Purpose:** A PM-facing demonstration route for showing **MERIT (Mission Evaluation Record & Insight Tool)** as a cloud-first performance-management workflow, not a tour of prewritten seeded outcomes. The route is optimized for an EES program manager who already understands the legacy system's pain: administrative re-entry, late support forms, weak bullets, undocumented claims, rater workload, and HRC rework.

---

## 1. Demo Thesis

The demo should prove one claim:

**MERIT reduces leader administrative burden by starting with authoritative personnel data, capturing performance throughout the rating period, and turning documented evidence into reviewable, regulation-aware evaluations.**

The PM should leave with four takeaways:

1. The Soldier should not re-enter personnel data the Army already maintains; MERIT should validate and display authoritative profile and assignment context up front.
2. Soldiers and leaders can build the evaluation throughout the rating period instead of rebuilding it from memory at the end.
3. AI is useful because it drafts from captured evidence, not because it invents polished language.
4. The workflow creates a defensible record: source data, source evidence, AI suggestion, human review decision, final content, consistency checks, signatures, and export history.

### 1.1 Implementation Map

| Requirement | Existing capability | Required change |
| --- | --- | --- |
| IPPS-A source indication | `IdentitySourceRecord` already stores source system, sync status, timestamps, and source payload | Reuse it with `sourceSystem = IPPS_A` and payload label `IPPS_A_STUB`; UI must show `IPPS-A` beside `Demo stub` |
| Personnel summary | `/api/dashboard` already returns the authenticated user and current chain | Extend the dashboard payload with read-only `personnelProfile` from the identity-source payload |
| Profile avatar | `User.profilePictureUrl`, `UserAvatar`, `DashboardGreeting`, and `ProfileMenu` already exist | Reuse them with local synthetic `/demo-avatars/*.webp` assets and initials fallback |
| Support-form upload | `SupportFormUpload`, `/api/support-form-uploads/:evalId`, and `SupportFormUploadPanel` already exist | Reuse the upload route and panel; label the action `Upload existing support form` |
| Parsing | `support-form-pipeline.ts` already performs PDF text extraction, image extraction, typed parsing, and bullet generation | Insert a human-review gate before reviewed extracted facts can generate suggestions |
| Demo seeds | Existing dev personas and IDs already exist | Update existing records in place; do not duplicate Davis, Johnson, Williams, Smith, or Torres |
| Assignment/rating chain | Rating-chain and rating-scheme assignment services already exist | Dashboard display should prefer the effective published assignment and fall back to legacy chain only when needed |

---

## 2. Recommended Live Route

Use the **Davis NCOER path** for the main demo because it exercises the complete authoring workflow: rated Soldier, rater, senior rater, supplementary reviewer, final-form review, and export posture.

Use the **Torres OER path** only as a short boundary segment to show officer form selection, assignment snapshots, and MAJ senior-rater topology. Do not make the officer path the center of the AI authoring demo until the OER builder reaches NCOER parity.

### Best PM-facing story

1. Start with Davis's opening dashboard: avatar, rank, grade, unit, UIC, MOS, duty title, assignment dates, readiness statuses, active rating chain, and visible `IPPS-A` / `Demo integration` source labels.
2. Have the Soldier add one prepared accomplishment and attach one prepared proof artifact.
3. Have the rater generate AI bullet suggestions from that fresh evidence.
4. Show that every suggestion must be reviewed, edited, accepted, or rejected.
5. Show provenance and unsupported-fact checks before signature.
6. Close the core route with the regulated signature/final-review sequence and the draft-watermarked PDF posture.
7. If time permits, transition to uploaded support-form parsing as a controlled bridge for existing documents, not as the primary workflow.

This avoids the weak demo pattern of opening a completed seeded evaluation and saying, "the system did this." Instead, the PM first sees administrative burden reduced by source-backed profile data, then sees the system produce value from a new fact in real time.

### Recommended final sequence

| Segment | Target time | Demo point |
| --- | --- | --- |
| Opening and product frame | 30 seconds | "The original EES digitized the form. MERIT digitizes the performance-management process behind it." |
| Authoritative profile | 60 seconds | Show IPPS-A stub, Microsoft avatar, read-only personnel data, assignment, and rating chain. |
| Soldier captures fresh performance | 60-90 seconds | Add one prepared accomplishment and proof. |
| Rater generates and reviews | 2-3 minutes | Select evidence, generate suggestions, use one, edit one, reject one. |
| Trust controls | 60-90 seconds | Show provenance, unsupported claims, consistency checks, and draft status. |
| Regulated workflow | 60 seconds | Show readiness, signatures, senior-rater handoff, and final review; do not execute every signature live unless asked. |
| Existing-document ingestion | Optional 60-90 seconds | Upload and review extracted facts without generating a second full bullet set unless asked. |
| Future-state dashboard | 30-60 seconds | Show or discuss evaluation status, late support forms, profile utilization, senior-rater population, and future rack-and-stack concepts. Label concepts clearly. |
| Close | 30 seconds | Close on platform impact, not an implementation ask. |

Target duration: **8-10 minutes** for the core demo, **10-12 minutes** with the parsing segment, and **15 minutes absolute maximum**.

---

## 3. Exact Live Steps

Use this as the operator run-of-show. Rehearse it once with the same fixture state you will use in front of the PM.

### 3.1 Before the PM Enters the Room

| Step | Operator action | Highlight only if asked |
| --- | --- | --- |
| 1 | Start the real backend from `ees2-backend` with `npm run dev:real`. | This is the real API path, not the mock server. |
| 2 | Start the frontend from `ees2-frontend` with `npm run dev`. | The demo should run through the same browser UI the PM will evaluate. |
| 3 | Confirm the backend has the required AI provider key for the active generation route. | Missing AI keys fail closed; that is good security, bad live theater. |
| 4 | Confirm the Davis path has a usable assignment-backed support form and evaluation. | Support forms are consumed by evaluation creation; stale or consumed fixtures cause false `409` failures. |
| 5 | Put one realistic proof file on the desktop for fast upload. Use a certificate, score sheet, counseling note, or short PDF with concrete facts. | The proof file is the primary route's anchor. |
| 6 | Put [docs/demo/SGT_Davis_Demo_Support_Form.pdf](../demo/SGT_Davis_Demo_Support_Form.pdf) on the desktop for the upload segment. | It is synthetic and visibly marked `SYNTHETIC DEMO RECORD - NOT AN OFFICIAL ARMY DOCUMENT`. SHA-256: `a10a1a969569de704a728027f9f992b88cf78b604eb090c874bc497693d49b1b`. |
| 7 | Open a backup tab or screenshot deck at the rater AI panel. | If live AI is unavailable, still show the workflow, provenance, and review controls. |

Prepared accomplishment for the live entry:

```text
Led a nine-Soldier team through four battalion live-fire rehearsal iterations with zero safety violations; corrected three range-control deficiencies and trained two junior leaders on PCC/PCI standards.
```

Use section `Leads` or `Achieves`, entry type `Accomplishment`, and artifact type `Document` or `Certificate`. Do not spend several minutes filling fields; the point is to show fast continuous capture, not data-entry endurance.

### 3.2 Opening Dashboard - Authoritative Profile and Source

Target time: **45-60 seconds**. This is the first product-value moment.

| Step | Exact action | Highlight while doing it |
| --- | --- | --- |
| 1 | Go to `/dev-login`. Select **SGT Davis - Team Leader**. | "I am starting as the rated Soldier, not as an admin loading a canned record." |
| 2 | Pause on `/dashboard`. Point to the Microsoft-profile demo avatar. | "The profile image is simulated through a Microsoft identity source. In an operational environment, the approved Microsoft profile service would provide it." |
| 3 | Point to rank, grade, unit, UIC, MOS, duty title, assignment dates, ACFT status, and body-composition status. | "The first thing to notice is what the Soldier did not have to enter. EES begins with the personnel and assignment information the Army already maintains." |
| 4 | Point to the `IPPS-A` source indicator and visible `Demo integration` label. | "For this prototype, these fields are populated through an IPPS-A integration stub. The data contract and user experience are designed around IPPS-A as the authoritative source, but this environment is not connected to production." |
| 5 | Point to **Your Rating Chain** or the active rating-chain display. | "The rating chain remains governed separately through effective-dated rating assignments. Personnel data identifies the user; it does not independently grant rating authority." |

Do not rush this segment. It establishes cloud-first administrative-burden reduction before the AI story begins.

### 3.3 Soldier Segment - Add Fresh Evidence

Target time: **60-90 seconds**. Use one prepared accomplishment and one prepared artifact, then move on.

| Step | Exact action | Highlight while doing it |
| --- | --- | --- |
| 1 | Go to `/support-form`. If prompted, choose the active Davis support form from **Working support form**. | "This is the rating-period record behind the evaluation." |
| 2 | If no active form is visible, click **Start form**, select the Davis assignment, enter duty title `Team Leader`, duty MOSC `11B`, and create it. | "The form is tied to a real rating assignment, not a free-floating document." |
| 3 | Click **Log entry**. | "The Soldier captures performance when it happens." |
| 4 | Set **Entry type** to `Accomplishment - something already done`. | "For the AI demo, accomplishments are the cleanest source material because they describe actual performance." |
| 5 | Set **Section** to `Leads` or `Achieves`. | "The evidence is already structured against the form section the rater will later write." |
| 6 | Paste the prepared accomplishment text. | "Specific facts matter: team size, task, result, and impact." |
| 7 | Click **+ Attach proof**, choose the prepared file, select the artifact type, and leave discrepancy unchecked unless the artifact is intentionally questionable. | "The proof and the narrative travel together; AI and the rater inherit the same source trail." |
| 8 | Save the entry and return to `/support-form`. | "The new fact is now visible as part of the rating-period record." |

### 3.4 Rater Segment - Generate From Fresh Evidence

| Step | Exact action | Highlight while doing it |
| --- | --- | --- |
| 1 | Use the profile menu to switch persona. Select **SSG Johnson - Squad Leader**. | "Now the rater sees the same evidence through their rating authority, not the Soldier's account." |
| 2 | Go to `/evaluations`. Open Davis's evaluation. If direct navigation is faster, open `/evaluations/dev-eval-davis/leads` or `/evaluations/dev-eval-davis/achieves`, matching the section used above. | "We are inside the NCOER authoring workspace, not a standalone AI chat." |
| 3 | Click **Show AI** if the panel is collapsed. | "AI is available inside the regulated section builder." |
| 4 | In **Soldier Accomplishments**, find the fresh entry, check it, and click **Generate bullets from selected (1)**. | "The rater chooses the exact documented fact used for generation." |
| 5 | Open **View source fact** on one suggestion. | "This is the provenance beat: the draft points back to the exact source fact." |
| 6 | Click **Use** on the best suggestion. | "Accept is a human rating-official decision." |
| 7 | Click **Edit** on another suggestion, make a small wording change, then **Save & Use**. | "The rater can improve the language without losing the AI provenance chain." |
| 8 | Reject a weaker suggestion. | "Rejection is a first-class outcome; the system does not pressure the rater to use generated text." |
| 9 | Click **Mark Complete** only after all pending suggestions are reviewed. | "The UI enforces review of suggestions before section completion, but it does not let AI decide the rating." |

### 3.5 Optional Upload Segment - Existing Documents to Reviewed Facts

Target time: **60-90 seconds**. Run this after the primary fresh-evidence route, and do not let it replace the safer platform-native route.

Transition line:

> "That is the future-state workflow: performance is captured throughout the year. But the Army will also need a transition path for existing support forms and locally maintained documents."

| Step | Exact action | Highlight while doing it |
| --- | --- | --- |
| 1 | Stay as **SSG Johnson** and open the same Davis section page. | "This segment shows migration from existing documents, not a bypass around the support-form workflow." |
| 2 | In **Soldier Support Form**, click **Upload existing support form**. | "The upload attaches to the existing evaluation relationship and authorization boundary." |
| 3 | Upload `SGT_Davis_Demo_Support_Form.pdf`. | "This is a synthetic demo record, not an official Army document." |
| 4 | Show status transitions: Uploading, Parsing, Review required. | "Parsing creates draft source facts. It does not create accepted evaluation content." |
| 5 | Show extracted facts, suggested form sections, source page, and confidence or review state. | "The point is not that it reads PDFs. The point is that existing records enter the same controlled evidence pipeline without being treated as automatically valid." |
| 6 | Accept one extracted fact, edit one, and reject one. | "Human confirmation is required before uploaded facts become usable evidence." |
| 7 | Click **Original support form** or the source-page affordance. | "The original document remains available for side-by-side review." |
| 8 | Stop. Generate from accepted facts only if David specifically asks. | "Accepted uploaded facts would enter the same rater-review suggestion queue; they still do not become final bullets automatically." |

## 4. Primary Workflow and Optional Transition

The demo should center on platform-native continuous capture. Uploaded-document parsing is a transition capability for existing records and locally maintained support forms.

### Primary route - Platform-generated support form

This is the safest live route and the main product behavior MERIT should teach the Army to adopt.

1. Sign in as the rated Soldier.
2. Open the support-form workspace for the active assignment.
3. Add a goal or accomplishment using the platform flow.
4. Attach proof such as a certificate, score sheet, photo, counseling note, or document.
5. Let the artifact captioning and entry context become source material.
6. Finalize the support form once it is hard-complete.
7. Initiate the evaluation from the current assignment.
8. Sign in as the rater and generate draft bullets from selected support-form evidence.

This route proves the behavioral change MERIT is trying to create: continuous capture replaces end-of-period memory scraping.

### Optional transition route - Uploaded support form or supplemental evidence

This is a useful transition segment, but it should follow the primary route rather than replace it.

1. Prepare a clean scanned or digital support form with realistic facts, dates, numbers, schools, scores, tasks, and impact statements.
2. Ensure the selected assignment already has a hard-complete support form path available; do not present upload as a bypass for the support-form gate.
3. Initiate or open the evaluation workspace.
4. Upload the document through the AI support-form/evidence workspace.
5. Let the system extract draft source facts, suggested section labels, source-page references, and review state.
6. Open the original uploaded document from the rater workspace.
7. Compare extracted facts against the source page, then accept one, edit one, and reject one.
8. Stop unless the PM asks to continue into generation.

This route proves that MERIT can rescue value from legacy artifacts and handwritten/scanned material, but it should be described as evidence ingestion plus rater review, not autonomous evaluation writing or automatic validation.

---

## 5. PM Demo Script

### Opening frame: the legacy problem

Say this plainly:

> "The original EES digitized the form. MERIT digitizes the performance-management process behind it. The goal is not to let AI rate Soldiers. The goal is to reduce leader workload, improve the quality and supportability of evaluations, and catch problems before they enter routing."

### Authoritative profile segment: reduce administrative burden

Demo action:

1. Sign in as SGT Davis.
2. Pause on the opening dashboard.
3. Show Microsoft-profile demo avatar, rank, grade, unit, UIC, MOS, duty title, assignment dates, ACFT status, body-composition status, active rating chain, IPPS-A source indicator, and visible `Demo integration` label.

Talk track:

- "The first thing to notice is what the Soldier did not have to enter. EES begins with the personnel and assignment information the Army already maintains."
- "For this prototype, these fields are populated through an IPPS-A integration stub. The data contract and user experience are designed around IPPS-A as the authoritative source, but this environment is not connected to production."
- "The profile image is also simulated through a Microsoft identity source. In an operational environment, the approved Microsoft profile service would provide it."
- "The rating chain remains governed separately through effective-dated rating assignments. Personnel data identifies the user; it does not independently grant rating authority."

### Soldier segment: capture the evidence

Demo action:

1. Open the support form.
2. Add the prepared live-fire rehearsal accomplishment tied to `Leads` or `Achieves`.
3. Attach one prepared proof artifact.
4. Save and move on.

Talk track:

- "This is where the evaluation starts: with a Soldier-owned performance record, not with a blank NCOER shell."
- "The proof matters because the AI and the rater both inherit the same evidence trail."
- "A sparse support form stays visible as a process problem instead of becoming an end-of-year writing emergency."

### Rater segment: generate and review bullets

Demo action:

1. Sign in as SSG Johnson.
2. Open Davis's evaluation.
3. Select the fresh accomplishment or uploaded source facts.
4. Generate AI bullet suggestions.
5. Accept one suggestion, edit one suggestion, and reject one suggestion if enough candidates exist.
6. Open the source/provenance view for an accepted bullet.

Talk track:

- "The rater is not asking AI to make up performance. The rater is asking AI to draft from documented performance."
- "Nothing jumps straight onto the final form. Suggestions sit in a review state until the rater acts."
- "The accepted bullet keeps its lineage: source entry, artifact caption or extracted fact, AI suggestion, rater decision, and final text."

### Trust segment: show the guardrails

Demo action:

1. Run or describe the consistency check.
2. Show unsupported-fact detection on numbers, dates, awards, schools, rankings, or other concrete claims.
3. Show the draft watermark on a non-final PDF if export is in scope.
4. Explain immutable snapshots: later edits to evidence do not rewrite what the rater saw when accepting a suggestion.

Talk track:

- "This is where the product earns trust. AI can make drafting faster, but the system must make unsupported claims harder to miss."
- "A great bullet is not just well-written. It is supportable."
- "The audit trail matters for the Soldier, the rater, the commander, and any later review."

### Workflow segment: finish the evaluation path

Demo action:

1. Complete or preview the rater sections.
2. Show rater signature sequencing.
3. Show senior-rater handoff.
4. Show supplementary reviewer scope if using the Davis path.
5. Show Soldier final-form review before the record reaches `COMPLETE`.

Talk track:

- "The AI feature is inside a regulated workflow, not bolted beside it."
- "The same assignment snapshot that controls who can write also controls who can sign, review, and export."
- "The Soldier gets a final rendered-form confirmation before completion."

### Optional uploaded-document segment: transition existing records

Demo action:

1. Open **Upload existing support form**.
2. Upload the prepared synthetic Davis PDF.
3. Show parsing state, extracted facts, suggested sections, source page, and confidence or review state.
4. Accept one fact, edit one fact, reject one fact, then open the original source page.
5. Stop unless the PM asks to generate more bullets.

Talk track:

- "That is the future-state workflow: performance is captured throughout the year. But the Army will also need a transition path for existing support forms and locally maintained documents."
- "The point is not, 'look, it reads PDFs.' The point is that existing records can enter the same controlled evidence pipeline without being treated as automatically valid."
- "Accepted uploaded facts still enter rater review; they do not become final bullets by themselves."

### Future-state dashboard segment: platform view

Show or discuss evaluation status, late support forms, profile utilization, senior-rater population, and the future rack-and-stack concept. Label any unimplemented screen or mocked view as **Concept** or **Future capability**.

### Close: platform impact

End with the product decision, not the feature list:

> "MERIT gives the Army a path from a form-centric evaluation system to a cloud-based performance-management platform: authoritative data in, documented performance throughout the year, human-owned evaluations, earlier error detection, and a defensible record of how every evaluation was built."

If discussion continues, then add:

> "The logical next step would be validating the workflow against the Army's integration, security, and operational constraints."

---

## 6. Rehearsal Checklist

Before a PM demo:

| Check | Why it matters |
| --- | --- |
| Run the real backend, not the mock server | AI, authorization, signatures, and workflow state must exercise real routes. |
| Start the frontend from the current branch | The demo should match the documented route and seeded personas. |
| Confirm IPPS-A and Microsoft profile demo labels are visible | The first product moment depends on making source-backed, read-only profile data obvious. |
| Seed or create a fresh assignment-backed support form | Support forms are consumed by evaluation creation; reused fixtures create false 409s. |
| Configure the AI provider keys required by the active generation routes | Missing keys fail closed and turn the AI segment into a manual-entry fallback. |
| Prepare one strong uploaded support form or artifact | The best AI demo starts with concrete facts: numbers, dates, schools, awards, tasks, and outcomes. |
| Rehearse accept/edit/reject states | The PM should see human control, not only a happy-path accept. |
| Rehearse the parser segment as optional | The core demo should still land if the PM does not ask about legacy-document ingestion. |
| Keep a backup manual bullet and screenshots | If live AI is unavailable, the workflow and provenance story can still be shown. |
| Avoid quarantined legacy records | They are intentionally excluded from normal active workflows. |

---

## 7. What Not To Overclaim

- Do not claim production accreditation is complete.
- Do not claim authoritative iPERMS/IPPS-A integration is live.
- Do not imply the Microsoft profile image is connected to production Microsoft Graph or an approved operational photo source.
- Do not claim upload bypasses the support-form completeness gate.
- Do not imply parsed facts from an uploaded support form are automatically valid.
- Do not present AI suggestions as final evaluation content before rater review.
- Do not center the full demo on the OER builder until officer authoring reaches NCOER parity.
- Do not describe senior-rater narrative AI as a complete end-to-end frontend feature.
- Do not use seeded polished bullets as the proof point; use fresh evidence created during the demo.
- Do not present a concept or future dashboard as implemented; label unimplemented surfaces as **Concept** or **Future capability**.

---

## 8. Success Criteria

The demo succeeds when the PM sees all of the following in one coherent story:

1. The opening dashboard reduces administrative entry by showing source-backed personnel and assignment context.
2. The IPPS-A and Microsoft profile integrations are honestly labeled as demo stubs, not production connections.
3. A fresh Soldier-owned fact enters the system.
4. The fact is tied to a support form, goal, artifact, uploaded document, or extracted source fact.
5. The rater uses AI to draft from that evidence.
6. The rater reviews and owns the final text.
7. The system can show where the bullet came from.
8. The system checks the evaluation before signature/export.
9. The workflow preserves role boundaries and regulatory sequence.
10. Optional uploaded-document parsing is understood as a controlled transition path, not as automatic validation.

That is the core MERIT pitch: **authoritative data in, better evidence captured earlier, human-owned evaluations, earlier error detection, and AI accelerating the rater instead of replacing the rater.**

---

**Related:** [06 - Roadmap & Status](./06-roadmap-and-status.md), [FLOWS - Workflow Test Runbook](./FLOWS.md), [12 - Customer Manual Acceptance Test Plan](./12-customer-manual-acceptance-test-plan.md).