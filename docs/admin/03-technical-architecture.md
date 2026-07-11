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
          │ Anthropic Claude │                        │  Supabase Storage  │   │  @react-pdf/renderer│
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
| AI | `@anthropic-ai/sdk` — **Claude (claude-sonnet-4-6)** for text + vision |
| PDF | `@react-pdf/renderer` — renders official DA forms server-side |
| File parsing | `pdf-parse` (PDF text), Claude vision (images/handwriting) |
| Uploads | `multer` (in-memory) → Supabase Storage |
| Validation | **Zod** on every request body |
| Hardening | `helmet`, `cors`, `morgan` |
| Runs on | Port 4000 |

### Why this stack
- **Split stack** keeps regulation/authorization logic in one auditable place and leaves the door open to additional clients.
- **Prisma + PostgreSQL** gives a strongly-typed data layer over a battle-tested relational database — appropriate for a system where relationships (chains, signatures, audit) and integrity matter more than raw document flexibility.
- **Supabase** provides managed Postgres, auth, and object storage without standing up that infrastructure from scratch — while remaining standard Postgres underneath, so it is portable.
- **Claude** was chosen for strong instruction-following and vision (reading handwritten support forms and captioning artifacts), which the anti-autopilot workflow depends on.

---

## 3. Repository layout

Two sibling folders in one workspace. Path alias `@/*` → `src/*` in both.

