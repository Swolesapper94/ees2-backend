# 03 — Technical Architecture

> The engineering view: stack, structure, data model, and how a request flows end to end. For the functional view, see [02 — System Overview](./02-system-overview.md).

---

## 1. High-level shape

EES 2.0 is a **split-stack** web application — two independently deployable applications that talk over a typed HTTP API.

```
┌─────────────────────────┐         HTTPS + Bearer token        ┌──────────────────────────┐
│      ees2-frontend       │  ───────────────────────────────▶  │       ees2-backend        │
│  Next.js (App Router)    │                                     │   Express + TypeScript     │
│  React, Tailwind, shadcn │  ◀───────────────────────────────  │   (owns ALL business logic)│
└─────────────────────────┘            JSON responses            └────────────┬──────────────┘
            │                                                                  │
            │ Supabase Auth (JWT)                                             │ Prisma ORM
            ▼                                                                  ▼
   ┌──────────────────┐                                            ┌────────────────────────┐
   │  Supabase Auth   │                                            │  PostgreSQL (Supabase)  │
   └──────────────────┘                                            └────────────────────────┘
                                                                              │
                    ┌─────────────────────────────────────────────┬──────────┴───────────┐
                    ▼                                             ▼                        ▼
          ┌──────────────────┐                        ┌────────────────────┐   ┌────────────────────┐
          │ OpenAI API       │                        │  Supabase Storage  │   │  @react-pdf/renderer│
          │  (AI generation) │                        │ (artifacts/uploads)│   │  (DA-form PDFs)     │
          └──────────────────┘                        └────────────────────┘   └────────────────────┘
```

**Key architectural decision:** the backend owns *all* business logic and data access. The Next.js front end has **no API routes of its own** — it is a pure client of the Express API. This keeps a single source of truth for authorization, validation, and regulation logic, and makes the API independently testable and reusable (e.g., by a future mobile client).

---

## 2. Technology stack

### Frontend (`ees2-frontend/`)
| Concern | Choice |
|---------|--------|
| Framework | **Next.js (App Router)**, React 18/19 |
| Language | TypeScript (strict) |
| Styling | **Tailwind CSS** + **shadcn/ui** (Radix primitives, CSS-variable theming) |
| Icons | lucide-react |
| Forms & validation | react-hook-form + Zod |
| State | Zustand (light global state), React hooks |
| Auth client | `@supabase/ssr` / `@supabase/supabase-js` |
| API access | A single typed client (`src/lib/api/client.ts`) that attaches the Supabase bearer token to every request |
| Runs on | Port 3000 |

### Backend (`ees2-backend/`)
| Concern | Choice |
|---------|--------|
| Runtime | Node.js + **Express 4** |
| Language | TypeScript |
| ORM | **Prisma 6** |
| Database | **PostgreSQL** (hosted via Supabase) |
| Auth verification | `@supabase/supabase-js` service-role client verifies incoming JWTs |
| AI | `openai` — configured OpenAI model for text and vision |
| PDF | `@react-pdf/renderer` — renders official DA forms server-side |
| File parsing | `pdf-parse` (PDF text), OpenAI vision (images/handwriting) |
| Uploads | `multer` (in-memory) → Supabase Storage |
| Validation | **Zod** on every request body |
| Hardening | `helmet`, `cors`, `morgan` |
| Runs on | Port 4000 |

### Why this stack
- **Split stack** keeps regulation/authorization logic in one auditable place and leaves the door open to additional clients.
- **Prisma + PostgreSQL** gives a strongly-typed data layer over a battle-tested relational database — appropriate for a system where relationships (chains, signatures, audit) and integrity matter more than raw document flexibility.
- **Supabase** provides managed Postgres, auth, and object storage without standing up that infrastructure from scratch — while remaining standard Postgres underneath, so it is portable.
- **OpenAI** provides the configured text and vision model for reading handwritten support forms, captioning artifacts, and drafting rater suggestions.

---

## 3. Repository layout

Two sibling folders in one workspace. Path alias `@/*` → `src/*` in both.

