# 06 — Roadmap & Status

> Where the system is today, what's built, and what's next. Status reflects the state of the codebase as of **July 2026**, including a subsequent hardening pass (see §2a) that closed several authorization and data-integrity gaps found during an internal audit. This is a living document — update it as work lands.

---

## 1. Maturity summary

EES 2.0 is a **working, integrated prototype** with the core evidence-capture → AI-assisted-drafting → compliance-gating → export loop implemented end to end. It is **not yet accredited for production use with live personnel data** — see [05 — Security & Compliance](./05-security-and-compliance.md) §8.

| Layer | Status |
|-------|--------|
| Data model (36 Prisma models) | ✅ Deployed; all 14 migrations applied to Supabase as of 2026-07-17. See [10](./10-regulatory-remediation-status.md) for deployment caveats. |
| Backend API (all core routers) | ✅ Implemented |
| AI pipelines (generation + captioning) | ✅ Implemented, with immutable snapshots + unsupported-fact detection |
| Frontend core flows | ✅ Implemented; some polish/edges pending |
| Security design (authn/authz/audit) | ✅ Designed & implemented; formal accreditation pending |
| Production accreditation (ATO, pen test) | ⛔ Not started (program activity) |

---

## 2. What's built (✅)

### Continuous performance capture
- ✅ Support form anchored to a rating chain, with two-tier completeness gating (hard gate unlocks the evaluation; soft indicator tracks all-six-dimension progress).
- ✅ Entry logging (Objective / Accomplishment) across the six leadership dimensions, wired end to end to the backend.
- ✅ **Artifact upload** (Certificate, Score Sheet, Photo, Document, Other) with per-artifact type tagging.
- ✅ **AI artifact captioning** — vision/PDF captioning that runs once per upload and is reused as generation context.
- ✅ **iPERMS-discrepancy self-attestation flag** that follows the artifact and surfaces to the rater/senior rater.

### Evaluation & AI
- ✅ Soldier-led evaluation initiation with rank-based form-type resolution and the support-form completeness gate.
- ✅ Section builder with three drafting paths: **generate from selected logged entries**, generate from scratch, and manual entry.
- ✅ **Soldier Accomplishments widget** — the rater-facing bridge that turns logged, proof-backed entries into draft bullets.
- ✅ AI bullet review panel (accept / edit / reject) with mandatory-review gating and provenance tagging.
- ✅ Whole-document upload pipeline (vision extract → parse → one evidence-grounded candidate per extracted fact) for scanned/handwritten support forms, with authenticated original-document viewing and safe reprocessing.
- ✅ Regulation-grounded generation (RAG over AR 623-3 / DA PAM 623-3).

### Compliance, integrity, and analytics
- ✅ AR 623-3 milestone generation and counseling tracking, with rating-chain-authorized milestone actions.
- ✅ Consistency check before signature, including a deterministic **unsupported-fact check** (numbers, dates, schools, awards/rankings claimed in a bullet but absent from its source evidence).
- ✅ Content-hash signatures with stale-signature detection.
- ✅ Senior-rater profile (most-qualified cap) tracking.
- ✅ Rating-chain-authorized signing — a user must hold the specific role they attempt to sign as.
- ✅ Assignment-backed evaluation selector — creation shows only the caller's effective published assignments with a matching active compatibility chain, preventing duplicate historical chain choices.
- ✅ Evaluation status **automatically derived** from real section-completion and signature progress (no manually-set, driftable status field).
- ✅ Audit log covering signatures, submissions, entry confirmations, suggestion review decisions, and status transitions.
- ✅ Dashboard/commander analytics (counseling compliance, evaluation velocity, due-date windows, and HRC-return trends), role-gated.
- ✅ DA-form PDF export, authorized to rating-chain members.

### Evidence-to-bullet lifecycle (rater-facing trust & provenance)
- ✅ **Rater confirmation** — a rater can mark a soldier-logged entry `CONFIRMED`, `NEEDS_CLARIFICATION` (with a note), or `NOT_USED`, distinct from the soldier's own artifact-level self-attestation.
- ✅ **Immutable source snapshots** — every AI suggestion permanently captures the exact entry text and artifact captions it was generated from, so later edits/deletes of the source can't rewrite history.
- ✅ **Full bullet provenance chain** — an accepted bullet keeps a permanent, reviewable link back to its originating suggestion, source entries, and evidence snapshot (a "view source" affordance in the section builder).
- ✅ **Transactional, idempotent suggestion acceptance** — accept/edit is one atomic operation; duplicate or double-submitted requests are rejected cleanly instead of creating duplicate bullets.
- ✅ **Performance timeline** — a chronological, filterable composition of logged entries, counseling sessions, and milestones, giving full rating-period context before drafting or finalizing bullets.

