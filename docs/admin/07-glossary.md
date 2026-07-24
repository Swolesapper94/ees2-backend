# 07 — Glossary

> Plain-language definitions of the Army and technical terms used throughout this documentation. Skim it once; refer back as needed.

---

## Army / evaluation terms

**ACFT (Army Combat Fitness Test)** — The Army's physical fitness test. Score sheets are a common support-form artifact.

**AER (Academic Evaluation Report)** — A report documenting performance in a course/school; a common certificate-type artifact.

**AR 623-3** — The Army Regulation governing the Evaluation Reporting System: who is evaluated, when, and how. EES 2.0 encodes its rules (timelines, counseling, signatures) as software guardrails.

**Bullet** — A single achievement statement on the evaluation, written in the Army's action-impact format (strong verb + what was done + measurable result), no personal pronouns, ≤ ~200 characters.

**Counseling (initial / quarterly)** — Required leader-to-soldier performance conversations. AR 623-3 mandates an initial counseling (within 30 days of the rating period start) and quarterly follow-ups. Tracked as milestones.

**DA PAM 623-3** — The Department of the Army Pamphlet with the procedural detail behind AR 623-3, including bullet-writing rules and prohibited content.

**DA Form 2166-9 series** — The NCOER forms. `-9-1` for SGT (E5), `-9-2` for SSG–1SG/MSG (E6–E8), `-9-3` for CSM/SGM/SMA (E9). The `-9-1A` is the *support form*.

**DA Form 67-10 series** — The OER forms for officers (and the `-10-1A` officer support form). Grade-dependent variant, resolved automatically from rank.

**Evaluation (NCOER / OER)** — The official periodic performance report. **NCOER** = Noncommissioned Officer Evaluation Report (enlisted leaders, E5+). **OER** = Officer Evaluation Report.

**HRC (Human Resources Command)** — The Army command that processes evaluations. A report that violates rules is "returned" by HRC for correction — costly rework EES 2.0 aims to reduce.

**iPERMS (Interactive Personnel Electronic Records Management System)** — The Army's official system of record for personnel documents. It has no public API, so EES 2.0 uses a soldier self-attestation flag to surface possible discrepancies transparently rather than faking automated verification.

**IPPS-A (Integrated Personnel and Pay System–Army)** — The Army's integrated HR/pay system; a candidate for future authorized integration.

**MOS (Military Occupational Specialty)** — A soldier's job code (e.g., 11B, infantry). Used as context for doctrinally-appropriate bullets.

**"Most Qualified" profile / cap** — A constraint on senior raters: only a limited percentage of the soldiers they rate at a grade may receive the top "most qualified" box. EES 2.0 tracks and visualizes this cap so it isn't accidentally exceeded.

**PCS (Permanent Change of Station)** — A soldier's move to a new assignment. Historically, documented performance is lost across a PCS; EES 2.0 preserves it. A PCS naturally starts a fresh rating chain.

**Rated soldier** — The person being evaluated (can be an NCO or an officer).

**Rater** — The rated soldier's direct supervisor, who writes the performance (Part IV) assessment.

**Rating chain** — The ordered supervisory relationship (rated soldier → rater → senior rater → optional reviewer) that determines who has authority over which evaluation. The backbone of authorization in EES 2.0.

**Reason code / reason for submission** — Why an evaluation is being written (Annual, Change of Rater, Complete the Record, Relief for Cause, etc.). Administrative/relief reasons are rater-controlled, not soldier-selectable.

**Relief for Cause** — An adverse evaluation reason; deliberately excluded from the soldier-facing initiation options.

**Reviewer / Supplementary review** — An additional review step required in certain cases (e.g., when the rater is junior). Modeled in the chain and signature flow.

**Senior rater** — The rater's supervisor, who assesses the soldier's *potential* and handles succession planning; subject to the profile cap.

**Six leadership dimensions** — The Army's evaluation attributes, identical for NCO and officer forms: **Character, Presence, Intellect, Leads, Develops, Achieves.** In code, these are the `SectionKey` values for the Part IV sections.

**Succession planning** — Senior-rater guidance on the soldier's next assignments (two successive + one broadening, per AR 623-3).

**Support form** — The year-long performance record (`DA 2166-9-1A` / `67-10-1A`) that is *supposed* to feed the evaluation. EES 2.0's core insight is to make this a continuous, proof-backed log instead of a deadline-night reconstruction.

**UIC (Unit Identification Code)** — The unique code identifying a unit.

---

## EES 2.0 / product terms

**Anti-autopilot** — The governing design principle: AI assists and suggests, but the human rater reviews, edits, and owns every bullet. Enforced by three guardrails — evidence-in, mandatory review, permanent provenance.

**Artifact** — A piece of proof a soldier attaches to a support-form entry: Certificate/Award, Score Sheet, Photo, Document, or Other.

