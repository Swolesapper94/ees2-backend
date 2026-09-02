# 05 — Security & Compliance

> How MERIT protects data, enforces authorization, preserves integrity, and aligns with Army evaluation regulation.

---

## 1. Security posture at a glance

| Domain | Approach |
|--------|----------|
| **Authentication** | Supabase Auth (JWT); every request server-verified — no trust of client-declared identity |
| **Authorization** | Three enforced layers: database deny-by-default boundary → API role middleware → relationship/snapshot domain rules |
| **Transport** | HTTPS; bearer-token auth on every non-health endpoint |
| **Input validation** | Zod schema validation on every request body at the API boundary |
| **HTTP hardening** | `helmet` security headers, configured `cors` allow-list, `morgan` request logging |
| **Data integrity** | Signature content hashing; permanent audit and MERIT-generation logs |
| **Secrets** | Environment variables; service-role keys are backend-only and never exposed to the client |
| **MERIT assistance safety** | Evidence-in, mandatory human review, permanent provenance |

---

## 2. Authentication

- **Identity provider:** Supabase Auth issues signed JWTs on login.
- **Server-side verification:** the backend uses a **service-role** Supabase client to verify each incoming token and resolve it to the EES `User` record. The frontend cannot assert who it is — the server decides based on a cryptographically verified token.
- **Service-role isolation:** the service-role key lives only in the backend environment and is never shipped to or reachable from the browser.
- **Development shim:** a local dev-login path exists to speed development. It is explicitly a non-production convenience and is gated to the development environment.

---

## 3. Authorization — defense in depth

Authorization is enforced at **three layers**.

### Layer 1 — Database (deny-by-default browser boundary)
Every public application table has PostgreSQL **Row-Level Security** enabled, and the Supabase `anon` and `authenticated` roles have no direct schema, table, sequence, or routine privileges. No browser-facing RLS policies are installed. Domain records are available only through the backend's direct database connection; if browser privileges are restored later, RLS continues to deny access until an explicit policy is added.

### Layer 2 — API (role middleware)
`requireAuth` establishes identity; `requireRole(...)` restricts sensitive routers. For example, analytics/commander endpoints are role-gated, and a senior-rater-only endpoint returns **403** to non-senior-raters. Roles live on the `User` (`SOLDIER`, `RATER`, `SENIOR_RATER`, `REVIEWER`, `COMMANDER`, `ADMIN`, plus unit-leadership roles).

### Layer 3 — Domain (relationship and immutable snapshot)
Even with a valid global role, *which* evaluation a user may act on — and in what capacity — is determined by the specific relationship. Legacy records use the persisted `RatingChain` during migration. New assignment-backed evaluations use an immutable `EvaluationRatingSnapshot`, so a later assignment change cannot grant access to, or remove access from, an existing evaluation. Centralized authorization policies limit rater content to the rater, senior-rater content to the senior rater, and supplementary reviewers to their review/sign boundaries. Supplementary reviewers cannot generate bullets or confirm support-form entries. Artifact upload, flagging, and deletion remain separately authorized against the soldier who owns the underlying support form. Evaluation comments require a direct relationship or an explicit scoped `ADD_NON_EVALUATIVE_COMMENT` capability.

---

## 4. Data integrity & non-repudiation

Evaluations are legal-weight records, so the system is built to answer "who did what, when, and can we prove it wasn't altered?"

- **Signatures (`Signature`)** capture role, name confirmation, timestamp, IP address, user agent, and optional CAC/PKI fields. Each signature is bound to the content it signed via a **content hash**.
- **Stale-signature detection:** if a signed field is later edited, `staleSigDetect` recomputes the hash, detects the mismatch, and flags the signature as stale — a silent post-signature edit is impossible to hide. `StaleReason` distinguishes a content edit from an admin correction.
- **Audit log (`AuditLog`)** records meaningful actions — signatures, submissions, entry confirmations, suggestion review decisions, evaluation-status transitions — for a tamper-evident history.
- **MERIT provenance chain (`AIBulletSuggestion` / `EvalSection.bulletProvenance`).** Every MERIT suggestion stores an immutable generation-time source snapshot. Once accepted, the final content retains the suggestion, source references, and snapshot so later source edits cannot rewrite history. `AIBulletSuggestion` remains the internal schema name.
- **Transactional, idempotent writes.** Accepting or editing a MERIT suggestion is one atomic conditional transaction; duplicate requests cannot silently create duplicate final content.
- **Assignment and form integrity.** Published, effective-dated rating assignments are eligibility-validated before use. Assignment-backed evaluation creation captures an immutable official snapshot and consumes its support form in one transaction; duplicate form consumption is rejected.
- **Legacy isolation.** Historical test records that lack the required snapshot are retained with `QUARANTINED` disposition and excluded from normal active workflows rather than being deleted or silently treated as compliant.
- **Access and Assistance.** A helper always acts under their own authenticated account through an accepted, time-limited, capability-scoped resource grant. Assistance never transfers identity, signature, acknowledgment, rating authority, evidence-confirmation authority, or rating-chain authority. Delegated writes record actor, subject, grant, capability, and action in the audit log.
- **Identity and Access Administration.** Application administrators manage EES access state, administrative scopes, synchronization/reconciliation requests, and exceptions. They do not edit authoritative personnel identity data or derive rating authority from static profile roles. Suspensions, reactivations, syncs, exception resolution, and reconciliation requests are audited.

---

## 5. MERIT assistance safety and integrity

MERIT assistance is deliberately constrained so it cannot become an unaccountable author. This is both a product principle and a compliance control.

