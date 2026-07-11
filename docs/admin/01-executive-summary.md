# 01 — Executive Summary

> **Read this first.** It explains *why* EES 2.0 exists before *what* it is or *how* it works.

---

## The problem, in plain terms

Every year, hundreds of thousands of U.S. Army evaluations (NCOERs for enlisted leaders, OERs for officers) determine who gets promoted, who gets the key assignment, and who stays in the force. These reports are:

- **High-stakes** — a single weak or late evaluation can end a career's upward trajectory.
- **Heavily regulated** — AR 623-3 and DA PAM 623-3 dictate timelines, counseling requirements, rating-scale rules, signature order, and prohibited content.
- **Chronically last-minute** — in practice, the "support form" (the year-long performance record that is supposed to feed the evaluation) is often filled out *retroactively, the week the evaluation is due*, from memory.

The consequences are predictable and expensive:

| Symptom | Real-world cost |
|---------|-----------------|
| Support forms written from memory at the deadline | Accomplishments forgotten; weaker, generic bullets; unfair outcomes |
| Inconsistent bullet quality across raters | Promotion boards compare unlike things; luck-of-the-rater effects |
| Manual regulation compliance (counseling dates, timelines, MQ profile limits) | Missed suspenses, HRC rejections, reprocessing, command scrutiny |
| No proof attached to claimed accomplishments | Inflation, "self-licking ice cream cone" narratives, integrity risk |
| Knowledge lost every PCS (change of station) | A soldier's documented history evaporates when leaders rotate |
| Hours of senior-leader time spent wordsmithing | The Army's most experienced people doing typing, not leading |

## Why we wanted to build this

We set out to answer a single question:

> **What if the evaluation were the easy part — because the hard part (documenting performance) had already been happening all year?**

That reframing drives every design decision in EES 2.0:

1. **Capture continuously, not retroactively.** Give soldiers a fast, low-friction way to log accomplishments *as they happen*, tagged to the six Army leadership dimensions, with **proof attached** (a certificate, an ACFT score sheet, a photo of the event).
2. **Make AI a coach, not a ghostwriter.** The Army rightly distrusts "push a button, get an evaluation." So the AI never writes the final product. It turns *documented evidence* into *draft candidates* that a human rater must review, edit, and explicitly own. Every AI touch is labeled and logged.
3. **Encode the regulation into the software.** Counseling milestones, completeness gates, signature order, senior-rater profile limits, prohibited language — the rules that today live in a leader's head (or don't) become automatic guardrails.
4. **Preserve the truth.** A complete, tamper-evident audit trail records who wrote each bullet, where the AI helped, and what evidence backed it. This protects the soldier, the rater, and the institution.

## What EES 2.0 is

A web-based evaluation platform with two tightly linked halves:

- **The Support Form (continuous)** — a living performance log. Soldiers record objectives and accomplishments against the six leadership dimensions (Character, Presence, Intellect, Leads, Develops, Achieves) and attach supporting artifacts. AI reads each artifact once and stores a factual caption for later use.
- **The Evaluation (periodic)** — the official NCOER/OER. When it's time, the rater pulls the soldier's documented accomplishments (with their proof) into the DA-form builder, generates regulation-aware draft bullets from that evidence, reviews/edits them, and routes the finished report through the real rating chain to signature and export.

Around those two halves sits the machinery that makes it trustworthy: role-based access mirroring the rating chain, automatic AR 623-3 milestone tracking, a six-type consistency check before signature, a full audit log, and generation of the actual DA-form PDFs.

## The anti-autopilot principle

This is the philosophical core, and it is worth stating loudly because it is what separates EES 2.0 from a naive "AI writes your evaluation" tool:

> **The AI assists and suggests. The rater decides and owns.**

Three gates enforce this:

1. **Evidence in, not prompts in.** Bullets are generated from the soldier's *logged, proof-backed accomplishments* (or a rater's explicit description), never from thin air.
2. **Human review is mandatory.** Every AI suggestion must be explicitly accepted, edited, or rejected. A section cannot be marked complete while suggestions sit unreviewed.
3. **Provenance is permanent.** Every bullet carries a source label (`HUMAN`, `AI_MODIFIED`, `AI_UNMODIFIED`) and every generation is stored with its inputs and outputs.

## Who benefits

| Stakeholder | What changes for them |
|-------------|-----------------------|
| **Soldiers (rated)** | Their real accomplishments — with proof — are captured all year and can't be forgotten at deadline. Fairer, evidence-based evaluations. |
| **Raters** | Hours of blank-page wordsmithing become minutes of review-and-edit. Regulation compliance is automatic. |
| **Senior Raters** | Profile-limit math (the "most qualified" cap) and succession-planning fields are guided, not error-prone. |
| **Commanders / Admins** | Real-time visibility into counseling compliance, evaluation velocity, and HRC rejection risk across the formation. |
| **The Institution** | Defensible, auditable, consistent records; less reprocessing; preserved history across rotations; fairer promotion boards. |

## The vision

EES 2.0 is not "the old form, but digital." It is a shift from **event-driven evaluation** (scramble at the deadline) to **evidence-driven evaluation** (a year of documented, verified performance that practically writes itself). Done right, it gives the Army back two things it is chronically short on: **leader time** and **institutional truth**.

---

**Next:** [02 — System Overview](./02-system-overview.md) — what the system actually does, role by role.
