# EES 2.0 — Demo Rehearsal Test Plan

**Purpose:** A step-by-step script for practicing a live demo of the full evaluation
lifecycle, "tip to tail," across 3 different rank/role combinations. Follow each
workflow top to bottom in a fresh run-through; check off steps as you go. Each
workflow is independent — pick whichever fits your demo time slot.

**Source of truth this plan was built from:** `FLOWS.md` (personas, CTAs, state
machine), `dev-login.ts` + `seed.ts` (who exists and what state their data is in
right now), and a direct code read of the routes/pages listed below (not assumed).

---

## 0. Cast of Characters

There are **two separate demo casts** in this app. Don't mix up how you log into each.

### Cast A — "Delta" personas (the polished 5-persona demo set)
Log in at **`/dev-login`** and pick from the radio-button list (no password needed).

| Persona | Rank | Roles | Login picker label |
|---|---|---|---|
| SGT Davis | E5 | Soldier only | "SGT Davis — Team Leader" |
| SSG Johnson | E6 | Rater | "SSG Johnson — Squad Leader" |
| SFC Williams | E7 | Rater + Senior Rater | "SFC Williams — Platoon Sergeant" |
| 1LT Torres | O2 | Rater (officer track) | "1LT Torres — PLT Leader" |
| CPT Smith | O3 | Rater + SR + Commander | "CPT Smith — Company Commander" |

### Cast B — "Legacy" seed personas (rich pre-built data, manual login only)
These are **not** in the `/dev-login` picker. Log in at **`/login`** with email +
password `testpass` typed manually.

| Persona | Rank | Role | Email |
|---|---|---|---|
| James Smith | SGT | Soldier | `james.smith@army.mil` |
| Robert Jones | SSG | Rater (and rated on his own chain) | `robert.jones@army.mil` |
| David Davis | SFC | Senior Rater | `david.davis@army.mil` |
| Patricia Brown | SSG | **Admin** | `patricia.brown@army.mil` |

> There is currently no Admin persona in the `/dev-login` picker — Patricia Brown
> (Cast B) is the only Admin login, and must be typed manually at `/login`.

---

## 1. Pre-Flight Checklist (do this before you practice or demo)

