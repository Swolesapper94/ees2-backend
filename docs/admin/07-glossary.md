# 07 — Glossary

> Plain-language definitions of the Army and technical terms used throughout this documentation. Skim it once; refer back as needed.

---

## Army / evaluation terms

**ACFT (Army Combat Fitness Test)** — The Army's physical fitness test. Score sheets are a common support-form artifact.

**AER (Academic Evaluation Report)** — A report documenting performance in a course/school; a common certificate-type artifact.

**AR 623-3** — The Army Regulation governing the Evaluation Reporting System. MERIT encodes relevant timelines, counseling, assignment, and signature rules as software guardrails.

**Bullet** — A single achievement statement on the evaluation, written in the Army's action-impact format (strong verb + what was done + measurable result), no personal pronouns, ≤ ~200 characters.

**Counseling (initial / quarterly)** — Required leader-to-soldier performance conversations. AR 623-3 mandates an initial counseling (within 30 days of the rating period start) and quarterly follow-ups. Tracked as milestones.

**DA PAM 623-3** — The Department of the Army Pamphlet with the procedural detail behind AR 623-3, including bullet-writing rules and prohibited content.

**DA Form 2166-9 series** — The NCOER forms. `-9-1` for SGT (E5), `-9-2` for SSG–1SG/MSG (E6–E8), `-9-3` for CSM/SGM/SMA (E9). The `-9-1A` is the *support form*.

**DA Form 67-10 series** — The OER forms for officers (and the `-10-1A` officer support form). Grade-dependent variant, resolved automatically from rank.

**Evaluation (NCOER / OER)** — The official periodic performance report. **NCOER** = Noncommissioned Officer Evaluation Report (enlisted leaders, E5+). **OER** = Officer Evaluation Report.

**HRC (Human Resources Command)** — The Army command that processes evaluations. A returned report requires correction and rework that MERIT aims to reduce.

**iPERMS (Interactive Personnel Electronic Records Management System)** — The Army's official personnel-document system. Because no public API is available, MERIT uses Soldier self-attestation to surface possible discrepancies rather than implying automated verification.

**IPPS-A (Integrated Personnel and Pay System–Army)** — The Army's integrated HR/pay system; a candidate for future authorized integration.

**MOS (Military Occupational Specialty)** — A soldier's job code (e.g., 11B, infantry). Used as context for doctrinally-appropriate bullets.

**"Most Qualified" profile / cap** — A constraint on senior raters. MERIT tracks and visualizes the applicable limit as decision support.

**PCS (Permanent Change of Station)** — A Soldier's move to a new assignment. MERIT preserves prior-period evidence and starts future work from a new rating relationship.

**Rated soldier** — The person being evaluated (can be an NCO or an officer).

**Rater** — The rated soldier's direct supervisor, who writes the performance (Part IV) assessment.

**Rating chain** — The ordered relationship (rated Soldier → rater → senior rater → optional reviewer) that determines evaluation authority in MERIT.

**Reason code / reason for submission** — Why an evaluation is being written (Annual, Change of Rater, Complete the Record, Relief for Cause, etc.). Administrative/relief reasons are rater-controlled, not soldier-selectable.

**Relief for Cause** — An adverse evaluation reason; deliberately excluded from the soldier-facing initiation options.

**Reviewer / Supplementary review** — An additional review step required in certain cases (e.g., when the rater is junior). Modeled in the chain and signature flow.

**Senior rater** — The rater's supervisor, who assesses the soldier's *potential* and handles succession planning; subject to the profile cap.

**Six leadership dimensions** — The Army's evaluation attributes, identical for NCO and officer forms: **Character, Presence, Intellect, Leads, Develops, Achieves.** In code, these are the `SectionKey` values for the Part IV sections.

**Succession planning** — Senior-rater guidance on the soldier's next assignments (two successive + one broadening, per AR 623-3).

**Support form** — The rating-period performance record that MERIT treats as a continuous, proof-backed log rather than a deadline reconstruction.

**UIC (Unit Identification Code)** — The unique code identifying a unit.

---

## MERIT product terms