```
ees2-backend/
  prisma/
    schema.prisma          # the entire data model, including assignment/snapshot lifecycle records
    seed.ts                # realistic demo formation
  src/
    app.ts, index.ts       # Express bootstrap
    config/env.ts          # environment loading + validation
    middleware/            # auth (JWT verify), error handling
    routes/                # one router per domain (see §5)
    lib/
      ai/                  # OpenAI client, prompts, pipelines, captioning
      support-form/        # completeness gating, goal prompts
      regulations/         # ingest + semantic search (RAG over AR/DA PAM)
      milestones/          # AR 623-3 milestone generation
      signatures/          # content-hash / stale-signature detection
      pdf/                 # DA-form React-PDF templates
      notifications/, integrations/, utils/
  supabase/
    rls-policies*.sql      # Row-Level Security policies
  docs/                    # dev + admin (this) documentation

ees2-frontend/
  src/
    app/
      (auth)/              # login, dev-login
      (dashboard)/         # dashboard, evaluations, support-form, analytics, admin, commander
    components/            # ai/, evaluation/, dashboard/, support-form/, ui/ (shadcn), ...
    lib/                   # api client, auth, supabase, utils
    types/                 # shared TypeScript domain types (mirror the Prisma enums)
  public/                  # static assets (rank insignia SVGs, avatars) — top-level only
```

---

## 4. Data model (the important entities)

The Prisma schema currently defines **37 models** and **53 enums**. This section is the architectural map of the important entities; [14 - Supabase PostgreSQL Database Schema Reference](./14-database-schema-reference.md) is the authoritative field-by-field reference for every table, relationship, index, and raw pgvector column.

### People & structure
- **`User`** — a service member. Holds rank, category, MOS, roles (`SOLDIER`, `RATER`, `SENIOR_RATER`, legacy `REVIEWER`, `COMMANDER`, `ADMIN`, plus unit-leadership roles), profile picture, unit. The `REVIEWER` enum rename to `SUPPLEMENTARY_REVIEWER` is staged for compatibility with existing stored data.
- **Identity and Access records** — `IdentitySourceRecord`, `IdentitySyncEvent`, `IdentityException`, `AdministrativeScope`, and `ManualOverride` track authoritative-source state, synchronization, exceptions, EES-only access scope, and reconciliations without overwriting the core `User` identity. `User.applicationAccessStatus`, access-review status, `applicationSupportRole`, break-glass eligibility, and temporary access expiration are EES state, not personnel status or rating authority.
- **`Unit`** — the organizational node (UIC, name).
- **`RatingSchemeAssignment`** — the compliance-authoritative, effective-dated relationship: rated soldier → rater → optional intermediate rater → senior rater → optional supplementary reviewer. It moves through draft, approval, publication, and prospective replacement, with eligibility and overlap validation.
- **`RatingChain`** — the legacy relationship retained for compatibility while historical records and older dashboard paths are migrated. It is not the authority for new assignment-backed evaluations.

### Continuous performance capture
- **`SupportForm`** — a rating-period performance log, anchored to a legacy `RatingChain` or a versioned `RatingSchemeAssignment` during transition. It carries explicit lifecycle (`DRAFT` through `CONSUMED`, plus archive/quarantine), disposition, initiator, version, and consumption metadata as well as `evalCategory` and completeness fields.
- **`SupportFormEntry`** — one logged accomplishment, tagged to a `SectionKey` (one of the six dimensions). New entries must be `ACCOMPLISHMENT`; the `OBJECTIVE` `EntryType` value is retained only for legacy entries created before goals became a standalone model — new objective-entry creation is rejected with `OBJECTIVE_ENTRY_DEPRECATED`. It records creator, role at creation, last editor, source version, and confirmation lock metadata. A rater or senior rater may confirm, request clarification, or mark an entry not used; a supplementary reviewer may not.
- **`SupportFormEntryArtifact`** — proof attached to an entry: `type` (Certificate/Score Sheet/Photo/Document/Other), the stored file, an AI-generated `aiCaption` (+ status), and a soldier self-attestation flag (`flaggedByServiceMember` + note) for iPERMS-discrepancy transparency.
- **`Goal` / `GoalEntryLink`** — the forward-looking counterpart to an accomplishment. A goal is Soldier-authored, tagged to a dimension, and moves through an explicit approval status (`DRAFT` → `PENDING_RATER_REVIEW` → `APPROVED` / `NEEDS_REVISION`) with the assigned rater as approver. Soldier and rater each record their own progress assessment. `GoalEntryLink` traces an accomplishment to the goal(s) it supports; a goal is never itself treated as evidence that something happened. A goal can be carried forward into a successor support form via `carriedForwardFromGoalId`, which always creates a new record rather than mutating the prior period's goal.
- **`PerformanceObservation`** — a rater-owned factual note, deliberately separate from a soldier-authored `SupportFormEntry`. It is private to the assigned rater (`releaseState = PRIVATE_TO_RATER`) until discussed in counseling and released (`RELEASED_IN_COUNSELING`); only the assigned rater may author, edit, delete, or release one. It optionally links to an approved `Goal` for traceability and to the `CounselingSession` where it was released, but release never rewrites its original author, note, or occurrence timestamp.
- **`CounselingSession`** — recorded initial/quarterly counseling (feeds compliance analytics and the DA-form Part II dates). It also carries an optional `officialRecordReference` / `officialRecordUrl` so the in-app counseling-preparation workspace can point back to the completed official DA Form 4856 or unit record, rather than generating a second official counseling narrative.