### Platform
- ✅ Split-stack app (Next.js frontend / Express backend), Supabase auth + Postgres + storage.
- ✅ Three-layer authorization (RLS → role middleware → rating-chain domain rules), consistently applied across generation, review, signing, PDF export, milestone actions, and artifact ownership.
- ✅ Rank insignia display with graceful fallback; personalized dashboard; profile pictures.
- ✅ Notification bell unread count plus in-place refresh after dev notification seeding; no page reload or profile remount is required.
- ✅ **Identity and Access Administration** — read-only authoritative identity inspection, sync status, exception tracking, EES access suspension/reactivation, administrative scopes, reconciliation requests, assignment/access-grant inspection, and audit history. Test personas are isolated to a non-production `/dev/personas` surface.

### Regulatory assignment and lifecycle controls (2026-07-11)
- ✅ Versioned `RatingSchemeAssignment` lifecycle: draft, approval, publication, and prospective replacement with effective-date overlap protection.
- ✅ Rating-official eligibility and supplementary-review requirement validation before an assignment can be published.
- ✅ Immutable `EvaluationRatingSnapshot` creation for assignment-backed evaluations; the snapshot is the future authorization source for that record.
- ✅ Explicit support-form lifecycle, entry authorship/locking metadata, evaluation disposition, and transactionally enforced form consumption for assignment-backed creation.
- ✅ Central relationship-based policies now protect support-form reads/writes, entry creation/confirmation, evaluation access, edits, and signatures. Supplementary reviewers cannot generate bullets or confirm entries.
- ✅ Dedicated snapshot-scoped `/api/dashboard/reviews-required` work queue for pending supplementary review.
- ✅ The pre-existing 10 draft evaluations and 11 support forms were retained but quarantined after a dry-run classification; they are excluded from normal active workflows.

---

## 2a. Hardening pass (July 2026)

An internal audit traced every capability against its actual implementation (not just documentation claims) and closed the gaps it found before they reached a production pilot:

- **Authorization coverage.** Several routes previously checked only "is this a logged-in user" rather than "is this user actually authorized for this specific evaluation." A shared rating-chain-authorization helper now covers bullet generation, suggestion review, signing, PDF export, milestone actions, and artifact ownership consistently.
- **Evaluation status.** Status is now computed from real section-completion and signature state rather than a field that could silently drift from reality.
- **Duplicate-generation cleanup.** An early, superseded bullet-generation code path (pre-dating the current regulation-grounded pipeline) was retired in favor of the single, actively used pipeline — removing a source of confusion about which system was authoritative.
- **Data-integrity hardening.** Suggestion acceptance is now transactional and idempotent (safe against double-submission), and every AI suggestion carries an immutable snapshot of its source evidence plus a full provenance chain once accepted.

This pass did not change the overall production-readiness posture (see §8 of [05 — Security & Compliance](./05-security-and-compliance.md)) but meaningfully strengthens the authorization and integrity foundation the accreditation process will review.

### 2b. Regulatory migration status (2026-07-11)

The compliance foundation is implemented additively. Legacy `RatingChain` relationships remain available for compatibility and are still used by portions of the dashboard and older records. New regulated workflows can use published `RatingSchemeAssignment` records and immutable evaluation snapshots. The existing demo data was quarantined rather than rewritten or deleted because it contains duplicate form consumption and rating relationships that do not satisfy the new validation rules.

### 2c. PM-facing fresh-start demo route

The ideal program-manager demo should not rely on already-polished seeded bullets. Use [16 - PM Demo Route: Fresh Evidence to AI Bullets](./16-pm-demo-route.md) to rehearse a fresh route where a Soldier adds or uploads new support-form evidence, the rater generates AI suggestions from that evidence, and the demo proves human review, source provenance, unsupported-fact checks, workflow sequencing, and final-form controls.

The recommended live path is the Davis NCOER workflow because it exercises the complete authoring and review chain. The Torres OER path remains valuable for showing officer form selection and the MAJ senior-rater topology, but should be treated as a boundary demo until OER authoring reaches NCOER parity.

---

## 3. In progress / partial (⏳)