**Anti-autopilot** — MERIT assists and suggests; the human rater reviews, edits, and owns every final bullet. Enforced through evidence-in, mandatory review, and permanent provenance.

**Artifact** — A piece of proof a soldier attaches to a support-form entry: Certificate/Award, Score Sheet, Photo, Document, or Other.

**Artifact caption** — A short factual MERIT-generated description produced once at upload and reused as generation context.

**Bullet source / provenance** — The label every final bullet carries: `HUMAN`, `AI_MODIFIED`, or `AI_UNMODIFIED`. Recorded permanently for auditability.

**Bullet provenance chain** — The permanent link from MERIT-touched final content to its suggestion, source references, and generation-time evidence snapshot.

**Completeness gate (two-tier)** — **Hard gate** = Part I–III admin + at least one goal in any dimension (unlocks evaluation initiation). **Soft indicator** = all six dimensions have a goal (progress display only; never blocks).

**Consistency check** — A pre-signature validation that scans for contradictions, unresolved unsupported-fact claims, and regulation issues across the evaluation.

**Counseling preparation (workspace)** — The in-app workspace a rater uses to prepare for and reconcile a required official counseling session (DA Form 4856). It composes goals, evidence, and rater observations since the last session and records a short outcome summary plus an optional reference/link to the completed official record. It is not a second official counseling process.

**Evidence-driven evaluation** — MERIT's operating model: the evaluation is a byproduct of a documented rating period rather than a deadline scramble.

**Goal** — A Soldier-authored statement of intent for one leadership dimension, submitted to the assigned rater for approval or revision. Approved goals give a 3-5-per-dimension focus advisory (never blocking) and can be carried forward, unedited, into a successor support form via an explicit link. A goal is context for evidence, not evidence itself — distinct from an **accomplishment**, which documents something already done.

**iPERMS-discrepancy flag (`flaggedByServiceMember`)** — A soldier's honest self-attestation that an artifact may not be reflected in iPERMS or contains a discrepancy, surfaced to the rater/senior rater instead of being hidden.

**Performance timeline** — A read-only, chronological, filterable view composing a soldier's logged support-form entries, counseling sessions, and milestones for a rating period, giving the rater full context before drafting or finalizing bullets.

**Performance observation** — A rater-owned factual note about a soldier's performance, separate from the soldier's own logged accomplishments. Private to the assigned rater until released through counseling; only the assigned rater may author, edit, delete, or release one.

**Rater confirmation** — A rater's explicit review status on a soldier-logged entry: `UNREVIEWED`, `CONFIRMED` (trusted as context), `NEEDS_CLARIFICATION` (with a note), or `NOT_USED`. Distinct from, and complementary to, the soldier's own artifact-level self-attestation flag.

**Rating relationship map** — The default org-chart-style visualization of the current rating scheme (senior rater → rater → rated soldier, with reviewers and assignment exceptions shown inline), with a sortable table available as an alternate view.

**Soldier Accomplishments widget** — The rater-facing panel in the section builder that lists the soldier's logged accomplishments (with proof and the rater's confirmation status) for a dimension and turns the selected ones into draft bullets.

**Source snapshot** — An immutable copy of the exact evidence MERIT used at generation time; later source edits cannot rewrite that record.

**Stale signature** — A signature invalidated because the content it signed was later edited, detected automatically via content hashing.

**Unsupported-fact warning** — An advisory raised when a specific checkable claim does not appear in generation evidence. The deterministic check does not make the rating decision.

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

**RAG (Retrieval-Augmented Generation)** — Feeding relevant regulation text (`RegulationChunk`) into MERIT generation so candidates are doctrinally grounded.

**RLS (Row-Level Security)** — PostgreSQL policies that restrict row access at the database layer — the deepest of the three authorization layers.

**shadcn/ui** — The component library (built on Radix primitives + Tailwind) used for the frontend UI.

**Supabase** — The managed platform providing PostgreSQL, authentication, and object storage.

**Supabase Storage** — Where uploaded files (artifacts, scanned support forms) are stored.

**Tailwind CSS** — The utility-first styling framework used by the frontend.

**Zod** — The schema-validation library that checks every incoming API request body.

---

*End of documentation set. Return to the [index](./README.md).*