### The evaluation
- **`Evaluation`** — the official NCOER/OER. Links to its legacy chain during the migration and, for assignment-backed creation, has one immutable `EvaluationRatingSnapshot` recording the approved officials, ranks, categories, form category, and policy exception at creation. It also has an explicit active/quarantined/archived disposition. Status is **automatically derived** from real section-completion and signature state.
- **`EvaluationRatingSnapshot`** — the immutable authorization source for a new evaluation. A later assignment revision cannot change who can see, edit, or review an existing evaluation.
- **`Delegate` / access grant** — the compatibility-preserved `delegates` table now supports explicit grant type, lifecycle state, resource scope, effective period, subject, and `DelegationCapabilityGrant` rows. It is not a role and never modifies a rating chain or evaluation snapshot.
- **`EvalSection`** — one section of the form (the six Part IV dimensions plus overalls): rating value, final bullets, `bulletSources` (a per-bullet provenance label — `HUMAN` / `AI_MODIFIED` / `AI_UNMODIFIED`), `bulletProvenance` (the full chain from a final bullet back to its originating AI suggestion, the source entries, and the evidence snapshot used to generate it), completion state.
- **`SeniorRaterProfile`** — the senior rater's cumulative "most qualified" distribution, used to enforce the profile cap.
- **`Signature`** — a role's signature with `nameConfirmation`, IP/user-agent, optional CAC/PKI fields, and a content hash for stale detection.
- **`EvaluationReturn`** — a record of an HRC/chain return with reason.

### AI & audit
- **`AIBulletSuggestion`** — every AI-drafted bullet candidate, whether generated from selected support-form entries, rater observations, a rater's free-text description, or the whole-document upload pipeline. Carries rank, confidence, and review status (`PENDING_REVIEW` → `ACCEPTED` / `EDITED` / `REJECTED`), plus integrity fields captured **at generation time**: a typed `evidenceReferences` array (`SUPPORT_FORM_ENTRY` vs. `PERFORMANCE_OBSERVATION`, so an observation ID is never overloaded onto `sourceEntryIds`), an **immutable source snapshot** (the exact entry/observation text and artifact captions the bullet was drafted from — a later edit or deletion of the source can never retroactively rewrite this history), and any **unsupported-fact warnings** (see §6).
- **`SupportFormUpload` / `AIExtractedEntry`** — the whole-document upload pipeline: a scanned support form is uploaded, vision-extracted, and parsed into typed entries mapped to the six dimensions. The active upload run generates at most one candidate per extracted fact, preserves the exact source snapshot, and may be reprocessed without deleting prior runs.
- **`AuditLog`** — general tamper-evident action log (signatures, submissions, entry confirmations, suggestion review actions, evaluation-status transitions, and more).
- **`EvalMilestone`** — generated AR 623-3 suspense dates.
- **`EvalComment`** — collaboration threads on an evaluation.
- **Legacy `Delegate` fields** — retained compatibility data for the scoped Access and Assistance migration; never a source of temporary rating authority.
- **`RegulationChunk`** — chunked, searchable regulation text (AR 623-3 / DA PAM 623-3) that powers retrieval-augmented generation so bullets are doctrinally grounded.

### The six leadership dimensions (`SectionKey`)
`CHARACTER · PRESENCE · INTELLECT · LEADS · DEVELOPS · ACHIEVES` — identical across NCO and officer forms, which is why one builder/template serves both by branching on `evalCategory`.