**Artifact caption** — A short, factual AI-generated description of what an artifact shows, produced once at upload and reused as context for bullet generation (so images aren't re-processed every time).

**Bullet source / provenance** — The label every final bullet carries: `HUMAN`, `AI_MODIFIED`, or `AI_UNMODIFIED`. Recorded permanently for auditability.

**Bullet provenance chain** — The full, permanent link from a final AI-touched bullet back to the AI suggestion it came from, the source support-form entries selected for it, and the evidence snapshot used to generate it. Reviewable via a "view source" affordance so nothing is a black box after acceptance.

**Completeness gate (two-tier)** — **Hard gate** = Part I–III admin + at least one goal in any dimension (unlocks evaluation initiation). **Soft indicator** = all six dimensions have a goal (progress display only; never blocks).

**Consistency check** — A pre-signature validation that scans for contradictions, unresolved unsupported-fact claims, and regulation issues across the evaluation.

**Counseling preparation (workspace)** — The in-app workspace a rater uses to prepare for and reconcile a required official counseling session (DA Form 4856). It composes goals, evidence, and rater observations since the last session and records a short outcome summary plus an optional reference/link to the completed official record. It is not a second official counseling process.

**Evidence-driven evaluation** — The paradigm shift EES 2.0 represents: the evaluation is a byproduct of a documented year of performance, versus **event-driven** (deadline-scramble) evaluation.

**Goal** — A Soldier-authored statement of intent for one leadership dimension, submitted to the assigned rater for approval or revision. Approved goals give a 3-5-per-dimension focus advisory (never blocking) and can be carried forward, unedited, into a successor support form via an explicit link. A goal is context for evidence, not evidence itself — distinct from an **accomplishment**, which documents something already done.

**iPERMS-discrepancy flag (`flaggedByServiceMember`)** — A soldier's honest self-attestation that an artifact may not be reflected in iPERMS or contains a discrepancy, surfaced to the rater/senior rater instead of being hidden.

**Performance timeline** — A read-only, chronological, filterable view composing a soldier's logged support-form entries, counseling sessions, and milestones for a rating period, giving the rater full context before drafting or finalizing bullets.

**Performance observation** — A rater-owned factual note about a soldier's performance, separate from the soldier's own logged accomplishments. Private to the assigned rater until released through counseling; only the assigned rater may author, edit, delete, or release one.

**Rater confirmation** — A rater's explicit review status on a soldier-logged entry: `UNREVIEWED`, `CONFIRMED` (trusted as context), `NEEDS_CLARIFICATION` (with a note), or `NOT_USED`. Distinct from, and complementary to, the soldier's own artifact-level self-attestation flag.

**Rating relationship map** — The default org-chart-style visualization of the current rating scheme (senior rater → rater → rated soldier, with reviewers and assignment exceptions shown inline), with a sortable table available as an alternate view.

**Soldier Accomplishments widget** — The rater-facing panel in the section builder that lists the soldier's logged accomplishments (with proof and the rater's confirmation status) for a dimension and turns the selected ones into draft bullets.

**Source snapshot** — An immutable copy of the exact entry text and artifact captions an AI suggestion was generated from, captured at generation time and stored permanently on the suggestion. Guarantees that a later edit or deletion of the underlying entry can never rewrite what the record shows the AI was actually given.

**Stale signature** — A signature invalidated because the content it signed was later edited, detected automatically via content hashing.

**Unsupported-fact warning** — An advisory flag raised when a bullet contains a specific, checkable claim (a number, percentage, date, school name, or award/ranking) that doesn't appear anywhere in the evidence it was generated from. Deterministic (no AI judgment call), never blocking on its own — the rater decides how to resolve it.

---

## Technical terms

**App Router** — The modern Next.js routing model used by the frontend.

**Bearer token** — The Supabase-issued JWT sent on every API request (`Authorization: Bearer <token>`) and verified server-side.

**Access grant** — A revocable, accepted, time-limited, capability-limited grant that lets a person assist with one scoped support form, evaluation, assignment, or approved administrative unit scope. It does not make the helper a rating official or allow impersonation.

**Access and Assistance** — The user-facing feature for managing people helping me and people I assist. Every assistant action is recorded under the helper's own account.

**OpenAI** — The configured provider for text generation and vision, used for support-form extraction, artifact captioning, and rater bullet suggestions through `OPENAI_API_KEY` and `OPENAI_MODEL`.

**Express** — The Node.js web framework running the backend API.

**JWT (JSON Web Token)** — A signed token proving a user's identity; issued by Supabase Auth, verified by the backend.

**Next.js** — The React framework powering the frontend.

**Prisma** — The type-safe ORM the backend uses to talk to PostgreSQL.

**PostgreSQL** — The relational database (hosted via Supabase) that stores all EES data.

**RAG (Retrieval-Augmented Generation)** — Feeding relevant regulation text (`RegulationChunk`) into the AI prompt so generated bullets are doctrinally grounded rather than generic.

**RLS (Row-Level Security)** — PostgreSQL policies that restrict row access at the database layer — the deepest of the three authorization layers.

**shadcn/ui** — The component library (built on Radix primitives + Tailwind) used for the frontend UI.

**Supabase** — The managed platform providing PostgreSQL, authentication, and object storage.

**Supabase Storage** — Where uploaded files (artifacts, scanned support forms) are stored.

**Tailwind CSS** — The utility-first styling framework used by the frontend.

**Zod** — The schema-validation library that checks every incoming API request body.

---

*End of documentation set. Return to the [index](./README.md).*
