# EES 2.0 — System Documentation

**Audience:** Program leadership, prospective customers, evaluators, and the engineering team.
**Purpose:** A single, organized explanation of what EES 2.0 is, why it exists, how it works, and what it means for the organizations that adopt it.

---

## What is EES 2.0?

**EES 2.0 (Evaluation Entry System 2.0)** is a modern, soldier-focused replacement for the way the U.S. Army writes, routes, and manages non-commissioned officer and officer evaluation reports (NCOERs and OERs). It pairs a continuous performance-capture workflow with an AI writing *coach* — not a ghostwriter — to produce regulation-compliant evaluations faster, with less rework, and with a complete audit trail.

It is built around one core belief: **the evaluation should be a byproduct of a year of documented performance, not a panic-driven writing exercise the week it is due.**

---

## How to read this documentation

Each document stands alone. Start with whichever matches your role, then branch out.

| # | Document | Best for | What it answers |
|---|----------|----------|-----------------|
| 01 | [Executive Summary](./01-executive-summary.md) | Everyone — read first | Why does this exist? What problem does it solve? What's the vision? |
| 02 | [System Overview](./02-system-overview.md) | Leaders, buyers, new team members | What does it actually do? Who uses it and how? |
| 03 | [Technical Architecture](./03-technical-architecture.md) | Engineers, IT/security reviewers | How is it built? What's the stack, data model, and data flow? |
| 04 | [Business Case](./04-business-case.md) | Decision-makers, budget owners | What's the ROI, market, and risk? Why fund it? |
| 05 | [Security & Compliance](./05-security-and-compliance.md) | Security, legal, compliance | Is it safe, auditable, and regulation-aligned? |
| 06 | [Roadmap & Status](./06-roadmap-and-status.md) | Sponsors, PMs | What's built, what's next, and when? |
| 07 | [Glossary](./07-glossary.md) | Everyone | What do all these Army and technical terms mean? |

---

## The one-paragraph version

The Army's evaluation process is high-stakes (it drives promotions, assignments, and retention), governed by strict regulation (AR 623-3, DA PAM 623-3), and — in practice — often produces last-minute, inconsistent, and hard-to-verify reports. EES 2.0 fixes this by (1) letting soldiers **log accomplishments continuously** with **uploaded proof** (certificates, score sheets, photos), (2) using AI to turn that documented evidence into **draft bullets** that a rater reviews, edits, and owns, (3) enforcing regulatory gates (counseling, completeness, signatures) automatically, and (4) keeping a **full audit trail** of who wrote what and where the AI helped. The result is a faster, fairer, more defensible evaluation.

---

## Three lenses on the same system

- **Technical** — A split-stack web application: a Next.js front end, an Express/TypeScript API, a PostgreSQL database (via Supabase), Anthropic Claude for AI, and server-side PDF generation of the official DA forms. See [03 — Technical Architecture](./03-technical-architecture.md).
- **Practical** — A guided workflow for four roles (soldier, rater, senior rater, admin/commander) that mirrors the real Army rating chain and the real DA-form structure, with automatic milestone and compliance tracking. See [02 — System Overview](./02-system-overview.md).
- **Business** — A force-multiplier that reclaims leader time, reduces HRC rejections and reprocessing, improves promotion-board fairness, and creates institutional memory the Army currently loses every PCS cycle. See [04 — Business Case](./04-business-case.md).

---

*Documentation maintained by the EES 2.0 team. Last substantive update: July 2026 (evidence-to-bullet lifecycle hardening: rater confirmation, immutable source snapshots, unsupported-fact detection, full bullet provenance, automatically-derived evaluation status, and consistent rating-chain authorization across the API).*