### Rating scales
- **`RatingBinary`** — DA 2166-9-1 (SGT/E5): met / did not meet standard.
- **`RatingFourLevel`** — DA 2166-9-2/-9-3 (E6–E9): four-level scale.
- **`SeniorRaterRating`** — overall potential (most/highly/qualified/not qualified), subject to the profile cap.

---

## 5. API surface

All routes are mounted under `/api`. Every route except `/api/health` requires a Supabase bearer token, verified by auth middleware that resolves the token to the EES `User` record. Representative routers:

| Router | Responsibility |
|--------|----------------|
| `/api/users` | Current-user (`/me`) profile/preferences. Legacy directory/create/update behavior is retained only for development compatibility and blocked in production. |
| `/api/admin/identity-access` | Application-administrator-only identity synchronization, records, source/read-only identity view, assignments, access grants, exceptions, audit, suspend/reactivate, retry sync, and reconciliation. |
| `/api/dev/personas` | Development-only test-persona list/create/reset; unavailable in production. |
| `/api/units`, `/api/rating-chains` | Org structure and legacy chains. The evaluation-creation query accepts either the `rater` or `soldier` role and returns only caller-scoped, effective published assignments with a matching active compatibility chain. |
| `/api/support-forms` | Support-form CRUD, assignment-aware form initiation/selection, entries, **artifact upload/flag/delete** (upload-ownership authorized), rater **entry confirmation**, completeness, finalize, counseling dates |
| `/api/rating-scheme-assignments` | Admin-only draft, approval, publication, and prospective replacement of versioned assignments; validates eligibility, supplementary-review requirement, and effective-date overlap |
| `/api/access-grants` | Access and Assistance lifecycle: scoped invitation, accept/decline, capability reduction, revocation, activity, and eligible-user search. Legacy `/api/delegates` remains a compatibility adapter during migration. |
| `/api/support-form-uploads` | Whole-document upload pipeline; authenticated original-file viewing, safe reprocessing, **generate-from-entries**, generate-from-scratch, and suggestion review for the assigned rater/senior rater only; each suggestion captures an immutable evidence snapshot |
| `/api/evaluations` | Eval lifecycle, section editing (auto-recomputes status), consistency check, and exact-role signing; assignment-backed creation creates an immutable official snapshot and consumes a support form atomically |
| `/api/pdf` | DA-form PDF export (chain-authorized) |
| `/api/dashboard`, `/api/analytics`, `/api/commander` | Compliance/velocity analytics (role-gated) |
| `/api/milestones`, `/api/notifications`, `/api/delegates`, `/api/comments`, `/api/support` | Supporting features (milestone actions are rating-chain-authorized and audited) |

---

## 6. The AI pipelines

There are **three** distinct drafting paths plus artifact captioning, all sharing the same review-and-provenance discipline. Every suggestion persists to `AIBulletSuggestion` and requires human accept/edit/reject before it can reach the form.

### A. Artifact captioning (continuous, at upload)
When a soldier attaches proof to an entry, `generateArtifactCaption()` runs **once**, fire-and-forget:
- **Image** → OpenAI vision extracts a short factual caption.
- **PDF** → `pdf-parse` extracts text → OpenAI summarizes it factually.
- Result stored on the artifact and **reused** as text context in later bullet generation — images are never re-sent per generation, keeping generation fast and cheap.

### B. Bullet generation from logged entries (the primary rater path)
`generateBulletsFromEntries()`:
1. Server re-authorizes the request: the caller must be the assigned rater or senior rater, and every submitted entry ID is re-verified against the evaluation's own linked support form (never trusted from the client).
2. Loads the rater-selected `SupportFormEntry` rows and their artifact captions, and captures them as an **immutable source snapshot** on each resulting suggestion.
3. Retrieves relevant regulation text via `RegulationChunk` search (RAG).
4. Prompts OpenAI with soldier context + the rater-selected evidence + doctrine to produce up to five ranked, DA-format candidates. This selected-entry path is distinct from whole-document processing, which produces at most one candidate per extracted fact.
5. Runs each candidate through a **deterministic unsupported-fact check** (no LLM in the loop) and stores any findings on the suggestion.
6. Returns a `hasFlaggedArtifacts` signal if any selected entry had a soldier-flagged artifact, so the UI can warn the rater.
7. Persists candidates as `AIBulletSuggestion` (status `PENDING_REVIEW`).