1. **Evidence-in, not prompt-in.** Bullets derive from the soldier's documented, proof-backed accomplishments or an explicit rater description — not from open-ended prompting.
2. **Mandatory human review.** Every suggestion is `PENDING_REVIEW` until a human accepts, edits, or rejects it. A section cannot be completed while suggestions are unreviewed.
3. **Permanent, linked provenance.** Each final bullet carries a `BulletSource` (`HUMAN` / `AI_MODIFIED` / `AI_UNMODIFIED`) and a full provenance chain back to its originating suggestion, source entries, and evidence snapshot.
4. **Visibility boundary.** Rated Soldiers never see MERIT-generated candidates; they see only their own submitted records.
5. **Doctrine grounding (RAG).** Generation is grounded in searchable AR 623-3 / DA PAM 623-3 text (`RegulationChunk`), reducing hallucination and keeping output regulation-aligned.
6. **Unsupported-fact detection.** A deterministic checker compares specific claims in a draft or edited bullet against generation evidence. It is advisory, re-runs before submission, and never becomes the sole arbiter of truth.
7. **Prohibited-language screening.** Content barred by DA PAM 623-3 (e.g., references to protected characteristics) is screened against.
8. **Whole-document source isolation.** The upload pipeline generates at most one candidate per extracted source fact and produces nothing for an unsupported/empty dimension. Evidence lives in a private bucket. Authorized API responses issue five-minute signed links, and the original support-form upload is streamed only through an authenticated evaluation relationship endpoint; browser clients never receive a local `file://` path.
9. **Administrative boundary.** Admin navigation is hidden unless the authenticated user has application-administrator access. Identity APIs return `403` before any summary count or record is sent to an unauthorized caller; the frontend renders a dedicated access-denied experience rather than a zeroed dashboard.

---

## 6. Evidence provenance & the iPERMS-discrepancy flag

Because there is **no public API to verify documents against iPERMS**, MERIT does not fake automated verification. Instead it makes evidence transparent and reviewable:

- Each artifact receives a factual MERIT caption (no embellishment).
- The soldier can **self-attest a discrepancy** (`flaggedByServiceMember` + required note) — e.g., "not yet in iPERMS" or "wrong date on the certificate."
- That flag **follows the artifact** everywhere it appears and surfaces to the rater/senior rater as a visible warning (including a `hasFlaggedArtifacts` signal when generating bullets), so a questionable claim is never laundered into a clean-looking bullet silently.
- Separately, the **rater** can record their own review of a logged entry — confirmed, needs clarification, or not used — which is a distinct, complementary control: the soldier discloses what they know about their own evidence, and the rater independently records having reviewed it before relying on it.

This is an honesty-preserving interim control until authorized system-of-record integration is available.

---

## 7. Regulatory compliance (AR 623-3 / DA PAM 623-3)

The system encodes regulation as software guardrails rather than relying on individual memory:

| Regulatory requirement | How MERIT enforces it |
|------------------------|--------------------------|
| **Counseling timeline** (initial within 30 days; quarterly) | `EvalMilestone` suspense dates auto-generated; `CounselingSession` records feed compliance analytics and Part II dates |
| **Support-form completeness before evaluation** | Two-tier completeness gate; evaluation initiation blocked until the hard gate clears |
| **Correct form per grade** | Form type auto-resolved from rank (2166-9-1 / -9-2 / -9-3; 67-10 series) |
| **Rating-scale rules** | Grade-appropriate scale enforced (`RatingBinary` for SGT; `RatingFourLevel` for E6–E9) |
| **Senior-rater profile cap** ("most qualified" ≤ limit) | `SeniorRaterProfile` distribution tracked; cap visualized and guarded |
| **Signature order & integrity** | Chain-ordered, content-hash-protected signing with stale detection |
| **Official eligibility and assignment versioning** | Published effective-dated assignment validates category/rank rules, review requirement, and overlap; evaluation captures immutable snapshot |
| **Supplementary-review boundaries** | Reviewer is assigned per snapshot for evaluation review/sign; no bullet authoring or support-form entry confirmation. Evaluation comments require a direct relationship or an explicit scoped non-evaluative-comment capability. |
| **Support-form lifecycle and reuse** | Explicit status/disposition plus atomic consumption on assignment-backed evaluation creation; legacy duplicates are quarantined |
| **Prohibited content** | DA PAM 623-3 language screening |
| **Pre-submission validation** | Consistency check catches contradictions, unresolved unsupported-fact claims, and regulation issues before signature |
| **Correction routing** | `EvaluationReturn` + a RETURNED-state sub-flow model HRC/chain returns and reprocessing |

---

## 8. Deployment & accreditation considerations

MERIT uses a conventional, hardened, portable stack intended for deployment into an accredited environment:

- **Portability:** PostgreSQL underneath Supabase means the data layer is standard and movable; the backend is a standard Node/Express service.
- **Secrets management:** environment-based configuration with backend-only service credentials.
- **Auditability:** comprehensive action and MERIT-generation logging supports accreditation and incident review.
- **ATO planning:** an Authority to Operate process should be scoped early for any DoD deployment; the architecture (RLS, role gating, audit, no client-side secrets) is designed to support that review. Data classification, hosting boundary, and system-of-record integration approvals are program-level decisions to be settled with the sponsoring organization.

> **Note:** This document describes the system's security *design*. Formal accreditation (ATO), penetration testing, and a full DoD security control assessment are program activities to be completed with the sponsoring organization before handling live personnel data.

---

**Next:** [06 — Roadmap & Status](./06-roadmap-and-status.md).