- [ ] Backend running with the **real** server, not the mock: `cd ees2-backend && npm run dev:real` (NOT `npm run dev` — that runs `mock-server.ts` instead).
- [ ] Frontend running: `cd ees2-frontend && npm run dev` — [http://localhost:3000](http://localhost:3000)
- [ ] `npx prisma migrate deploy` has been run in `ees2-backend` (confirms the `embedding` column + all other migrations are applied).
- [ ] `.env` in `ees2-backend` has `ANTHROPIC_API_KEY` set — without it, every AI bullet-generation click fails with a generic 500. Test once before the demo: log in as any Rater, open a section, click the AI generator, confirm it returns suggestions.
- [ ] Seed data is fresh (`npm run seed` in `ees2-backend`) if you want every workflow below to start from the exact states described. Re-seeding is idempotent (all `upsert`), so it's safe to re-run before every rehearsal.
- [ ] Clear `localStorage` (or use a private/incognito window) between switching personas — `devAuth` persists across page loads and will silently keep you logged in as the last profile.

---

## 2. Status Legend (cheat sheet — keep visible while demoing)

```
NOT_STARTED → DRAFT → RATER_IN_PROGRESS → PENDING_SENIOR_RATER
  → PENDING_SOLDIER_ACK → COMPLETE → SUBMITTED → ACCEPTED
                        ↘ (if rater is 1LT) PENDING_SUPPLEMENTARY_REVIEW → COMPLETE
```
`RETURNED` can loop back to `RATER_IN_PROGRESS` from `SUBMITTED`.

---

## 3. Workflow 1 — NCO Full Lifecycle (the "hero" demo)

**Cast:** SGT Davis (rated) ← SSG Johnson (Rater) ← SFC Williams (Senior Rater)
**Starting state (seeded):** `dev-eval-davis`, status `RATER_IN_PROGRESS`, 3 of 6
Part IV sections already complete (CHARACTER, PRESENCE, INTELLECT). LEADS,
DEVELOPS, ACHIEVES are empty.
**What it proves:** the entire status state machine end-to-end, AI bullet
generation, consistency check, SR review + profile meter, and soldier signing —
using three genuinely different people, not the same login wearing two hats.

### Step 1 — Rater finishes the eval (SSG Johnson)
- [ ] Go to `/dev-login`, select **SSG Johnson**, log in.
- [ ] Dashboard → Zone B ("My Soldiers") → open SGT Davis's evaluation.
- [ ] Open the **LEADS** section → use the AI bullet generator (describe an accomplishment in your own words since there are no logged support-form entries for this chain) → accept/edit a suggestion into a final bullet → mark section complete.
- [ ] Repeat for **DEVELOPS** and **ACHIEVES**.
- [ ] Run the pre-submission **consistency check** (`/evaluations/dev-eval-davis/review` or the in-flow prompt) — point out this is a soft-warning gate today (nothing blocks submission yet).
- [ ] Route to Senior Rater. Confirm status flips to `PENDING_SENIOR_RATER`.

### Step 2 — Senior Rater reviews and routes (SFC Williams)
- [ ] Clear `devAuth` / open a new private window. Go to `/dev-login`, select **SFC Williams**.
- [ ] Zone B → open SGT Davis's evaluation → point out Part IV is now **read-only** for the SR.
- [ ] Open the **Senior Rater** section (`/evaluations/dev-eval-davis/senior-rater`) → complete SR narrative + rating.
- [ ] Show the **profile meter** (SR-only, demonstrates grade-inflation transparency).
- [ ] Route to Soldier. Confirm status flips to `PENDING_SOLDIER_ACK`.

### Step 3 — Soldier signs (SGT Davis)
- [ ] New private window → `/dev-login` → **SGT Davis**.
- [ ] Dashboard Zone A shows CTA **"Review & Sign Evaluation"** → `/evaluations/dev-eval-davis/sign`.
- [ ] Scroll through the full read-only eval (Step 1 of signing).
- [ ] Type `LAST, FIRST` to confirm identity (Step 2) → Sign.
- [ ] Confirm status is now `COMPLETE` (Davis's rater, SSG Johnson, is not a 1LT, so supplementary review is skipped).
- [ ] Point out the eval is now permanently read-only for everyone.

---

## 4. Workflow 2 — True Zero-to-Hero (Support Form → Wizard → Complete)

**Cast:** SFC Williams (rated) ← CPT Smith (Rater **and** Senior Rater — same
person plays both hats on this chain, a nice contrast to Workflow 1's 3 distinct
roles).
**Starting state (seeded):** `dev-chain-williams` exists but has **no** Support
Form and **no** Evaluation yet — genuinely `NOT_STARTED`.
**What it proves:** the full evidence-to-eval pipeline — support-form entries →
AI "generate from entries" (with provenance) → eval creation wizard → both SR and
Rater duties handled by the same commander login.

> **Known gap — do this ONE-TIME setup before rehearsing, not live in the demo:**
> there is currently no frontend button for a soldier to create their own first
> Support Form (the `/support-form` page shows "Contact your rater or admin to
> have one started" if none exists yet). Create it once via a terminal call:
> ```bash
> curl -X POST http://localhost:4000/api/support-forms \
>   -H "Authorization: Bearer dev:robert.williams@army.mil:testpass" \
>   -H "Content-Type: application/json" \
>   -d '{
>     "soldierId": "dev-sfc-williams",
>     "ratingChainId": "dev-chain-williams",
>     "ratingPeriodStart": "2025-06-01",
>     "dutyTitle": "Platoon Sergeant",
>     "dutyMosc": "11B4O"
>   }'
> ```
> After this, the rest of the flow below is 100% clickable in the UI.

### Step 1 — Soldier logs accomplishments (SFC Williams)
- [ ] `/dev-login` → **SFC Williams**.
- [ ] Go to `/support-form` → confirm the form now shows (from the curl above) → click **"Log entry"**.
- [ ] Add at least one `ACCOMPLISHMENT` entry per dimension (CHARACTER, PRESENCE, INTELLECT, LEADS, DEVELOPS, ACHIEVES) — this satisfies the **soft-complete** gate and gives the AI generator real material to work from later.
- [ ] Finalize the support form (clears the **hard-complete** gate: admin fields + ≥1 entry in any dimension).

### Step 2 — Rater creates the evaluation (CPT Smith)
- [ ] New private window → `/dev-login` → **CPT Smith**.
- [ ] Dashboard Zone B → find SFC Williams → **"Initiate Evaluation"** (only enabled now that the support form is hard-complete).
- [ ] Walk the 5-step `EvalCreationWizard` (`/evaluations/new`): select soldier → confirm form type (auto-resolves to NCOER 9-2 from rank) → rating period + reason → link the support form → review + create.
- [ ] Confirm eval is created at `DRAFT`, with 8 milestones auto-generated.

### Step 3 — Rater builds Part IV using real entries (CPT Smith, same login)
- [ ] Open each of the 6 sections → use **"generate from entries"** (not generate-from-scratch this time) → point out the suggestions are grounded in the support-form entries logged in Step 1, and that accepted bullets have a **"View source"** provenance toggle.
- [ ] Complete all 6 sections → route to Senior Rater (status → `PENDING_SENIOR_RATER`).

### Step 4 — Senior Rater completes SR section (CPT Smith, same login — he's both)
- [ ] Because Smith is rater *and* SR on this chain, the eval routes back to himself — open the **Senior Rater** section, complete it, route to Soldier (`PENDING_SOLDIER_ACK`).

### Step 5 — Soldier signs (SFC Williams)
- [ ] Back to the SFC Williams window → **"Review & Sign Evaluation"** → scroll, confirm name, sign → status `COMPLETE`.

---

## 5. Workflow 3 — Backstage: Completed Eval, In-Flight SR Review, Admin/HRC (legacy cast)

**Cast:** James Smith (SGT, soldier) / Robert Jones (SSG, rater + rated) / David
Davis (SFC, senior rater) / Patricia Brown (SSG, Admin).
**Starting state (seeded, rich pre-built data — lowest risk to demo):**
- `seed-eval-smith-complete` — a **fully COMPLETE** NCOER with 13 real support-form entries across all 6 dimensions, all signed. Good for showing a finished product without any live clicking.
- `seed-eval-jones-pending` — status `PENDING_SENIOR_RATER`, all 6 Part IV sections **already written** with 4-level ratings and real bullets. Good for demoing the SR → Soldier-sign leg quickly, with zero AI-generation risk live.

**What it proves:** what a finished record looks like, the SR+sign leg without
depending on live AI calls, and the two backend-only capabilities that aren't
wired to any button yet (see callouts).

### Step 1 — View a finished evaluation (James Smith)
- [ ] `/login` → `james.smith@army.mil` / `testpass`.
- [ ] Open `seed-eval-smith-complete` → scroll all 6 sections, point out the rich bullets and the read-only, permanently-locked state.

### Step 2 — Push the pending eval to completion (David Davis, then Robert Jones)
- [ ] `/login` → `david.davis@army.mil` / `testpass`.
- [ ] Open `seed-eval-jones-pending` (status `PENDING_SENIOR_RATER`) → complete the Senior Rater section → route to Soldier.
- [ ] `/login` → `robert.jones@army.mil` / `testpass` (he is the "rated soldier" on his own chain in this seed) → **"Review & Sign Evaluation"** → sign → status `COMPLETE`.

### Step 3 (optional/stretch, terminal only) — Admin actions with no UI yet
> **Known gap:** neither PDF export nor HRC submission has a frontend button
> today — both exist only as backend routes. Only demo these if you're
> comfortable narrating "this is the API, the UI button is next on the roadmap."

- [ ] PDF export (any chain member's token works):
  ```bash
  curl -H "Authorization: Bearer dev:patricia.brown@army.mil:testpass" \
    http://localhost:4000/api/pdf/evaluations/seed-eval-smith-complete -o smith-ncoer.pdf
  ```
- [ ] Submit to HRC (Admin-only):
  ```bash
  curl -X POST -H "Authorization: Bearer dev:patricia.brown@army.mil:testpass" \
    http://localhost:4000/api/evaluations/seed-eval-smith-complete/submit-to-hdqa
  ```

---

## 6. Known Gaps — Steer Around These Live

| Gap | Why it matters for the demo |
|---|---|
| No frontend button to create a soldier's first Support Form | Pre-create it via curl before demoing (see Workflow 2 setup). |
| No frontend PDF export / HRC submission button | Backend-only; narrate as "next on the roadmap" if asked, don't try to click a button that isn't there. |
| Officer (OER) builder is a stub for CPT Smith's/1LT Torres's **own** evaluation | Don't attempt to build an OER from scratch live — stick to the NCOER workflows above (1-3), which are the fully-built path. |
| Supplementary review (`PENDING_SUPPLEMENTARY_REVIEW`) has no seeded chain where the **rater** is a 1LT | Can't be demoed with current seed data as-is. If asked, explain the trigger rule (AR 623-3: a 1LT rater requires an extra reviewing officer) rather than trying to force it live. |
| PDF export has no DRAFT-state gate/watermark yet | Avoid exporting a PDF for an incomplete eval in front of stakeholders — it'll look like a mostly-empty document with no "DRAFT" indicator. |
| Missing `ANTHROPIC_API_KEY` causes a generic 500 on any AI button | Test the AI generator once immediately before you go on — silent failure is the #1 risk to a live demo. |

---

## 7. Reset Cheat Sheet

- Re-seed everything (idempotent, safe to run anytime): `cd ees2-backend && npm run seed`
- Confirm real backend (not mock) is running: `npm run dev:real`
- Clear stuck login state: DevTools → Application → Local Storage → delete `devAuth` and `devProfileEmail`, or just use a fresh private window per persona.