The same snapshot-capture and unsupported-fact check apply to the free-text "generate from scratch" path, using the rater's own description as the source.

### C. Whole-document upload pipeline (three stages)
For a scanned/handwritten support form uploaded as a single file:
1. **Stage 1 — Vision extraction:** OpenAI reads the form (including handwriting) into raw labeled text.
2. **Stage 2 — Parse:** OpenAI classifies the raw text into typed entries (`AIExtractedEntry`) mapped to the six dimensions.
3. **Stage 3 — Generate:** each extracted fact is independently converted into at most one RAG-grounded candidate in its classified dimension. Empty dimensions produce no generic content; the candidate retains the exact extracted fact as its source snapshot.
Status is tracked through `SupportFormUploadStatus` so the UI can poll progress.

The rater can open the **Original support form** from the section builder through an authenticated file endpoint and can optionally disclose a suggestion's source fact. These controls support review; they do not make provenance text mandatory visual clutter on every candidate. A completed upload can be safely reprocessed into a new run without deleting the prior run or its audit history.

### The guardrails (enforced in code, not just policy)
1. **Evidence-in:** generation requires either selected logged entries or an explicit rater description.
2. **Mandatory review:** suggestions are `PENDING_REVIEW` until a human acts; a section can't complete with pending items.
3. **Immutable source snapshots:** each suggestion captures the exact source text at generation time, so a later edit or deletion of the underlying entry can never retroactively change what the AI was shown.
4. **Unsupported-fact detection:** a deterministic checker flags specific claims — numbers, percentages, dates, named schools, awards/rankings — that don't appear anywhere in the source snapshot. Advisory, never blocking; re-checked again at pre-submission validation in case a later manual edit introduces an unsupported claim.
5. **Transactional, idempotent acceptance:** accepting or editing a suggestion is one atomic transaction that flips its review status and appends the final bullet (with its full provenance chain) to the section in a single step — a duplicate or double-click request is rejected cleanly rather than creating a duplicate bullet.
6. **Reviewable provenance:** any AI-touched final bullet exposes a "view source" trail back to its originating suggestion, source entries, and evidence snapshot.

---

## 7. Request lifecycle (end to end)

Example: a rater generates bullets from three logged accomplishments.

1. **Frontend** — the section builder calls `api.post('/support-form-uploads/:evalId/generate-from-entries', { sectionKey, entryIds, soldierInfo })`. The typed client attaches the Supabase bearer token.
2. **Auth middleware** — verifies the JWT with Supabase, loads the EES `User`, attaches it to the request.
3. **Zod** — validates the body (section enum, non-empty entry IDs, required soldier fields).
4. **Relationship authorization** — the route re-verifies the caller is the assigned rater or senior rater, and re-fetches + re-authorizes every submitted entry ID against the evaluation's own linked support form.
5. **Domain logic** — `generateBulletsFromEntries()` loads entries + captions, captures the immutable source snapshot, runs regulation RAG, calls OpenAI, computes the flagged-artifact signal, and runs the deterministic unsupported-fact check.
6. **Persistence** — candidates saved as `AIBulletSuggestion (PENDING_REVIEW)` with their snapshot and any unsupported-fact warnings; entries marked `usedInEvalId` for visibility.
7. **Response** — suggestions + `hasFlaggedArtifacts` returned as JSON.
8. **Frontend** — suggestions (with any warnings) render in the review panel; the rater accepts/edits/rejects. Accept/edit is a single atomic, chain-authorized transaction that writes the final bullet, its `BulletSource`, and its full provenance chain to the `EvalSection` — the client never assembles this itself.

---

## 8. Authentication & authorization

- **Authentication:** Supabase Auth issues JWTs. The backend verifies every token server-side with a service-role client; there is no trust of client-declared identity. (A dev-login shim exists for local development only.)
- **Authorization — three layers:**
  1. **Database:** Supabase **Row-Level Security** policies (`supabase/rls-policies*.sql`).
  2. **API:** `requireAuth` + `requireRole` middleware on protected routers (e.g., analytics is role-gated; a senior-rater-only endpoint 403s otherwise).
  3. **Domain:** centralized authorization policies determine *which* relationship a user may act through. Legacy records use the persisted chain during migration; assignment-backed evaluations use their immutable snapshot. Supplementary reviewers cannot author bullets or confirm entries. Evaluation comments require a direct relationship or an explicit scoped non-evaluative-comment capability.

