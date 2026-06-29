# EES 2.0 — Agent Build Instructions
**Version:** Delta-2 (post-brainstorm, June 2026)  
**Source sessions:** FLOWS.md + architectural review conversation  
**Audience:** AI agent executing implementation tasks  
**Stack:** Next.js 14, Supabase (PostgreSQL), Prisma ORM, Anthropic Claude API (claude-sonnet-4-6), react-pdf

---

## How to Use This Document

Every section below is a **settled decision** — not a proposal. Each section states what to build, the rationale, any edge cases, and the data model implications. Implement in the priority order established in §18. Do not deviate from architecture decisions without flagging for human review first.

---

## Table of Contents

1. [Eval Initiation — Soldier-Led with Rater Confirmation](#1-eval-initiation--soldier-led-with-rater-confirmation)
2. [Soldier-Lite Wizard](#2-soldier-lite-wizard)
3. [Support Form Upload & AI Pipeline](#3-support-form-upload--ai-pipeline)
4. [AI Bullet Generation — From-Scratch Mode](#4-ai-bullet-generation--from-scratch-mode)
5. [AI Bullet UI — Accept / Edit / Reject with Guardrails](#5-ai-bullet-ui--accept--edit--reject-with-guardrails)
6. [Signature Invalidation Model](#6-signature-invalidation-model)
7. [Submission Gate — No Admin Required](#7-submission-gate--no-admin-required)
8. [HRC Correction Notes & Reg Viewer](#8-hrc-correction-notes--reg-viewer)
9. [RETURNED State — Correction Routing Sub-Flow](#9-returned-state--correction-routing-sub-flow)
10. [6-Type Consistency Check](#10-6-type-consistency-check)
11. [Counseling Milestone Attachments](#11-counseling-milestone-attachments)
12. [Notification System](#12-notification-system)
13. [Rater Notified on SR → Soldier Routing](#13-rater-notified-on-sr--soldier-routing)
14. [AI Bullet Visibility Boundary (Soldier vs Rater)](#14-ai-bullet-visibility-boundary-soldier-vs-rater)
15. [Reason Code Ownership](#15-reason-code-ownership)
16. [Counseling Compliance Analytics — Three-State Model](#16-counseling-compliance-analytics--three-state-model)
17. [Visual Design — Transitions & Aesthetic Direction](#17-visual-design--transitions--aesthetic-direction)
18. [Implementation Priority Order](#18-implementation-priority-order)
19. [Field Classification Map — Signature Invalidation Scope](#19-field-classification-map--signature-invalidation-scope)

---

## 1. Eval Initiation — Soldier-Led with Rater Confirmation

### Decision
The **rated soldier** initiates their own evaluation regardless of whether it is an NCOER or OER. This replaces the prior assumption that the rater owns initiation.

### Flow

```
Soldier logs in → sees "Initiate My Evaluation" CTA on Dashboard Zone A
    → runs Soldier-Lite Wizard (§2)
    → eval stub created in DRAFT status
    → notification fires to rater: "SGT Davis has initiated their evaluation. Review and begin Part IV."
    → eval appears in Rater's Zone B labeled "Initiated by Soldier — Awaiting Your Action"
Rater picks it up → confirms reason code (§15) → begins Part IV sections
```

### Rater Handoff State
Until the rater confirms the reason code and begins at least one Part IV section, the eval status stays `DRAFT`. The rater's Zone B card for this soldier should display a distinct "Soldier Initiated" badge — not the normal DRAFT chip — so it is visually distinct from a rater-created draft.

### No Gatekeeping by Form Type
Both NCOER and OER soldier initiations use the same initiation path. Form type is auto-determined by the soldier's rank at the time of creation (DA 2166-9-1 for E5/SGT, DA 2166-9-2 for E6–E8, DA 67-10-1/2 for officers).

---

## 2. Soldier-Lite Wizard

### Decision
The existing 5-step `EvalCreationWizard` (rater-facing) is **not used** for soldier initiation. A separate, scoped `SoldierInitWizard` is created with 3 steps.

### SoldierInitWizard — 3 Steps

**Step 1 — Confirm Identity & Period**
- Display the soldier's own name, rank, unit (pre-filled, read-only from their profile)
- Rating period: `FROM` date (pre-filled from RatingChain.periodStart if available, else manual entry) and `THRU` date (manual)
- Reason code: soldier selects from a scoped list (ANNUAL / CHANGE_OF_RATER / COMPLETE_THE_RECORD only — relief-cause reasons are **excluded** from the soldier-facing list and must be set by the rater per §15)

**Step 2 — Support Form Upload (Skippable)**
- Prominent prompt: "Upload your Support Form to help your rater write your evaluation."
- Upload accepts PDF or image (JPG/PNG). Multi-page PDF supported.
- Skip option labeled: "Skip for now — I'll upload later or my rater will write without it."
- If skipped: the soldier can upload the support form at any time from Dashboard Zone A while the eval is in DRAFT or RATER_IN_PROGRESS status.
- If uploaded: immediately triggers the AI ingest pipeline (§3) in the background. A progress indicator shows on the dashboard: "Your support form is being processed… we'll let your rater know when it's ready."

**Step 3 — Review & Submit**
- Summary card: name, rank, period, reason code, support form status (uploaded / skipped)
- Single CTA: "Submit to My Rater"
- On submit: eval row created in DB, `DRAFT` status, notification sent to rater

### What the Soldier Cannot Do in the Wizard
- Select rated soldier (it's always themselves)
- Select form type (auto-determined by rank)
- Select relief-for-cause or similar administrative reason codes
- See or preview AI-generated bullets (§14)

---

## 3. Support Form Upload & AI Pipeline

### Overview
The support form (DA 2166-9-1A, filled by hand or typed) is uploaded by the soldier. The system parses it and produces suggested bullets for the **rater only**. The soldier never sees the AI-generated bullets — they see only their own submitted form entries (§14).

### Three-Stage Pipeline

#### Stage 1 — Ingest (Vision Extraction)
- Accept: PDF (single or multi-page) or image file (JPG/PNG/HEIC)
- Send to Claude claude-sonnet-4-6 with a vision prompt
- Prompt goal: extract raw text from the form — accomplishments, dates, tasks, context notes — without structuring yet
- Output: raw extracted text blob, stored as `SupportFormRawExtract` in DB
- Handle handwritten forms: the vision model reads handwriting — do not pre-filter for print-only. Quality will vary; downstream steps handle ambiguity.
- If extraction confidence is low (Claude returns uncertainty markers), flag the upload with: "Some handwritten sections may not have been fully read. Your rater can see what was captured and add context manually."

**Stage 1 System Prompt (reference):**
```
You are reading a scanned U.S. Army DA 2166-9-1A Support Form. Extract all text you can read, 
including handwritten entries. For each accomplishment or entry found, output it on its own line 
prefixed with the section label if visible (e.g. "CHARACTER:", "ACHIEVES:"). If a date or 
timeframe is visible near the entry, include it in brackets. Do not restructure, summarize, 
or interpret — only extract what you can read. If a section is blank or illegible, write 
"[SECTION ILLEGIBLE]". Output plain text only.
```

#### Stage 2 — Parse into Typed Entries
- Send the Stage 1 raw extract to a second Claude call
- Goal: structure raw text into typed objects: `{ date?: string, section: PartIVSection, what: string, impact?: string, context?: string }`
- `PartIVSection` is one of: `CHARACTER | PRESENCE | INTELLECT | LEADS | DEVELOPS | ACHIEVES`
- Classify each entry to the most appropriate section — if ambiguous, default to `ACHIEVES`
- Output: JSON array of `SupportFormEntry` objects, stored in DB linked to `evaluationId`

**Stage 2 System Prompt (reference):**
```
You are classifying U.S. Army NCOER support form entries for the DA 2166-9-1A form.
Given the following raw extracted text, output a JSON array only — no preamble, no markdown fences.
Each object must have: { "section": one of [CHARACTER, PRESENCE, INTELLECT, LEADS, DEVELOPS, ACHIEVES],
"what": "what happened", "impact": "result or effect if visible", "date": "date or period if visible",
"context": "any additional context" }.
Classify each entry to the section it most directly supports. An entry about personal conduct goes to 
CHARACTER. An entry about training others goes to DEVELOPS. An entry about results or task execution 
goes to ACHIEVES. Entries about leading a team go to LEADS. Physical fitness or appearance goes to 
PRESENCE. Creative thinking or technical expertise goes to INTELLECT.
Output JSON only.
```

#### Stage 3 — Bullet Generation per Section
- For each of the 6 Part IV sections, call Claude with the classified entries relevant to that section plus the applicable regulation language
- Generate 3–5 ranked bullet candidates per section
- Each bullet must follow NCOER bullet format: action verb, impact, no personal pronouns, within 200-character limit
- Each bullet object includes:
  - `text`: the bullet string
  - `confidence`: HIGH / MEDIUM / LOW
  - `sourceEntryIds`: array of SupportFormEntry IDs that contributed (enables traceability)
  - `sectionKey`: which Part IV section this is for

**Stage 3 System Prompt (reference):**
```
You are a senior NCO writing NCOER bullets for the [SECTION] section of a DA 2166-9-[FORM] evaluation.
You are writing on behalf of the rater. The rated soldier's support form entries for this section are:

[ENTRIES]

Write exactly 5 bullet candidates, ranked best to worst. Each bullet must:
- Start with a strong action verb (past tense: "Led", "Trained", "Achieved", "Developed", etc.)
- Follow the Army action-impact format: what the soldier did, and what resulted
- Contain NO personal pronouns (no "he", "she", "they", "his", "her")
- Be 200 characters or fewer
- Sound like a senior leader wrote it, not a form-filler

Output JSON only. No preamble. No markdown. Format:
[{ "rank": 1, "text": "...", "confidence": "HIGH|MEDIUM|LOW" }]
```

### Storage
```
SupportFormUpload
  id, evaluationId, uploadedBy (userId), uploadedAt
  fileUrl (Supabase Storage), fileType (pdf|image)
  rawExtract (text), parseStatus (PENDING|COMPLETE|FAILED)
  parseError (nullable)

SupportFormEntry
  id, uploadId, evaluationId
  section (PartIVSection enum)
  what, impact, date, context
  createdAt

AIBulletSuggestion
  id, evaluationId, sectionKey
  text, confidence (HIGH|MEDIUM|LOW)
  sourceEntryIds (int[])
  rank (1–5)
  status (PENDING_REVIEW | ACCEPTED | EDITED | REJECTED)
  editedText (nullable — populated if rater edits)
  reviewedBy (userId, nullable), reviewedAt (nullable)
```

### Rater Notification on Parse Complete
When Stage 3 completes, notify the rater:
- In-app notification: "SGT Davis's support form has been processed. AI bullet suggestions are ready for your review."
- Email to mil email: same message with a direct link to the eval

---

## 4. AI Bullet Generation — From-Scratch Mode

### Decision
The AI bullet generator is available to raters **even if no support form was uploaded**. This is a first-class mode, not a fallback.

### From-Scratch Mode Trigger
If no `SupportFormUpload` exists for the eval when the rater opens a Part IV section, the AI panel shows:
- "No support form uploaded. You can still use AI to help write bullets."
- Input field: "Describe what this soldier did during this rating period" (free-text, no character limit)
- Optional: "Pull from soldier's past evals" (if prior eval data exists in the system — stub for MVP, note for future)
- On submit: runs Stage 3 only, using the rater's free-text as the entry input. Same bullet output format as support-form mode.

### UI Toggle
On every Part IV section editor, a persistent toggle in the top-right:
- "AI Suggestions" (on/off)
- When ON: shows the bullet suggestion panel alongside the text editor
- When OFF: full-width text editor only — pure manual mode

This ensures manual writing is always a first-class path, not a fallback.

---

## 5. AI Bullet UI — Accept / Edit / Reject with Guardrails

### Decision
The AI is assistive, never autopilot. The rater must take an **explicit action** on every AI-generated bullet before it can appear in the final eval. Passive acceptance (ignoring the suggestions and saving anyway) is not permitted — the system blocks finalizing a section if AI suggestions exist and have not been acted on.

### Section Editor Layout (when AI panel is ON)

```
┌─────────────────────────────────────────────────────────┐
│ ACHIEVES                                   [AI: ON │ OFF]│
├────────────────────────┬────────────────────────────────┤
│ SUPPORT FORM ENTRIES   │ AI BULLET SUGGESTIONS          │
│ (read-only, sourced    │ (ranked 1–5)                   │
│ from uploaded form)    │                                │
│                        │ ① Led squad through 3-day FTX  │
│ "Led squad through     │   — zero training failures    │
│ FTX Nov 2025, all      │   [HIGH]  [✓ Use] [✏ Edit] [✗]│
│ soldiers completed"    │                                │
│                        │ ② Executed FTX training plan...│
│ "Developed training    │   [MED]   [✓ Use] [✏ Edit] [✗]│
│ schedule for 12 pax"   │                                │
├────────────────────────┴────────────────────────────────┤
│ FINAL BULLETS (editable)                                │
│  • [cursor — type or paste accepted bullets here]       │
│                                                         │
│  [Regenerate Suggestions]     [Finalize Section →]      │
└─────────────────────────────────────────────────────────┘
```

### Actions Per Bullet
- **✓ Use (Accept):** Copies bullet text as-is into the Final Bullets area. Sets `status = ACCEPTED`.
- **✏ Edit:** Opens bullet text in an inline editor pre-populated with the AI text. On save, copies edited version to Final Bullets. Sets `status = EDITED`, stores `editedText`.
- **✗ Reject:** Dismisses bullet from the suggestion panel. Sets `status = REJECTED`. Does not copy anything.

### Gate Rule
"Finalize Section" button is **disabled** if any bullet has `status = PENDING_REVIEW` (i.e., never acted on). The button label changes to "Review all suggestions first (3 remaining)" showing the count. This forces the rater to engage with every suggestion — they can reject all of them, that's fine, but they cannot skip past without deciding.

### Source Traceability
Each AI suggestion displays a small "↗ Source" link that, when clicked, highlights the corresponding support form entry in the left panel. This builds trust: the rater can see exactly what soldier input led to each bullet.

### Confidence Badges
- `HIGH` → green badge
- `MEDIUM` → amber badge
- `LOW` → gray badge with tooltip: "Based on limited support form information — review carefully."

---

## 6. Signature Invalidation Model

### Core Principle
A signature attests to specific content at a specific moment. When content changes, the signatures that attested to the changed content are automatically invalidated. **No human manually un-signs.** The system handles invalidation, and affected parties receive a notification to re-review and re-sign.

### Signature Records
Each `Signature` record stores:
```
Signature
  id, evaluationId
  signerUserId, signerRole (RATER | SENIOR_RATER | SOLDIER | SUPP_REVIEWER)
  signedAt
  contentHash (SHA-256 of all fields in the signing scope for this role)
  nameConfirmation (typed name string)
  ipAddress, userAgent
  cacCertSerial (nullable — future PKI)
  isStale (boolean, default false)
  staledAt (nullable)
  staledByUserId (nullable)
  staledReason (FIELD_EDIT | ADMIN_CORRECTION)
```

### Content Hashing
On signature, compute a SHA-256 hash of the **signing scope** for that role:
- **RATER scope:** all Part IV section bullets + rater narrative + all Part I administrative fields
- **SR scope:** SR section narrative + SR rating box + rater scope (SR attests to the full document)
- **SOLDIER scope:** entire eval content (they are acknowledging the full document)
- **SUPP_REVIEWER scope:** entire eval content

When any field is edited post-signature, the system recomputes the hash for each affected scope and compares. If the hash differs → mark that `Signature.isStale = true`, record `staledAt`, `staledByUserId`.

### Invalidation Dependency Rules (by field changed)

| Field Changed | Invalidates Rater Sig | Invalidates SR Sig | Invalidates Soldier Sig | Invalidates SuppR Sig |
|---|---|---|---|---|
| Part IV bullet text | ✅ | ✅ | ✅ | ✅ |
| Rater narrative | ✅ | ✅ | ✅ | ✅ |
| SR narrative | ❌ | ✅ | ✅ | ✅ |
| SR rating box | ❌ | ✅ | ✅ | ✅ |
| Part I admin typo (name/rank/unit/MOS) | ❌ | ❌ | ❌ | ❌ |
| Rating period dates | ✅ | ✅ | ✅ | ✅ |
| Reason code | ✅ | ✅ | ✅ | ✅ |

See §19 for the full administrative field classification map.

### No Signature Order Gate
Signatures may be collected in **any order**. The system does not enforce sequence. What is enforced instead:
- Each signer can only sign when the content they are attesting to is complete (e.g., SR section must exist before SR signs — but the SR can sign before the soldier if they want)
- Submission gate (§7) requires all required signatures to be **present and non-stale**

### Re-sign Flow
When a signature is stalened:
1. Notification fires to the affected signer (in-app + email, §12)
2. Message: "The evaluation for [SOLDIER NAME] was updated after you signed. Please re-review and re-sign."
3. The eval displays a banner for the affected signer: "Your signature is no longer valid — a section was updated. [Review & Re-sign]"
4. Re-signing uses the same 2-step consent flow (scroll to bottom → type name) — no shortcuts even on a re-sign
5. On re-sign: a new `Signature` record is created (old record retained for audit trail with `isStale = true`), `isStale` on new record defaults to false

### Soldier Exception
The **rated soldier's signature is never automatically invalidated** by rater or SR edits. Rationale: the soldier acknowledges the eval as a whole at a point in time; post-sign edits by the rating chain are a separate administrative act. If a correction materially changes the eval content, the rater or SR must notify the soldier through the system's comment/notification mechanism, but the soldier is not required to re-sign unless HRC specifically requests it on a RETURNED eval.

---

## 7. Submission Gate — No Admin Required

### Decision
The eval can be submitted to HRC by the **Rater, Senior Rater, or Supplementary Reviewer**, not just Admin. Admin retains the ability to submit. The gate is signature completeness, not role.

### Submission Rules
An eval may be submitted (status `COMPLETE → SUBMITTED`) when **all** of the following are true:
- Eval status is `COMPLETE`
- `Signature` record exists for `RATER` role with `isStale = false`
- `Signature` record exists for `SENIOR_RATER` role with `isStale = false`
- `Signature` record exists for `SOLDIER` role with `isStale = false`
- If `eval.requiresSupplementaryReview = true`: `Signature` record exists for `SUPP_REVIEWER` role with `isStale = false`

### Submit Button Location
The Submit button appears on the eval detail view for any user who has permission to submit. It is **disabled with a tooltip** showing what is outstanding if any gate condition is not met. Example tooltip:
- "SR signature is stale — edit was made after signing. SR must re-sign before submission."
- "Supplementary review signature is missing."

### Notification on Submission
When status moves to `SUBMITTED`:
- All parties in the rating chain receive an in-app notification and email: "The evaluation for [RANK] [SOLDIER NAME] has been submitted to HRC."
- This includes the rated soldier.

---

## 8. HRC Correction Notes & Reg Viewer

### Decision
When HRC returns an eval, they can leave structured correction notes tied to specific sections and regulation citations. The system embeds DA PAM 623-3 and AR 623-3 as searchable, anchor-linked text so correction notes can deep-link directly to the relevant paragraph.

### Correction Note Object
```
CorrectionNote
  id, evaluationId
  createdAt, createdByRole (HRC_REVIEWER)
  sectionKey (nullable — null means eval-level, not section-level)
  regDocument (AR_623_3 | DA_PAM_623_3)
  regSection (string — e.g. "3-14b")
  freeText (string — human-readable correction instruction)
  assignedTo (RATER | SENIOR_RATER | BOTH)
  resolvedAt (nullable), resolvedByUserId (nullable)
```

### Reg Viewer
- Embed AR 623-3 and DA PAM 623-3 as structured text in the application database (not external links — Army network reliability is insufficient)
- Each paragraph has a stable anchor ID: `ar623-3-para-3-14b`
- Correction notes render as inline banners on the relevant section with a "See Regulation" button that opens a slide-over panel showing the relevant paragraph, highlighted
- The reg viewer is also accessible as a standalone reference at `/references/ar-623-3` and `/references/da-pam-623-3` with full-text search

### Display
Correction notes appear:
- As red banners inline on the affected section (or at the top of the eval if eval-level)
- On the eval overview card in Zone B with a "Corrections Required" badge
- In the rater/SR notification and email with the correction text included

---

## 9. RETURNED State — Correction Routing Sub-Flow

### Decision
When HRC returns an eval, corrections route to the appropriate party based on the `CorrectionNote.assignedTo` field. After corrections are made, the content-hash mechanism automatically stalens any signatures that depended on the changed fields, requiring re-sign before re-submission.

### State Machine Additions
The existing `RETURNED → RATER_IN_PROGRESS` transition is **replaced** with:

```
RETURNED → CORRECTION_IN_PROGRESS (new status)
```

`CORRECTION_IN_PROGRESS` behaves like `RATER_IN_PROGRESS` in terms of edit access but:
- Displays the correction notes prominently (§8)
- The timeline shows "Returned by HRC — Corrections Required"
- Both rater and SR can have edit access simultaneously if correction notes are assigned to both

After corrections are made, the affected parties resolve each `CorrectionNote` (checkbox: "I have addressed this correction"). When all correction notes are resolved:
- Stale signature detection runs automatically (§6)
- Affected parties are notified to re-sign
- Once all required signatures are non-stale, submission is re-enabled
- Status advances to `COMPLETE` again, then the submitter sends to HRC

### New State in Status Machine

| Status | Token | Visual |
|---|---|---|
| `CORRECTION_IN_PROGRESS` | `--status-correction` | ✗ maroon with pencil icon |

---

## 10. 6-Type Consistency Check

### Decision
Before a rater can route to the SR, the system runs 6 automated consistency checks on the eval. This is a **soft gate** — the rater sees warnings and must acknowledge them, but can override and proceed. The check results are logged.

### The 6 Checks

**Check 1 — Prohibited Language**
Scans all bullet text and narratives for:
- Bias/discriminatory language (race, religion, gender, national origin, age markers)
- Known banned Army phrases (maintained as a configurable list in the DB)
- First-person pronouns in bullets ("he", "she", "they", "his", "her", "their")
Output: list of flagged strings with location (section + character position)

**Check 2 — Rating-Narrative Alignment**
Compares the rater's overall rating box selection with the sentiment and strength of the rater narrative using Claude:
- If the rating is FAR EXCEEDED but the narrative is generic or contains hedging language → flag
- If the rating is NOT MET STANDARD but the narrative has no supporting specifics → flag
Output: alignment score (ALIGNED / POSSIBLE_MISMATCH / MISMATCH) + explanation

**Check 3 — Bullet Format Compliance**
For each bullet in every section:
- Starts with an action verb (first word must be a past-tense verb)
- No personal pronouns
- Within character limit (200 characters for NCOER)
- Action-impact structure present (heuristic: does the bullet contain both a "what" and a "result"?)
Output: per-bullet pass/fail with specific violation noted

**Check 4 — Cross-Section Duplication**
Compares bullet text across sections for semantic duplication using embedding similarity:
- If the same accomplishment appears in both LEADS and ACHIEVES → flag
- Threshold: >75% semantic similarity = flag
Output: list of duplicate pairs with section locations

**Check 5 — Completeness**
- Every required Part IV section has at least 1 bullet
- Rater narrative field is non-empty
- No required administrative (Part I) fields are blank
Output: list of empty required fields

**Check 6 — Profile Consistency (SR only)**
This check runs for the **Senior Rater** before they route to the soldier:
- Compares the SR's rating for this eval against their historical profile distribution
- If the SR has given FAR EXCEEDED to >25% of their rated soldiers this period → flag (grade inflation warning)
- Profile meter data is already maintained per §5 of FLOWS.md
Output: current distribution vs. this rating, flag if threshold exceeded

### Check UI
After the rater clicks "Finalize and Route to SR", run all 6 checks. Display results in a `ConsistencyCheckModal`:
- Green checks for passed items
- Amber warnings for issues
- Red errors for hard violations (prohibited language is the only hard block — all others are warnings)

Rater must:
- Fix any red errors (cannot proceed until cleared)
- For amber warnings: either fix or check "I acknowledge this warning and am proceeding intentionally"
- Each acknowledgment is logged with timestamp and userId

---

## 11. Counseling Milestone Attachments

### Decision
Counseling milestones support optional document attachment. The milestone has three distinct completion states tracked separately for analytics.

### Three-State Counseling Completion Model
```
counselingStatus enum:
  NOT_DONE          — milestone is past due and not completed
  DONE_NO_RECORD    — counseling occurred, no document attached (soldier checked "no counseling to attach")
  DONE_WITH_RECORD  — counseling occurred, DA 4856 or equivalent uploaded
```

### DB Schema Addition
```
Milestone (additions)
  counselingStatus (counselingStatusEnum, nullable — only for counseling milestone types)
  attachmentUrl (nullable — Supabase Storage URL)
  attachmentUploadedAt (nullable)
  noRecordConfirmedBy (nullable userId — who checked the "no record" box)
  noRecordConfirmedAt (nullable)
```

### UI for Marking a Counseling Milestone Complete
When a rater/SR clicks to complete a counseling milestone, they see two options:
1. **Upload Counseling Form** — file upload (DA 4856 PDF preferred, any PDF accepted), sets `counselingStatus = DONE_WITH_RECORD`
2. **No counseling document** → checkbox: "Counseling was conducted but I do not have a document to attach." Sets `counselingStatus = DONE_NO_RECORD`. Requires the user to check this box explicitly — it is not a default.

### Analytics Distinction (§16)
The analytics dashboard distinguishes all three states:
- DONE_WITH_RECORD → "Counseled & Documented" (green)
- DONE_NO_RECORD → "Counseled, No Record" (amber)
- NOT_DONE / overdue → "Not Counseled" (red)

A unit commander seeing "80% compliance" must be able to tell whether the 80% is documented or just self-reported.

---

## 12. Notification System

### Decision
Every actionable event in the eval lifecycle triggers both an **in-app notification** and an **email to the user's military email address** on record.

### Notification Events

| Event | Who Notified | In-App | Email |
|---|---|---|---|
| Soldier initiates eval | Rater | ✅ | ✅ |
| Support form parse complete | Rater | ✅ | ✅ |
| Rater routes to SR | SR | ✅ | ✅ |
| SR routes to soldier | Soldier + Rater | ✅ | ✅ |
| Soldier signs | Rater + SR | ✅ | ✅ |
| Supp. reviewer signs (if required) | Rater + SR + Soldier | ✅ | ✅ |
| Eval submitted to HRC | All chain members + Soldier | ✅ | ✅ |
| HRC returns eval (RETURNED) | Rater + SR | ✅ | ✅ |
| HRC accepts eval (ACCEPTED) | All chain members + Soldier | ✅ | ✅ |
| Signature stalened by edit | Affected signer | ✅ | ✅ |
| Milestone due in ≤7 days | Rater + SR | ✅ | ✅ |
| Milestone overdue | Rater + SR + Commander | ✅ | ✅ |
| Delegate appointed | Delegate | ✅ | ✅ |
| Chain reminder sent | Whoever is next in chain | ✅ | ✅ |

### In-App Notification Model
```
Notification
  id, userId, evaluationId (nullable)
  type (NotificationEventEnum)
  title (string, short — shown in bell menu)
  body (string — full message)
  linkTo (route string — where clicking takes the user)
  readAt (nullable)
  createdAt
```

### Email
- Send from a unit-identifiable sender name: "EES 2.0 — [Unit Name]"
- Subject format: "[EES 2.0] Action Required: [RANK] [SOLDIER NAME] Evaluation"
- Body: plain text explanation of the event + a direct deep link to the eval
- Do not include sensitive eval content in the email body — link to the system

### Bell Icon (in-app)
- Badge count: unread notification count
- Dropdown: last 10 notifications with read/unread state
- "Mark all read" button
- "View all notifications" links to `/notifications` full-page list

---

## 13. Rater Notified on SR → Soldier Routing

### Decision
When the SR routes an eval to the soldier for acknowledgment, the **rater receives a notification** informing them the eval has advanced. This closes the loop since the rater has no further action required at this stage but should be aware.

### Message
- In-app: "SFC Williams has completed their section and routed [SOLDIER NAME]'s evaluation for soldier acknowledgment."
- Email: same content with link to view-only eval

---

## 14. AI Bullet Visibility Boundary (Soldier vs Rater)

### Decision — Hard Boundary
The AI-generated bullet suggestions are **never visible to the rated soldier**. This is a data access boundary, not just a UI decision.

### Implementation
- `AIBulletSuggestion` records are scoped to rater/SR access in the Supabase RLS policy: `auth.uid() IN (SELECT raterId, seniorRaterId FROM RatingChain WHERE id = evaluation.ratingChainId)`
- The soldier's view of the eval — at any status — does not include the AI suggestions panel, the bullet suggestion API endpoints, or any reference to AI assistance
- What the soldier does see: their own submitted `SupportFormEntry` records (their own writing), the completed Part IV bullets (rater's final text), and their own support form upload status

### Rationale
If the soldier sees AI-generated bullet candidates, they will form expectations about what will appear in their final eval. If the rater modifies or rejects those bullets, the soldier may perceive bias or negligence. The wall protects both the rater's discretion and the soldier's experience.

---

## 15. Reason Code Ownership

### Decision
The **soldier** selects a reason code during the Soldier-Lite Wizard from a **restricted list**. The **rater** confirms or changes the reason code during their first action on the eval. The rater's selection is final and is what gets recorded on the eval.

### Soldier-Accessible Reason Codes
- ANNUAL
- CHANGE_OF_RATER
- COMPLETE_THE_RECORD

### Rater-Only Reason Codes (not available in soldier wizard)
- RELIEF_FOR_CAUSE
- SENIOR_RATER_OPTION
- 60-DAY_OPTION
- Any code where the circumstances are determined by command, not the soldier

### Rater Confirmation Step
When the rater opens a soldier-initiated eval for the first time, a modal appears before they can begin editing:
```
"SGT Davis initiated this evaluation with reason: ANNUAL.
 Rating period: [FROM] to [THRU].
 Please confirm or update this information."

 [Reason Code dropdown — all codes available to rater]
 [FROM date field]
 [THRU date field]
 [Confirm & Begin →]
```
This is a required step — the rater cannot access the Part IV sections until they confirm.

---

## 16. Counseling Compliance Analytics — Three-State Model

### Decision
Analytics must distinguish three counseling states (not a binary done/not-done) to give commanders an accurate compliance picture.

### Analytics Display
On the commander's `/analytics` page, the counseling compliance widget shows:

```
COUNSELING COMPLIANCE — Current Rating Period

Initial Counseling:   ████████░░  80%
  ├─ Documented:       60% (12/20 soldiers)   [green]
  ├─ Undocumented:     20% (4/20 soldiers)    [amber]
  └─ Not Completed:    20% (4/20 soldiers)    [red]

Quarterly (Q1):       ██████░░░░  60%
  ...same breakdown...
```

The headline % treats DONE_WITH_RECORD + DONE_NO_RECORD as "compliant" but the breakdown is always shown so commanders can distinguish.

---

## 17. Visual Design — Transitions & Aesthetic Direction

### Core Principle
EES 2.0 should feel like the **next evolution** of the Army's evaluation tooling — not a consumer app, not a legacy government form wrapper. Modern, purposeful, and trusted.

### Border Radius
- Cards: `border-radius: 8px`
- Inputs and form fields: `border-radius: 6px`
- Buttons: `border-radius: 6px`
- Modals: `border-radius: 12px`
- Chips/badges: `border-radius: 4px`
- No pill shapes (`border-radius: 9999px`) except for small status dots
- No organic curves, blobs, or decorative arcs anywhere

### Transition Tokens
```css
--transition-fast:   150ms ease-out;   /* hover states, button presses */
--transition-normal: 220ms ease-out;   /* panel reveals, tab switches */
--transition-slow:   350ms ease-out;   /* modal entrances, page transitions */
```

### Page Transitions
- Route changes: content fades out (opacity 1→0, 120ms), new content fades in (opacity 0→1, 220ms) with a 30px upward slide (translateY 30px→0)
- Use `framer-motion` or CSS transitions with Next.js `useRouter` `events` listener
- Reduced motion: all transitions fall back to instant (no animation) when `prefers-reduced-motion: reduce` is set

### Micro-Interactions
- Button hover: `transform: translateY(-1px)`, shadow deepens slightly, `150ms ease-out`
- Button active/press: `transform: translateY(0)`, shadow returns, `80ms ease-in`
- Card hover (clickable cards only): border color lightens 15%, `150ms ease-out`
- Status badge entrance: fade-in only, no bounce, no spring
- AI suggestion bullet entrance: stagger cards in from bottom, 40px translateY → 0, 30ms delay between each card
- Sidebar active item: background slides in using `::before` pseudo-element with `200ms ease-out`

### What Not to Do
- No spring physics / bounce animations
- No loading spinners that loop indefinitely — use skeleton loaders instead
- No decorative gradients on content surfaces (gradient is OK on the sidebar only)
- No confetti, celebration animations, or consumer-UX flourishes

### Existing Design Tokens (do not change)
- Dark navy sidebar: `#1B2A4A`
- OD green for completion states: `#4A5C2F`
- All other tokens as established in delta.md design system section

---

## 18. Implementation Priority Order

Build in this sequence. Each phase is a testable checkpoint.

### Phase 1 — AI Testing Mode (Immediate)
**Goal:** Be able to upload a handwritten support form and receive suggested bullets.

1. `SupportFormUpload` model + Supabase Storage bucket
2. Stage 1 ingest endpoint: `POST /api/support-form/upload` → triggers vision extraction via Claude
3. Stage 2 parse endpoint: runs after Stage 1, stores `SupportFormEntry` records
4. Stage 3 bullet generation: `POST /api/support-form/generate-bullets` → produces `AIBulletSuggestion` records
5. Rater bullet review UI: section editor with AI panel (accept/edit/reject, §5)
6. From-scratch mode: AI panel available without support form upload (§4)

### Phase 2 — Soldier Initiation
1. `SoldierInitWizard` — 3-step component
2. Reason code scoping (soldier list vs rater list)
3. Rater confirmation modal on first open
4. Notification: soldier → rater on initiation

### Phase 3 — Signature Model
1. `Signature.contentHash` computation on sign
2. Content hash recomputation on any field edit
3. Automatic stale-flagging logic
4. Re-sign notification flow
5. Submission gate updated to check `isStale`
6. Submission permission expanded to Rater/SR/SuppR (§7)

### Phase 4 — Corrections & Reg Viewer
1. `CorrectionNote` model
2. Reg text embedding (AR 623-3, DA PAM 623-3) into DB with paragraph anchors
3. Reg viewer slide-over component
4. `CORRECTION_IN_PROGRESS` status
5. HRC correction note creation interface

### Phase 5 — Notifications
1. `Notification` model
2. In-app notification bell component
3. Email dispatch service (all events in §12)
4. `/notifications` full-page list

### Phase 6 — Consistency Check
1. Checks 1, 3, 5 (prohibited language, bullet format, completeness — deterministic, no AI call)
2. Checks 2, 4 (alignment and duplication — Claude calls)
3. Check 6 (SR profile — uses existing profile meter data)
4. `ConsistencyCheckModal` component
5. Acknowledge-and-proceed logging

### Phase 7 — Counseling & Analytics
1. Three-state counseling model on `Milestone`
2. Upload flow for DA 4856 attachment
3. "No record" checkbox with explicit confirmation
4. Analytics breakdown widget (§16)

---

## 19. Field Classification Map — Signature Invalidation Scope

The following is the authoritative list of which fields, when edited, trigger signature invalidation for which roles. Implement this as a lookup table in the signature invalidation service.

### SUBSTANTIVE fields — invalidate as specified in §6

| Field | Invalidates Rater | Invalidates SR | Invalidates Soldier | Invalidates SuppR |
|---|---|---|---|---|
| Any Part IV bullet text | ✅ | ✅ | ✅ | ✅ |
| Rater narrative (Part IVf) | ✅ | ✅ | ✅ | ✅ |
| Overall rater box (rating selection) | ✅ | ✅ | ✅ | ✅ |
| SR narrative | ❌ | ✅ | ✅ | ✅ |
| SR overall rating box | ❌ | ✅ | ✅ | ✅ |
| Rating period FROM date | ✅ | ✅ | ✅ | ✅ |
| Rating period THRU date | ✅ | ✅ | ✅ | ✅ |
| Reason for submission (reason code) | ✅ | ✅ | ✅ | ✅ |
| Part III duty description (APFT/HTWTM) | ✅ | ✅ | ✅ | ✅ |

### ADMINISTRATIVE fields — do NOT invalidate any signature

These are clerical fields where a post-sign correction is routine and does not change what any party attested to substantively:

| Field | Notes |
|---|---|
| Soldier's SSN (last 4) | Typo correction |
| Soldier's name spelling | Typo correction |
| Unit name / UIC | Typo correction |
| MOS/AOC | Typo correction |
| Duty title | Minor title correction only — if duty materially changes, treat as substantive |
| Rater's name, rank, SSN | Clerical |
| SR's name, rank, SSN | Clerical |
| Organization address | Clerical |
| Date administrative fields added/corrected | Clerical |

### Edge Cases
- **Duty title change that reflects a new assignment mid-period:** treat as SUBSTANTIVE (invalidates all)
- **Name change due to legal name change:** treat as ADMINISTRATIVE (no invalidation, note in audit log)
- **Any change after `SUBMITTED` status:** not permitted in the system — all fields are locked once submitted. HRC corrections come back as a `CORRECTION_IN_PROGRESS` re-open.

---

*Document version: Delta-2 | Session: June 2026 | Next review: after Phase 1 completion*