- ⏳ **Rater Profile & Rater Tendency model (demo-build signed)** — [document 15](./15-rater-profile-and-tendency-model.md) defines the missing AR 623-3 §3-11 rater-side instruments as projected decision support. Section 12 now authorizes the demo scope: seeded baselines, no separate profile-credit model, deterministic OER LOCK mechanics without CAC binding, informational restart state only, and an explicit `isRetiredRecalled` field before projection code lands.
- ⏳ **Support-form guided wizard (frontend)** — the multi-step stepper (Part I → Part III → guided goal-setting → review) that fully replaces the simpler entry flow; backend + goal-prompt scaffolding are done.
- ⏳ **Support-form PDF template** — a react-pdf DA 2166-9-1A / 67-10-1A template branching on `evalCategory`.
- ⏳ **Zone A CTA gating (frontend)** — disabling "Initiate My Evaluation" until the support form is complete, with a visible missing-items checklist (the backend gate is already authoritative).
- ⏳ **Rank insignia asset set** — a subset of ranks still fall back to text badges (e.g., SGM, warrant-officer ranks, junior enlisted) pending sourced artwork.
- ⏳ **Officer-typed seed/e2e coverage** — seed data currently exercises NCO forms; officer-path fixtures and end-to-end tests are pending.
- ⏳ **Compliant replacement demo data** — add the MAJ persona selected for the valid senior-rater topology, publish valid assignments, create assignment-backed support forms, and replace the quarantined legacy demo workflow.
- ⏳ **Snapshot-first read migration** — move remaining dashboard, formation, PDF, comments, milestones, and legacy-chain authorization paths to immutable evaluation snapshots where the resource has one.
- ⏳ **Authoritative personnel integration** — connect approved personnel sources (for example IPPS-A/identity providers) to replace development-seed sync records. Production admin screens intentionally expose `NOT_CONFIGURED`/exception states until that integration is authorized and available.
- ⏳ **Role terminology migration** — migrate stored legacy `REVIEWER` values and frontend/API types to `SUPPLEMENTARY_REVIEWER` without breaking historical records.

---

## 4. Planned / next (🔜)

Roughly in priority order:

1. 🔜 **Finish the soldier-facing guided wizard** and support-form PDF, completing the continuous-capture experience.
2. 🔜 **Frontend CTA gating polish** so the soldier's dashboard clearly reflects completeness state.
3. 🔜 **System-of-record integration (as authorized)** — formal iPERMS / IPPS-A connectivity to replace/augment the self-attestation flag.
4. 🔜 **Mobile-optimized quick entry** — make in-the-moment logging (photo of a certificate, one-line accomplishment) as frictionless as possible, since continuous capture is the behavioral crux of the whole model.
5. 🔜 **Expanded analytics** — trend and talent-management views over the newly structured performance data.
6. 🔜 **Broader form coverage** — deepen the officer (67-10 series) builder to parity with the NCO builder.
7. 🔜 **Acceptance and route tests** — add explicit positive and negative coverage for assignment eligibility, snapshot-only review access, support-form locking/consumption, and quarantine exclusion.
8. 🔜 **Broader audit coverage** — extend the audit log to every entry update and lifecycle change, then verify the full regulatory audit report end to end.
9. 🔜 **Rater Profile & Rater Tendency implementation** — implement the document 15 signed demo scope: Prisma models, `isRetiredRecalled` field, projection service, rater-only/tendency visibility routes, box-check snapshot transaction, deterministic OER LOCK mechanics, and demo fixtures without command visibility or enforcement gates.
10. 🔜 **Accreditation track** — ATO scoping, penetration testing, and DoD security control assessment for a production pilot.

---

## 5. Longer-horizon opportunities

- **Multi-service generalization** — the core engine (evidence capture → constrained AI drafting → compliance gating → audited export) applies to other services' evaluation systems and to federal civilian appraisals.
- **Talent-management analytics** — longitudinal, structured, proof-backed performance data enables fairness auditing and force-level insight that doesn't exist today.
- **Board-support tooling** — consistent, verifiable records open the door to better-informed promotion and selection boards.

---

## 6. Known constraints & dependencies

- **`OPENAI_API_KEY` required** — AI features fail closed without it; it must be present in the backend environment.
- **iPERMS/IPPS-A** integration depends on authorized access to closed DoD systems; until then, the self-attestation flag is the honest interim control.
- **Accreditation gates production** — live personnel data requires completion of the security/accreditation activities in [05](./05-security-and-compliance.md) §8.

---

**Next:** [07 — Glossary](./07-glossary.md).