See [05 — Security & Compliance](./05-security-and-compliance.md) for the full treatment.

---

## 9. Environments & operations

- **Config** via environment variables (`.env`): `DATABASE_URL` / `DIRECT_URL`, `SUPABASE_*`, `OPENAI_API_KEY` / `OPENAI_MODEL`, `CORS_ORIGIN`. `config/env.ts` centralizes loading and warns on missing values.
- **Database schema synchronization** uses `prisma db push` in this environment because migration history is not initialized; demo data is managed by `seed.ts`.
- **Regulation ingest** (`ingest:regulations`) populates the RAG corpus.
- **Local dev:** backend `npm run dev:real` (port 4000), frontend `npm run dev` (port 3000). A mock server exists for frontend-only work.
- **Type safety** end to end: Zod at the API boundary, Prisma types in the domain, and TypeScript domain types mirrored on the front end.

---

## 10. Notable design decisions (and why)

| Decision | Rationale |
|----------|-----------|
| Backend owns all logic; no Next API routes | One auditable source of truth for regulation + authorization; reusable API |
| Caption artifacts once, reuse the text | Fast, cheap generation; deterministic context; no repeated vision calls |
| Versioned assignment plus immutable evaluation snapshot | Assignment changes apply prospectively; existing evaluation authority cannot drift after creation |
| Two-tier completeness (hard gate / soft indicator) | Unlock the evaluation without letting one slow dimension block a career |
| One wizard/template, branch on `evalCategory` | The six dimensions are identical NCO vs officer; avoids duplicate UIs |
| AI provenance stored permanently | Trust, defensibility, and the anti-autopilot guarantee |
| RAG over AR 623-3 / DA PAM 623-3 | Bullets are doctrinally grounded, not generic |
| Rater observations kept separate from soldier entries | Preserves who-said-what: a soldier's own claim and a rater's independent factual note are never merged into one record |

---

## 11. Data sources: real vs. stubbed

A reviewer new to the codebase should be able to tell, at a glance, which integrations are live and which are demo scaffolding. **No part of this environment is connected to a production Army system of record.**

| Source | Status | Notes |
|--------|--------|-------|
| OpenAI (text + vision) | **Real** | Requires `OPENAI_API_KEY`; generation fails closed (not silently) without it. |
| Supabase Postgres | **Real** | Hosted in the `aws-1-us-east-2` (US) region; the actual data store for every model in this document. |
| Supabase Auth | **Real** | Issues and verifies the JWTs used for every non-health request. |
| Supabase Storage | **Real** | Stores uploaded artifacts and support-form documents. |
| IPPS-A personnel/profile data | **Stubbed** | `IdentitySourceRecord` is populated with `sourceSystem = IPPS_A` and a payload labeled `IPPS_A_STUB`; the UI shows an explicit `Demo integration` label next to it. No live IPPS-A connection exists. |
| Microsoft profile photos | **Stubbed** | Synthetic `/demo-avatars/*.webp` assets with initials fallback; not connected to Microsoft Graph or any approved photo source. |
| iPERMS document verification | **Not integrated** | iPERMS has no public API. The soldier self-attestation flag (`flaggedByServiceMember`) is the honest interim control, not automated verification. |
| HDQA evaluation submission | **Internal workflow only** | Submission moves an evaluation through `SUBMITTED` / `ACCEPTED` / `RETURNED` inside this application; it is not a live connection to an external Army system. |
| CAC/PKI signing | **Not implemented** | `Signature` has placeholder `cacCertSerial` / `pkiTokenHash` fields for future use; current signing uses name confirmation, not certificate-based signing. |
| AR 623-3 / DA PAM 623-3 regulation text | **Real, static corpus** | Ingested once into `RegulationChunk` for retrieval-augmented generation; not a live feed that tracks regulation updates automatically. |

See [16 - PM Demo Route](./16-pm-demo-route.md) §1.1 for the exact stub labels used in the live demo script, and [15 - Rater Profile & Rater Tendency Model](./15-rater-profile-and-tendency-model.md) §3 for why HRC-authoritative rater profile/tendency data is explicitly out of scope today.

---

**Next:** [04 — Business Case](./04-business-case.md) — the value, market, and risk view.