```
ees2-backend/
  prisma/
    schema.prisma          # the entire data model (22 models, ~25 enums)
    seed.ts                # realistic demo formation
  src/
    app.ts, index.ts       # Express bootstrap
    config/env.ts          # environment loading + validation
    middleware/            # auth (JWT verify), error handling
    routes/                # one router per domain (see §5)
    lib/
      ai/                  # Claude client, prompts, pipelines, captioning
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

The schema has **22 models**. These are the ones that carry the system:

### People & structure
- **`User`** — a service member. Holds rank, MOS, roles (`SOLDIER`, `RATER`, `SENIOR_RATER`, `REVIEWER`, `COMMANDER`, `ADMIN`, plus unit-leadership roles), profile picture, unit.
- **`Unit`** — the organizational node (UIC, name).
- **`RatingChain`** — the heart of authorization: links a rated soldier → rater → senior rater → (optional reviewer). Persists across multiple annual cycles.

### Continuous performance capture
- **`SupportForm`** — a rating-period performance log, anchored to a `RatingChain`. Carries `evalCategory` (NCOER/OER), the Part I–III admin fields, and `completedAt` (the timestamp that unlocks evaluation initiation).
- **`SupportFormEntry`** — one logged objective or accomplishment, tagged to a `SectionKey` (one of the six dimensions) and an `EntryType` (`OBJECTIVE` / `ACCOMPLISHMENT`). Carries a rater-owned **confirmation status** (`UNREVIEWED` / `CONFIRMED` / `NEEDS_CLARIFICATION` / `NOT_USED`, with the confirming user and timestamp) — distinct from the soldier's own artifact-level self-attestation — so a rater can explicitly record having reviewed an entry, or ask for clarification, before relying on it.
- **`SupportFormEntryArtifact`** — proof attached to an entry: `type` (Certificate/Score Sheet/Photo/Document/Other), the stored file, an AI-generated `aiCaption` (+ status), and a soldier self-attestation flag (`flaggedByServiceMember` + note) for iPERMS-discrepancy transparency.
- **`CounselingSession`** — recorded initial/quarterly counseling (feeds compliance analytics and the DA-form Part II dates).

### The evaluation
- **`Evaluation`** — the official NCOER/OER. Links to its `RatingChain` and (once "consumed") its source `SupportForm`. Holds Part I administrative data, Part III duty description, Part V succession planning, ACFT/height/weight, and lifecycle timestamps (`submittedAt`, `acceptedAt`). Its `EvalStatus` is **automatically derived** from real section-completion and signature state (not set manually), so the displayed status always reflects where the report actually stands.
- **`EvalSection`** — one section of the form (the six Part IV dimensions plus overalls): rating value, final bullets, `bulletSources` (a per-bullet provenance label — `HUMAN` / `AI_MODIFIED` / `AI_UNMODIFIED`), `bulletProvenance` (the full chain from a final bullet back to its originating AI suggestion, the source entries, and the evidence snapshot used to generate it), completion state.
- **`SeniorRaterProfile`** — the senior rater's cumulative "most qualified" distribution, used to enforce the profile cap.
- **`Signature`** — a role's signature with `nameConfirmation`, IP/user-agent, optional CAC/PKI fields, and a content hash for stale detection.
- **`EvaluationReturn`** — a record of an HRC/chain return with reason.

### AI & audit
- **`AIBulletSuggestion`** — every AI-drafted bullet candidate, whether generated from selected support-form entries, a rater's free-text description, or the whole-document upload pipeline. Carries rank, confidence, and review status (`PENDING_REVIEW` → `ACCEPTED` / `EDITED` / `REJECTED`), plus two integrity fields captured **at generation time**: an **immutable source snapshot** (the exact entry text and artifact captions the bullet was drafted from — a later edit or deletion of the source entry can never retroactively rewrite this history) and any **unsupported-fact warnings** (see §6).
- **`SupportFormUpload` / `AIExtractedEntry`** — the whole-document upload pipeline: a scanned support form is uploaded, vision-extracted, and parsed into typed entries mapped to the six dimensions.
- **`AuditLog`** — general tamper-evident action log (signatures, submissions, entry confirmations, suggestion review actions, evaluation-status transitions, and more).
- **`EvalMilestone`** — generated AR 623-3 suspense dates.
- **`EvalComment`** — collaboration threads on an evaluation.
- **`Delegate`** — delegated access grants (e.g., temporary rater authority).
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
| `/api/users` | Directory + current-user (`/me`) + admin create |
| `/api/units`, `/api/rating-chains` | Org structure and chains |
| `/api/support-forms` | Support-form CRUD, entries, **artifact upload/flag/delete** (upload-ownership authorized), rater **entry confirmation**, completeness, finalize, counseling dates |
| `/api/support-form-uploads` | Whole-document upload pipeline; **generate-from-entries**, generate-from-scratch (both chain-authorized, both capture an immutable source snapshot and run unsupported-fact checks); bullet review (**transactional, idempotent** accept/edit/reject) |
| `/api/evaluations` | Eval lifecycle, section editing (auto-recomputes status), consistency check, signing (role- and chain-authorized); support-form completeness gate on creation |
| `/api/pdf` | DA-form PDF export (chain-authorized) |
| `/api/dashboard`, `/api/analytics`, `/api/commander` | Compliance/velocity analytics (role-gated) |
| `/api/milestones`, `/api/notifications`, `/api/delegates`, `/api/comments`, `/api/support` | Supporting features (milestone actions are rating-chain-authorized and audited) |

---

## 6. The AI pipelines

There are **two** distinct generation paths plus artifact captioning, all sharing the same review-and-provenance discipline. Every suggestion persists to `AIBulletSuggestion` and requires human accept/edit/reject before it can reach the form.

### A. Artifact captioning (continuous, at upload)
When a soldier attaches proof to an entry, `generateArtifactCaption()` runs **once**, fire-and-forget:
- **Image** → Claude vision extracts a short factual caption.
- **PDF** → `pdf-parse` extracts text → Claude summarizes it factually.
- Result stored on the artifact and **reused** as text context in later bullet generation — images are never re-sent per generation, keeping generation fast and cheap.

### B. Bullet generation from logged entries (the primary rater path)
`generateBulletsFromEntries()`:
1. Server re-authorizes the request: the caller must be the rater/senior rater/reviewer on the evaluation's rating chain, and every submitted entry ID is re-verified against the evaluation's own linked support form (never trusted from the client).
2. Loads the rater-selected `SupportFormEntry` rows and their artifact captions, and captures them as an **immutable source snapshot** on each resulting suggestion.
3. Retrieves relevant regulation text via `RegulationChunk` search (RAG).
4. Prompts Claude with soldier context + the evidence + doctrine to produce five ranked, DA-format candidates.
5. Runs each candidate through a **deterministic unsupported-fact check** (no LLM in the loop) and stores any findings on the suggestion.
6. Returns a `hasFlaggedArtifacts` signal if any selected entry had a soldier-flagged artifact, so the UI can warn the rater.
7. Persists candidates as `AIBulletSuggestion` (status `PENDING_REVIEW`).

The same snapshot-capture and unsupported-fact check apply to the free-text "generate from scratch" path, using the rater's own description as the source.

### C. Whole-document upload pipeline (three stages)
For a scanned/handwritten support form uploaded as a single file:
1. **Stage 1 — Vision extraction:** Claude reads the form (including handwriting) into raw labeled text.
2. **Stage 2 — Parse:** Claude classifies the raw text into typed entries (`AIExtractedEntry`) mapped to the six dimensions.
3. **Stage 3 — Generate:** per dimension, RAG-grounded bullet candidates are produced and stored for rater review.
Status is tracked through `SupportFormUploadStatus` so the UI can poll progress.

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
4. **Chain authorization** — the route re-verifies the caller is the rater/senior rater/reviewer on the evaluation's rating chain, and re-fetches + re-authorizes every submitted entry ID against the evaluation's own linked support form.
5. **Domain logic** — `generateBulletsFromEntries()` loads entries + captions, captures the immutable source snapshot, runs regulation RAG, calls Claude, computes the flagged-artifact signal, and runs the deterministic unsupported-fact check.
6. **Persistence** — candidates saved as `AIBulletSuggestion (PENDING_REVIEW)` with their snapshot and any unsupported-fact warnings; entries marked `usedInEvalId` for visibility.
7. **Response** — suggestions + `hasFlaggedArtifacts` returned as JSON.
8. **Frontend** — suggestions (with any warnings) render in the review panel; the rater accepts/edits/rejects. Accept/edit is a single atomic, chain-authorized transaction that writes the final bullet, its `BulletSource`, and its full provenance chain to the `EvalSection` — the client never assembles this itself.

---

## 8. Authentication & authorization

- **Authentication:** Supabase Auth issues JWTs. The backend verifies every token server-side with a service-role client; there is no trust of client-declared identity. (A dev-login shim exists for local development only.)
- **Authorization — three layers:**
  1. **Database:** Supabase **Row-Level Security** policies (`supabase/rls-policies*.sql`).
  2. **API:** `requireAuth` + `requireRole` middleware on protected routers (e.g., analytics is role-gated; a senior-rater-only endpoint 403s otherwise).
  3. **Domain:** a shared `RatingChain`-authorization helper determines *which* evaluation a given user can act on and in what capacity, applied consistently across generation, review, signing, PDF export, and milestone actions — not just enforced ad hoc per route.

See [05 — Security & Compliance](./05-security-and-compliance.md) for the full treatment.

---

## 9. Environments & operations

- **Config** via environment variables (`.env`): `DATABASE_URL` / `DIRECT_URL`, `SUPABASE_*`, `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL`, `CORS_ORIGIN`. `config/env.ts` centralizes loading and warns on missing values.
- **Database migrations** via Prisma (`prisma migrate`); demo data via `seed.ts`.
- **Regulation ingest** (`ingest:regulations`) populates the RAG corpus.
- **Local dev:** backend `npm run dev:real` (port 4000), frontend `npm run dev` (port 3000). A mock server exists for frontend-only work.
- **Type safety** end to end: Zod at the API boundary, Prisma types in the domain, and TypeScript domain types mirrored on the front end.

---

## 10. Notable design decisions (and why)

| Decision | Rationale |
|----------|-----------|
| Backend owns all logic; no Next API routes | One auditable source of truth for regulation + authorization; reusable API |
| Caption artifacts once, reuse the text | Fast, cheap generation; deterministic context; no repeated vision calls |
| Support form anchored to `RatingChain`, not a date string | Chains outlive annual cycles; "one active unconsumed form per chain" models reality (incl. PCS) cleanly |
| Two-tier completeness (hard gate / soft indicator) | Unlock the evaluation without letting one slow dimension block a career |
| One wizard/template, branch on `evalCategory` | The six dimensions are identical NCO vs officer; avoids duplicate UIs |
| AI provenance stored permanently | Trust, defensibility, and the anti-autopilot guarantee |
| RAG over AR 623-3 / DA PAM 623-3 | Bullets are doctrinally grounded, not generic |

---

**Next:** [04 — Business Case](./04-business-case.md) — the value, market, and risk view.
