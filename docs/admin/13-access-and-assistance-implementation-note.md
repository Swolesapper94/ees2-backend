# 13 - Access and Assistance Implementation Note

> **Scope:** This is a focused migration/implementation companion for scoped assistance. The current API and authorization contract lives in [08 - Data Flow and API Contract](./08-data-flow-and-api-contract.md); current remediation posture lives in [10 - Regulatory Remediation Status](./10-regulatory-remediation-status.md); and the persisted model is documented in [14 - Database Schema Reference](./14-database-schema-reference.md). It intentionally does not duplicate those documents.

## Existing Implementation Retained

The legacy `Delegate` model remains mapped to the `delegates` table and its IDs remain unchanged. The existing `/api/delegates` router, dashboard `DelegatedAccessSection`, notification category, and legacy delegate audit events are retained during the migration.

Current legacy grants are global to a principal/delegate pair and use only `VIEW_ONLY` or `PUSH_ALONG`. They are not resource-, capability-, or subject-scoped and must not confer access through the new authorization path until safely migrated.

## Additive Extension

The same `Delegate` record is extended as the internal access-grant record rather than replaced. New fields add grantor, delegate, subject, scope, type, lifecycle status, review state, acceptance/revocation metadata, and explicit capability rows. The legacy pair uniqueness has been relaxed to a lookup index, allowing the same two users to hold multiple independently scoped grants. The legacy columns remain readable for compatibility.

New writes use `/api/access-grants`. Existing `/api/delegates` routes remain available as legacy adapters during the transition, but reject mutations for migrated scoped grants so revocation and capability reductions always use the audited lifecycle API. No global `DELEGATE` user role is introduced.

## Migration Treatment

A migration script retains each legacy ID and maps only clearly safe records. Ambiguous, expired, invalid, or unscopeable records become `SUSPENDED`, `requiresReview = true`, and receive no capabilities. The script writes a report and does not delete legacy data.

## Deprecation Path

The old `/delegates` route redirects to `/access-assistance`; dashboard summaries distinguish **People helping me** from **People I assist** and never mix assistance records with rating-chain work. A scoped helper can edit only their own unlocked draft entry, organize artifact classification, request a review, send a reminder, complete narrowly defined administrative fields, record an administrative response, or download a working copy when the relevant explicit capability is present. No delegated action can sign, acknowledge, rate, author narrative, confirm evidence, submit, change a rating chain, or impersonate another user.

## Lifecycle Visibility

The hourly lifecycle sweep marks accepted or pending grants expired when their effective window ends and notifies both helper and grantor. It also sends a one-time expiring-soon notice within seven days. Invitation, acceptance, decline, revocation, capability reduction, expiry, and every delegated resource action are attributable in the audit log.
