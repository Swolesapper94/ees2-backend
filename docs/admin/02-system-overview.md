# 02 — System Overview (Practical)

> How EES 2.0 works in day-to-day use, described functionally rather than technically. If you want the engineering detail, see [03 — Technical Architecture](./03-technical-architecture.md).

---

## The four roles

EES 2.0 mirrors the real Army **rating chain**. Access and available actions are governed by a user's role(s):

| Role | Who they are | What they do in the system |
|------|--------------|----------------------------|
| **Soldier (Rated)** | The NCO or officer being evaluated | Logs support-form entries + proof; initiates their own evaluation; acknowledges/signs the finished report |
| **Rater** | The rated soldier's direct supervisor | Writes Part IV performance bullets; generates/reviews AI drafts; routes to senior rater |
| **Senior Rater** | The rater's supervisor | Provides the overall potential assessment; manages the "most qualified" profile; writes succession planning |
| **Commander / Admin** | Unit leadership and administrators | Manage users, units, and rating chains; view compliance and velocity analytics |

A person can hold multiple roles (a rater is also somebody else's rated soldier). The system resolves the correct role per evaluation via the rating chain.

---

## The two halves of the system

### Half 1 — The Support Form (continuous performance capture)

The support form is a **living log** that exists for a rating period, anchored to a rating chain. It is where the year's evidence accumulates.

**What a soldier does:**
1. Opens the Support Form and clicks **Log entry**.
2. Chooses whether it's an **Objective** (a goal to work toward) or an **Accomplishment** (something already done).
3. Picks which of the six leadership dimensions it supports (Character, Presence, Intellect, Leads, Develops, Achieves).
4. Writes a short factual description.
5. **Optionally attaches proof** — one or more *artifacts*:
   - **Certificate/Award** (school completion, AER, award certificate)
   - **Score Sheet** (ACFT score sheet, range card, test result)
   - **Photo** (the soldier performing a task, with their team/squad, etc.)
   - **Document** (any other paper record)
   - **Other**
6. If the soldier isn't sure the document is reflected in iPERMS yet — or thinks there may be a discrepancy — they can **flag it** with a short note. That flag follows the artifact and surfaces to the rater/senior rater as a visible warning, rather than a silent claim.

**What the system does automatically:**
- Each uploaded artifact is read **once** by AI vision and given a short, factual **caption** (e.g., "DA 87 Certificate of Training — Combatives Level 1, dated 12 MAR 2025"). That caption is stored and reused later, so images never have to be re-processed on every use.
- Entries are organized by dimension and available for the rater when the evaluation is built.
- The rater can **confirm** a logged entry (marking it reviewed and trustworthy), request **clarification** with a short note, or mark it **not used** — a lightweight review status that travels with the entry wherever it's shown, separate from the soldier's own artifact-level self-attestation.
- All of a rating period's entries, counseling sessions, and milestones can be viewed together on a filterable **Performance Timeline** — useful context before drafting or finalizing bullets.

**Completeness gating (two-tier):**
- **Hard gate** — Part I–III administrative data plus at least one goal in *any* dimension. Clearing this **unlocks** the ability to initiate the evaluation.
- **Soft indicator** — all six dimensions have at least one goal. This is shown as a progress indicator but **never blocks** the soldier (so one slow dimension can't hold a career hostage).

### Half 2 — The Evaluation (the official NCOER/OER)

When the rating period closes (or a triggering event occurs), the documented performance becomes the official report.

**Initiation is soldier-led.** The rated soldier starts their own evaluation from their dashboard. The form type is chosen automatically from their rank (a SGT gets a DA 2166-9-1; E6–E8 get a 2166-9-2; officers get the appropriate 67-10 series). The evaluation cannot be initiated until the support form clears the hard completeness gate.

**The rater picks it up** and works through the DA-form sections. For each of the six Part IV performance dimensions, the rater has a builder that offers three ways to produce bullets:

1. **Soldier Accomplishments widget** — shows the soldier's logged accomplishments *for that dimension*, each with its attached proof, AI caption, and the rater's own confirmation status. The rater checks the ones that apply and clicks **Generate bullets from selected**. The AI turns that evidence (plus doctrinal context) into ranked draft candidates. If any selected item had a soldier-flagged artifact, the rater sees a "verify before relying on this" warning.
2. **Generate from scratch** — the rater describes what the soldier did in free text, and the AI drafts candidates from that.
3. **Write manually** — the rater types bullets directly.

**Every AI draft flows into a review panel** where the rater must **accept, edit, or reject** each one. Before deciding, the rater also sees any **unsupported-fact warnings** — specific claims in the draft (a number, a date, a school name, an award) that don't appear anywhere in the evidence it was generated from. A section can't be marked complete while suggestions await review. Accepted bullets are tagged with a source (`AI_UNMODIFIED`, `AI_MODIFIED`, or `HUMAN`) and keep a permanent, reviewable link back to exactly which entries and evidence produced them.

**Routing and signatures** follow the real rating chain: rater → senior rater → (supplementary reviewer, if required) → rated soldier acknowledgment. Signing is parallel-aware and content-hash protected, so editing a signed field flags the signature as stale. The evaluation's status is **automatically derived** from real section-completion and signature progress, so everyone always sees an accurate picture of where the report stands — not a stale or manually-set label.

**Export.** The finished evaluation renders to the official DA-form PDF for submission.

---

## A day-in-the-life walk-through

**March — a training event happens.**
SGT Smith completes Combatives Level 1. That evening he opens EES 2.0, logs an *Accomplishment* under **Presence/Achieves**, snaps a photo of the certificate, tags it **Certificate**, and saves. The system captions the certificate automatically. Total time: about a minute.

**...repeated all year.** Range quals, an ACFT score sheet, leading a squad through a field problem, mentoring a junior soldier for a promotion board — each becomes a small, proof-backed entry as it happens.

**December — evaluation time.**
SGT Smith clicks **Initiate My Evaluation**. Because his support form is complete, it's allowed. His rater, SSG Jones, gets a notification and opens the report. On the **Leads** section, Jones sees Smith's logged leadership accomplishments with their photos and captions, selects the three strongest, and clicks **Generate**. Five regulation-formatted draft bullets appear. Jones tightens the wording on two, accepts one as-is, rejects two, and adds one of his own. Ten minutes, not two hours.

**Routing.**
Jones routes to the senior rater, who sets the overall assessment (the system enforces the "most qualified" profile cap), completes succession planning, and signs. The consistency check runs, the soldier acknowledges, and the PDF is generated.

**The difference:** the evaluation reflects a documented, verified year — not a deadline-night reconstruction.

---

## What the system tracks and enforces for you

| Area | What's automatic |
|------|------------------|
| **Counseling milestones** | AR 623-3 initial (within 30 days) and quarterly counseling suspenses are generated and tracked |
| **Completeness** | Two-tier support-form gating unlocks (or blocks) evaluation initiation |
| **Evaluation status** | Automatically derived from real section-completion and signature progress — never a stale or manually-set label |
| **Rater confirmation** | Raters can confirm, request clarification on, or decline to use a soldier-logged entry — visible wherever that entry appears |
| **Unsupported-fact warnings** | AI-drafted bullets are checked against the selected evidence; specific unsupported claims (numbers, dates, schools, awards) are flagged before acceptance, and again before final submission |
| **Bullet provenance** | Every AI-touched bullet keeps a permanent, reviewable "view source" link back to the exact entries and evidence it came from |
| **Performance timeline** | A chronological, filterable view composing logged entries, counseling sessions, and milestones for full-period context |
| **Consistency** | A multi-type check runs before signature to catch contradictions, unresolved unsupported-fact warnings, and regulation issues |
| **Signature integrity** | Content hashing detects edits to signed fields and flags stale signatures |
| **Profile limits** | Senior-rater "most qualified" percentage cap is visualized and guarded |
| **Prohibited content** | Language screening for content barred by DA PAM 623-3 |
| **Audit** | Meaningful actions — signatures, submissions, entry confirmations, suggestion review decisions, status changes — are logged with actor and timestamp |
| **Analytics** | Commanders see counseling compliance, evaluation velocity, due-date windows, and HRC-return trends |

---

## Boundaries the system deliberately enforces

- **Soldiers never see AI-generated bullets.** They see their own logged entries; the rater owns the assessment. This preserves the integrity of the rater's independent judgment.
- **Relief-for-cause and similar administrative reason codes** are set by the rater, never chosen by the soldier during initiation.
- **AI proposes; humans dispose.** There is no path in the system where an AI-written bullet reaches a signed evaluation without a human explicitly accepting it.

---

**Next:** [03 — Technical Architecture](./03-technical-architecture.md) — the stack, data model, and data flow behind all of the above.
