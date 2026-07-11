# 04 — Business Case

> The value, market, economics, and risk view. Figures marked *(illustrative)* are planning estimates for framing the opportunity, not audited financials; they should be validated against a specific customer's data during a pilot.

---

## 1. The problem is large, recurring, and expensive

Army evaluations are not an edge case — they are a **universal, annual, mandatory** process affecting essentially every enlisted leader and officer in the force.

- **Scale:** The Army comprises roughly **450,000+ active-duty** soldiers, with a large majority receiving at least one formal evaluation per year (NCOERs for E5+ and OERs for officers), plus National Guard and Reserve components.
- **Frequency:** Annual at minimum, plus event-driven reports (change of rater, relief for cause, complete-the-record).
- **Stakes:** Evaluations are the primary input to promotion boards, command selection, and retention — they shape careers and, in aggregate, force readiness.

Any inefficiency here is multiplied across hundreds of thousands of reports every single year.

## 2. Where the money and time leak today

| Pain point | Who feels it | Cost driver |
|------------|--------------|-------------|
| Support forms written from memory at the deadline | Soldier + rater | Lost accomplishments; weaker records; rework |
| Blank-page bullet writing | Raters & senior raters (experienced leaders) | Hours of high-salary labor per report |
| Inconsistent quality across raters | Promotion boards, the soldier | Unfair outcomes; appeals; morale/retention cost |
| Manual compliance (counseling, timelines, profile caps) | Rater, S1/admin | Missed suspenses → HRC rejections → reprocessing |
| HRC returns and reprocessing | S1 shops, command | Direct rework cost; delayed promotions |
| Lost history at PCS | The institution | Re-documentation; unfair "gaps" in records |
| Integrity risk (unverified claims) | Command, IG | Investigations; erosion of trust |

### An illustrative time model *(illustrative)*

Assume a conservative **3–5 hours** of combined rater + senior-rater time per evaluation today (drafting, wordsmithing, revisions, compliance checking). EES 2.0's evidence-driven, AI-assisted flow targets a **50–70% reduction** in that active authoring time by turning "write from a blank page" into "review and edit evidence-based drafts."

- If a formation processes **1,000 evaluations/year** at **4 hours** each = **4,000 leader-hours/year**.
- A 60% reduction returns **~2,400 leader-hours/year** to the mission — per 1,000 evaluations.
- Scale that across a division (multiple thousands of evaluations) and the reclaimed leader time becomes a **readiness multiplier**, before counting reduced HRC rework.

The point is not the precise number — it's that the leverage compounds across a very large, repeating denominator.

## 3. The value proposition

**EES 2.0 converts evaluation from a deadline-driven writing task into an evidence-driven review task.** That shift produces value on four axes:

1. **Time reclaimed** — leaders spend minutes reviewing, not hours drafting.
2. **Quality & fairness** — bullets are grounded in *documented, proof-backed* accomplishments and Army doctrine, reducing rater-luck variance that distorts promotion boards.
3. **Compliance & risk reduction** — regulatory gates (counseling, completeness, signature order, profile caps, prohibited language) are automatic, cutting HRC rejections and reprocessing.
4. **Institutional memory** — a durable, auditable, proof-linked performance record that survives leader rotations and protects soldier, rater, and command alike.

## 4. Return on investment

**Cost avoided** (per adopting formation):
- Reclaimed leader-hours (the largest line item).
- Reduced HRC returns → less reprocessing and fewer delayed promotions.
- Reduced administrative burden on S1/HR shops.
- Reduced integrity-investigation exposure via verifiable, flagged evidence.

**Value created:**
- Fairer, more consistent boards → better talent decisions → retention and readiness.
- Preserved history → fewer "record gaps" penalizing soldiers at no fault of their own.
- Data: for the first time, structured, longitudinal performance evidence the Army can analyze.

**Break-even intuition:** because the dominant cost today is *senior-leader labor*, even a modest per-report time saving, multiplied across a formation's annual report volume, pays back the platform's operating cost quickly. A pilot should instrument actual before/after authoring time and HRC-return rates to produce a customer-specific ROI.

## 5. Market and buyers

**Primary market:** U.S. Army formations and the HR/personnel enterprise responsible for evaluations.

**Buying centers / champions:**
- **Command teams** (commanders, CSMs) — want reclaimed leader time and readiness.
- **G-1/S-1 (personnel)** — want fewer HRC returns and cleaner compliance.
- **HRC / evaluations policy** — want consistency, auditability, and integrity.
- **Talent management initiatives** — want structured performance data.

