# EES 2.0 Permission and Assignment Audit

## Scope and Status

This document preserves the pre-remediation evidence used to correct mixed persona, support-form, and rating-chain behavior. Its inventory and permission matrix describe the development database **before the 2026-07-11 remediation**, not the currently active workflow state.

The remediation quarantined the identified 10 draft evaluations and 11 legacy support forms without deleting them, added versioned assignment/snapshot controls for new records, and restricted supplementary reviewer behavior. See [10 — Regulatory Remediation Status](./10-regulatory-remediation-status.md) for the current state and remaining activation work.

Access and Assistance is separate from rating-chain authority. A helper receives only an explicit scoped capability grant and is never added to the rater, senior-rater, reviewer, or rated-Soldier columns.

## Intended Five-Persona Seed Topology

| Rated soldier | Rater | Senior rater | Intended form type | Meaning |
| --- | --- | --- | --- | --- |
| SGT James Davis | SSG Marcus Johnson | SFC Robert Williams | NCOER 9-1 | Johnson is the rater; Davis is the rated soldier. |
| SSG Marcus Johnson | CPT Peter Smith | SFC Robert Williams | NCOER 9-2 | Smith is the rater; Johnson is the rated soldier. |
| 1LT Maria Torres | CPT Peter Smith | SFC Robert Williams | OER | Smith is the rater; Torres is the rated officer. |

The intended topology does **not** contain an SSG rating a 1LT. If the application shows that relationship, it is reading a manually created/live row outside this intended seed map or presenting an incorrectly scoped record.

## Intended Persona Readout

| Persona | Global roles | Own evaluation | Evaluations they rate | Evaluations they senior-rate |
| --- | --- | --- | --- | --- |
| CPT Peter Smith | Soldier, Rater, Senior Rater, Commander | None in the base seed | SSG Johnson, 1LT Torres | None in the base seed |
| SSG Marcus Johnson | Soldier, Rater | Own NCOER 9-2 | SGT Davis | None in the base seed |
| SGT James Davis | Soldier | Own NCOER 9-1 | None | None |
| 1LT Maria Torres | Soldier, Rater | Own OER | None in the base seed | None |
| SFC Robert Williams | Soldier, Rater, Senior Rater | None in the base seed | None in the base seed | SGT Davis, SSG Johnson, 1LT Torres |

## Base-Seed Support Form Ownership

| Support form | Owned by rated soldier | Linked rating chain | Who may review/confirm entry evidence |
| --- | --- | --- | --- |
| `dev-sf-davis` | SGT Davis | `dev-chain-davis` | SSG Johnson, SFC Williams, any assigned reviewer, or admin |

The base seed only defines `dev-sf-davis`. It deliberately does not create a support form for CPT Smith because Smith is not the rated soldier in any base-seed chain. A support form for an officer must be owned by that officer, not by the officer's rater.

## Pre-Remediation Development Database Snapshot

The active development database is not identical to `prisma/seed.ts`. Its `upsert` seed behavior does not overwrite an existing rating-chain assignment, so previous manual changes survive a later seed run.

| Live chain ID | Rated soldier | Live rater | Live senior rater | Reviewer | State |
| --- | --- | --- | --- | --- | --- |
| `dev-chain-davis` | SGT James Davis | SSG Marcus Johnson | SFC Robert Williams | None | Correct relative to intended seed. |
| `dev-chain-johnson` | SSG Marcus Johnson | CPT Peter Smith | SFC Robert Williams | None | Correct relative to intended seed. |
| `dev-chain-torres` | 1LT Maria Torres | **SSG Marcus Johnson** | SFC Robert Williams | None | **Incorrect for intended topology.** `prisma/seed.ts` specifies CPT Peter Smith; the live row instead makes Johnson the rater. |

All three rows are active and have an effective date of 2024-06-01 with no end date.

The current support-form inventory is exact: three Davis forms, three Johnson forms, and five Torres forms. Every one contains seven entries (five accomplishments and two objectives):

| Rating chain | Support forms currently present |
| --- | --- |
| `dev-chain-davis` | `dev-sf-davis`, `dev-chain-davis-fresh`, `dev-sf-davis-v2` |
| `dev-chain-johnson` | `dev-sf-johnson`, `dev-chain-johnson-fresh`, `dev-sf-johnson-v2` |
| `dev-chain-torres` | `dev-sf-torres`, `dev-chain-torres-fresh`, `dev-sf-torres-v2`, `dev-sf-torres-v3`, `dev-sf-torres-v4` |

