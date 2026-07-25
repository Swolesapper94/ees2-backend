# MERIT System Documentation

**Audience:** Program leadership, prospective customers, evaluators, security reviewers, administrators, testers, and engineers.  
**Purpose:** Provide the smallest practical set of authoritative documents for understanding MERIT's intent, architecture, data, controls, delivery status, and demo/test workflows.

## Start here

**MERIT (Mission Evaluation Record & Insight Tool)** turns a rating period's documented goals, accomplishments, proof artifacts, rater observations, and counseling outcomes into reviewable, regulation-aware evaluation content. MERIT assists; the rating official owns every final decision and signed statement.

Read [01 - Product Overview](./01-product-overview.md) first. It combines the former executive summary, practical system overview, and business case.

## Documentation map

| Document | Owner / audience | Authoritative for |
| --- | --- | --- |
| [01 - Product Overview](./01-product-overview.md) | Program leadership, customers, new team members | Problem, purpose, operating model, users, value, boundaries |
| [03 - Technical Architecture](./03-technical-architecture.md) | Engineering, IT/security | Stack, components, principal data model, MERIT pipelines, real-vs-stubbed sources |
| [05 - Security and Compliance](./05-security-and-compliance.md) | Security, legal, compliance | Authentication, authorization, integrity, provenance, regulatory controls, accreditation posture |
| [06 - Roadmap and Status](./06-roadmap-and-status.md) | Sponsors, PMs, engineering | Implemented, partial, planned, dependencies, known constraints |
| [07 - Glossary](./07-glossary.md) | Everyone | Army, product, and technical terms |
| [08 - Data Flow and API Contract](./08-data-flow-and-api-contract.md) | Engineering, integration teams | Current API/lifecycle/authorization contract, including Access and Assistance migration |
| [10 - Regulatory Remediation Status](./10-regulatory-remediation-status.md) | Program leadership, administrators | Current remediation posture plus preserved pre-remediation audit evidence |
| [14 - Database Schema Reference](./14-database-schema-reference.md) | Database/admin/security engineering | Tables, fields, enums, relationships, indexes, JSON/vector boundaries |
| [15 - Rater Profile and Tendency Model](./15-rater-profile-and-tendency-model.md) | Product, engineering, policy reviewers | Signed demo specification for projected rater-side instruments |
| [16 - PM Demo Route](./16-pm-demo-route.md) | PMs, demo operators | Exact Davis -> Johnson -> Williams live narrative and rehearsal script |
| [FLOWS - Test and Acceptance Runbook](./FLOWS.md) | Testers, administrators, customer evaluators | Fixture setup, workflow execution, negative tests, acceptance checklist/results |

This folder intentionally contains no separate business-case, historical-audit, customer-acceptance, or assistance-migration files. Those subjects are folded into the product overview, remediation status, test runbook, and API contract respectively.

## Source-of-truth order

When documents conflict, use this order:

1. Current source code and `prisma/schema.prisma`
2. Reviewed schema migrations and deployed database inspection
3. [14 - Database Schema Reference](./14-database-schema-reference.md)
4. [08 - Data Flow and API Contract](./08-data-flow-and-api-contract.md)
5. [10 - Regulatory Remediation Status](./10-regulatory-remediation-status.md)
6. Product/status/demo documents

Historical fixture findings are preserved only in the appendix of document 10 and must not be presented as current authority.

## Real vs. stubbed integrations

See [03 - Technical Architecture, Data Sources](./03-technical-architecture.md#11-data-sources-real-vs-stubbed). In summary:

- Real in this environment: Supabase Postgres/Auth/Storage and configured OpenAI provider calls behind MERIT assistance
- Demo stubs: IPPS-A personnel projection and Microsoft profile photos
- Not integrated: iPERMS verification, CAC/PKI signing, HRC/HDQA external submission, ATIS, and DTMS

The product UI and program-facing documentation use **MERIT-assisted**, **MERIT-generated**, and **MERIT suggestions**. Internal contracts such as `AIBulletSuggestion`, `AI_MODIFIED`, and provider/module names remain unchanged for schema and API compatibility.

## MERIT Support chat

MERIT Support is an intentional feature. Select **MERIT Support** in the top navigation; the account/avatar menu retains a secondary **Support** entry. It provides feature guidance and regulation-aware help, with an explicit reminder to verify policy against official AR 623-3 or the unit S1. It is not a rating authority and cannot modify records.

---

*Last consolidated: 2026-07-25. Reduced from 17 to 12 files; adopted MERIT product language; merged business/system narrative, historical audit, acceptance plan, and assistance migration notes into their authoritative parents.*