**Adjacent / expansion markets:**
- **Other services** (Navy/Air Force/Marines/Space Force/Coast Guard) — different forms, same underlying problem of periodic, regulated, high-stakes evaluations. The core engine (evidence capture → AI-assisted, human-owned drafting → compliance gating → audited export) generalizes.
- **National Guard & Reserve** components.
- **Federal civilian performance appraisals** and other large, rubric-based, compliance-heavy evaluation systems.

## 6. Competitive positioning

| Alternative | What it is | Where EES 2.0 wins |
|-------------|-----------|--------------------|
| **Status quo (Word docs, memory, S1 spreadsheets, current systems)** | Manual drafting + separate compliance tracking | Continuous evidence capture + AI drafting + built-in compliance in one flow |
| **Generic AI writing tools (paste a prompt, get text)** | Unconstrained LLM output | Anti-autopilot: evidence-in, mandatory human review, permanent provenance, doctrine-grounded — defensible and integrity-preserving |
| **Point HR/eval software** | Digitizes the form | Adds the *upstream* performance-capture loop, proof artifacts, and AI assistance — not just a nicer form |

**Defensible differentiators:**
- The **anti-autopilot design** (evidence-in, human-owned, fully provenanced) is exactly the property a risk-averse, integrity-focused institution requires — and the property naive AI tools lack.
- **Proof artifacts + AI captioning** create verifiable, review-ready evidence, not just claims.
- **Regulation-as-code** (AR 623-3 / DA PAM 623-3 gates + RAG grounding) is a deep, domain-specific moat that generic tools won't replicate casually.

## 7. Adoption model

1. **Pilot** with a single battalion/brigade: instrument baseline authoring time and HRC-return rates, then measure the delta.
2. **Prove** reclaimed leader-hours and reduced returns with that unit's own numbers.
3. **Expand** across the division; integrate with authoritative systems of record (e.g., iPERMS, IPPS-A) as authorized.
4. **Institutionalize** as the standard evidence-capture + drafting layer.

Because value shows up as *reclaimed leader time* and *fewer returns* — both locally measurable — adoption can be justified unit-by-unit without waiting for enterprise-wide mandate.

## 8. Risks and mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| **AI trust / "robot wrote my evaluation" perception** | High | The entire design answers this: evidence-in, mandatory human review, permanent and fully reviewable provenance (down to the exact source entries and evidence behind every AI-touched bullet), soldiers never see AI bullets. Lead every briefing with the anti-autopilot guarantee. |
| **Security / ATO for DoD environments** | High | Standard, hardened stack; RLS + role gating + full audit, with rating-chain authorization consistently enforced across the API (an internal audit closed several gaps in July 2026 — see [06](./06-roadmap-and-status.md) §2a). Designed for deployment into an accredited environment. See [05](./05-security-and-compliance.md). Plan for the ATO timeline explicitly. |
| **Integration with systems of record (iPERMS/IPPS-A)** | Medium | Interim soldier self-attestation flag makes discrepancies visible today; formal integration is a roadmap item pursued as authorized. |
| **Regulation changes (AR 623-3 updates)** | Medium | Regulation is chunked/searchable (RAG) and gates are centralized in code — updates are localized, not scattered. |
| **Change management / behavior shift** | Medium | The continuous-capture habit is the crux; low-friction mobile entry + command-visible compliance analytics drive adoption. |
| **AI cost at scale** | Low–Medium | Caption-once-reuse architecture and bounded generation keep per-report AI cost small and predictable. |
| **Data ownership / privacy** | Medium | Clear data-governance posture; standard Postgres underneath for portability; audit trail for accountability. |

## 9. Why now

- **AI capability crossed the threshold** — vision models can reliably read handwritten support forms and captions; instruction-following is strong enough to keep AI in a *constrained, reviewable* role.
- **Talent management is a stated Army priority** — structured performance data and fairer boards are actively sought.
- **The pain is unchanged and universal** — the deadline-scramble evaluation cycle has persisted for decades; the tooling to fix it upstream only recently became feasible.

## 10. The bottom line

EES 2.0 attacks a **universal, annual, high-stakes, expensive** process at its root cause — retroactive, unverified, blank-page authoring — and replaces it with **continuous, proof-backed, AI-assisted, human-owned, compliance-gated** evaluation. The dominant cost today is senior-leader time; the dominant return is giving that time back while simultaneously improving fairness, compliance, and institutional memory. The differentiator that makes it adoptable in a risk-averse institution is precisely its restraint: **the AI never gets the last word — the leader does, on the record.**

---

**Next:** [05 — Security & Compliance](./05-security-and-compliance.md).