The live database contains 10 evaluations, all in `DRAFT` status. Six were initiated against NCOER 9-1 forms (including an NCOER 9-1 on the Torres chain), two use OER 67-10-1, one uses NCOER 9-2, and the base Davis evaluation is also NCOER 9-1. Some forms are already linked to more than one evaluation (`dev-sf-davis` is linked to two draft evaluations), which is test-data drift and conflicts with the intended one-form-per-evaluation-cycle design.

The inventory is:

| Record type | Observed count |
| --- | ---:|
| Users | 5 |
| Active rating chains | 3 |
| Active support forms | 11 |
| Support-form entries | 77 |
| Evaluations | 10 |
| Evaluation milestones | 24 |
| Notifications | 28 |

The duplicate support forms and evaluations are test-created records, not part of the minimal seed. This explains why a support form or evaluation can appear to be “waiting” in a persona workflow that was not part of the intended demonstration cast.

## What the Screenshots Actually Show

1. Marcus Johnson's own evaluation is now present under **My Evaluation**. This proves the dev-token to persisted-user mapping is working.
2. The live Torres rating-chain assignment also makes Marcus the rater for 1LT Torres. That relationship comes from the database row, not a dashboard-display bug. It is contrary to the checked-in seed and should be corrected to CPT Smith before using the demo topology.
3. The “Evals due by window” panel says “No soldiers in your rating chains yet.” That text is inaccurate. The endpoint only returns chains whose computed annual due date falls inside the next 30, 60, or 90 days. A zero bucket does not mean Marcus has no rated soldier.
4. HRC processing, velocity, and return panels remain empty because all current evaluations are `DRAFT`; those panels require accepted, submitted, returned, or completed evaluations.
5. Counseling data is present because it reads active rater-chain milestones, which is why it can show a named rated soldier even while the due-window panel is empty.

## Historical Recommendations from the Pre-Remediation Audit

### 1. Decide the demonstration cast

Restore `dev-chain-torres.raterId` to CPT Smith, then use the three intended chains above. Do not add test support forms to a different person's chain while rehearsing. A support form is consumed when linked to an evaluation, so testing evaluation creation repeatedly requires a new period/form or a dedicated test chain.

### 2. Repair support-form access control

The current API permits any authenticated user to list and mutate many support-form resources. This must be scoped by `SupportForm.soldierId` and `SupportForm.ratingChainId` before the UI can reliably be trusted to show only the correct forms.

### 3. Correct panel labels

Change the due-window empty state from “No soldiers in your rating chains yet” to “No rating-chain evaluations are due in the next 90 days.” The data is not missing; it is outside the panel's time horizon.

### 4. Seed completed workflow history for analytics

To populate HRC trend, chain velocity, return-rate, and senior-rater profile panels, add dedicated historical evaluations in `COMPLETE`, `SUBMITTED`, and `ACCEPTED` states with matching signatures and timestamps. These must be separate from the active draft evaluations used for the live workflow demo.

### 5. Preserve role hierarchy in test data

The app does not currently enforce grade hierarchy when a `RatingChain` is written. It trusts the assigned IDs. Operationally, create chains only after validating that the rater/senior-rater grades are appropriate for the rated soldier. A direct database insert can otherwise create an impossible relationship even though route authorization later treats it as valid.

## Pre-Remediation Permission Matrix

| Resource/action | Soldier | Rater | Senior rater | Reviewer | Commander | Admin |
| --- | --- | --- | --- | --- | --- |
| Own support-form artifact upload/flag/delete | Own entries only | No | No | No | No | Yes |
| Support-form entry confirmation | No | Assigned chain only | Assigned chain only | Assigned chain only | No | Yes |
| Evaluation section edit | No | Assigned chain only | Assigned chain only | Assigned chain only | No | Yes |
| AI bullet generation | No | Assigned chain only | Assigned chain only | Assigned chain only | No | Yes |
| Formal signature | Own soldier signature only | Own rater signature only | Own SR signature only | Own reviewer signature only | No | Yes |
| Formation overview | No | No | No | No | Own unit only | Yes if separately implemented |
| Support-form list/read/edit routes before remediation | **Insufficiently restricted** | **Insufficiently restricted** | **Insufficiently restricted** | **Insufficiently restricted** | **Insufficiently restricted** | Yes |

## Historical Debugging Order

1. Log in as SSG Johnson and confirm **My Evaluation** is Johnson's NCOER 9-2.
2. Scroll to **My Soldiers** and confirm the only base-seed soldier is SGT Davis.
3. Log in as CPT Smith and confirm **My Soldiers** contains SSG Johnson and 1LT Torres.
4. Log in as SFC Williams and confirm **My Soldiers** contains all three rated soldiers as senior rater.
5. Do not use the due-window empty text as proof of missing chains; it is not a membership query.
6. Before changing data, compare every suspect support form's `soldierId` and `ratingChainId` against the table above.