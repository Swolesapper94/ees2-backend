# EES 2.0 — Master Delta
**Applies on top of:** EES2_Technical_Plan_v2.md  
**Supersedes:** EES2_Delta_V2.md + EES2_Delta_Dashboard.md (both retired)  
**Rule:** Do not re-implement anything already in V2. This document is purely additive.

---

## Table of Contents

1. Rank & Form Type Coverage (all NCOs, all OERs, Warrant Officers)
2. Eval Status States
3. Dashboard & User Journey
4. Milestone & Suspense Tracking
5. Prohibited Language + Quality Module
6. Draft Collaboration & In-System Review
7. Guided Eval Creation Wizard
8. IPPS-A Integration Stub
9. Analytics: Processing Delay Visibility
10. Digital Signature Mechanism
11. Mobile-Responsive Support Form Entry
12. Row Level Security Policies
13. Design System Upgrade
14. Complete File Inventory
15. Complete Schema Changes
16. Build Sequence

---

## Section 1 — Rank & Form Type Coverage

Every rank in the Army maps to exactly one eval form. The system needs to 
handle all of them — not just SGT and SSG.

### Full Rank → Form Mapping

| Rank(s) | Grade | Form | Eval Type | MVP Status |
|---|---|---|---|---|
| PVT, PV2, PFC, SPC, CPL | E1–E4 | None | None | No eval — show "Not Evaluated" |
| SGT | E5 | DA 2166-9-1 | NCOER | ✅ Full builder |
| SSG, SFC, MSG, 1SG | E6–E8 | DA 2166-9-2 | NCOER | ✅ Full builder |
| SGM, CSM, SMA | E9 | DA 2166-9-3 | NCOER | ✅ Full builder |
| WO1, CW2 | W1–W2 | DA 67-10-1A | OER | 🔲 Stub — dashboard only |
| CW3, CW4, CW5 | W3–W5 | DA 67-10-2A | OER | 🔲 Stub — dashboard only |
| 2LT, 1LT | O1–O2 | DA 67-10-1 | OER | 🔲 Stub — dashboard only |
| CPT | O3 | DA 67-10-2 | OER | 🔲 Stub — dashboard only |
| MAJ, LTC, COL | O4–O6 | DA 67-10-3 | OER | 🔲 Stub — dashboard only |
| BG, MG, LTG, GEN, GA | O7–O11 | DA 67-10-4 | OER | 🔲 Stub — dashboard only |

"Stub — dashboard only" means: the soldier card appears on the dashboard, 
due dates are tracked, support form is fully functional, but the eval 
builder shows a "Coming Soon" state. The HRC demo focuses on NCOERs — 
OER builder is post-MVP.

### Updated EvalFormType Enum

Replace the existing `EvalFormType` in `prisma/schema.prisma`:

```prisma
enum EvalFormType {
  // ── NCOERs — Full builder in MVP ──────────────────────────────────
  NCOER_9_1      // DA 2166-9-1 — SGT (E5)          Binary scale
  NCOER_9_2      // DA 2166-9-2 — SSG–1SG/MSG (E6–E8) 4-level scale
  NCOER_9_3      // DA 2166-9-3 — CSM/SGM/SMA (E9)  4-level scale

  // ── OERs — Dashboard + support form only for MVP ──────────────────
  OER_67_10_1    // DA 67-10-1   — 2LT, 1LT
  OER_67_10_1A   // DA 67-10-1A  — WO1, CW2
  OER_67_10_2    // DA 67-10-2   — CPT
  OER_67_10_2A   // DA 67-10-2A  — CW3, CW4, CW5
  OER_67_10_3    // DA 67-10-3   — MAJ, LTC, COL
  OER_67_10_4    // DA 67-10-4   — BG and above
}
```

### Updated resolveFormType Function

Replace in `lib/utils/role-resolver.ts`:

```typescript
export function resolveFormType(rank: Rank): {
  formType: EvalFormType
  evalType: "NCOER" | "OER"
  builderAvailable: boolean
} {
  switch (rank) {
    // ── NCOERs ────────────────────────────────────────────────────
    case "SGT":
      return { formType: "NCOER_9_1", evalType: "NCOER", builderAvailable: true }

    case "SSG":
    case "SFC":
    case "MSG":
    case "FIRST_SERGEANT":
      return { formType: "NCOER_9_2", evalType: "NCOER", builderAvailable: true }

    case "SGM":
    case "CSM":
    case "SMA":
      return { formType: "NCOER_9_3", evalType: "NCOER", builderAvailable: true }

    // ── OERs (stub) ───────────────────────────────────────────────
    case "WO1":
    case "CW2":
      return { formType: "OER_67_10_1A", evalType: "OER", builderAvailable: false }

    case "CW3":
    case "CW4":
    case "CW5":
      return { formType: "OER_67_10_2A", evalType: "OER", builderAvailable: false }

    case "SECOND_LT":
    case "FIRST_LT":
      return { formType: "OER_67_10_1", evalType: "OER", builderAvailable: false }

    case "CPT":
      return { formType: "OER_67_10_2", evalType: "OER", builderAvailable: false }

    case "MAJ":
    case "LTC":
    case "COL":
      return { formType: "OER_67_10_3", evalType: "OER", builderAvailable: false }

    case "BG":
    case "MG":
    case "LTG":
    case "GEN":
    case "GA":
      return { formType: "OER_67_10_4", evalType: "OER", builderAvailable: false }

    // ── Junior enlisted — no eval ─────────────────────────────────
    default:
      return { formType: "NCOER_9_1", evalType: "NCOER", builderAvailable: false }
  }
}
```

The `builderAvailable` flag drives whether the eval card shows 
the full builder or the "Coming Soon" stub.

---

## Section 2 — Eval Status States

Every evaluation lives in exactly one status at any time.
OVERDUE is NOT a status — it is a milestone flag displayed on top of any status.

| # | Status | What It Means | Who Can Act | Conditional? |
|---|---|---|---|---|
| 1 | `DRAFT` | Eval created. Rater hasn't started any section. | Rater | Always |
| 2 | `RATER_IN_PROGRESS` | Rater has completed ≥1 section. Still working. | Rater | Always |
| 3 | `PENDING_SENIOR_RATER` | Rater done. SR hasn't finished their section. | Senior Rater | Always |
| 4 | `PENDING_SOLDIER_ACK` | Rater + SR done. Waiting for soldier to acknowledge. | Rated Soldier | Always |
| 5 | `PENDING_SUPPLEMENTARY_REVIEW` | Soldier acknowledged. Awaiting supplementary reviewer. | Supplementary Reviewer | Only when rater is 1LT |
| 6 | `COMPLETE` | All required signatures collected. | Read-only for all | Always |
| 7 | `SUBMITTED` | Forwarded to HRC for official processing. | Read-only for all | Always |
| 8 | `ACCEPTED` | HRC has accepted into the official record. Terminal success state. | Read-only for all | Always |
| 9 | `RETURNED` | Sent back for correction (by HRC or chain). | Rater | On error |

**NOT_STARTED** is a computed state — not stored in the database.
It means an active `RatingChain` exists with no linked `Evaluation` for the
current rating period. Derived at query time. No row ever created for this.

**OVERDUE** is a milestone flag, not a status:
`RATER_IN_PROGRESS  •  OVERDUE`
Source: `EvalMilestone` table, not `EvalStatus`.

### Supplementary Review — Trigger Condition

`PENDING_SUPPLEMENTARY_REVIEW` only activates when the **rater's rank is 1LT**.
This is stored on the `Evaluation` record at creation time so it never
needs to re-evaluate the condition mid-workflow.

```prisma
model Evaluation {
  // ... existing V2 fields ...

  // Supplementary review
  requiresSupplementaryReview  Boolean  @default(false)
  // Set to true at creation when rater.rank === "FIRST_LT"
  // Drives whether PENDING_SUPPLEMENTARY_REVIEW state is entered
}
```

Logic at eval creation:

```typescript
// When creating an evaluation, check rater's rank
const rater = await prisma.user.findUnique({ where: { id: raterId } })
const requiresSupplementaryReview = rater.rank === "FIRST_LT"

await prisma.evaluation.create({
  data: {
    ...evalData,
    requiresSupplementaryReview,
  }
})
```

State transition logic after soldier acknowledges:

```typescript
// After PENDING_SOLDIER_ACK → determine next state
function nextStateAfterSoldierAck(eval: Evaluation): EvalStatus {
  return eval.requiresSupplementaryReview
    ? "PENDING_SUPPLEMENTARY_REVIEW"
    : "COMPLETE"
}
```

### Status → Dashboard Card Color

| Status | Color Token | Icon |
|---|---|---|
| NOT_STARTED (computed) | `--status-not-started` gray | ○ |
| DRAFT | `--status-draft` slate | ✏ |
| RATER_IN_PROGRESS | `--status-progress` navy | ▶ |
| PENDING_SENIOR_RATER | `--status-pending` amber | ⏳ |
| PENDING_SOLDIER_ACK | `--status-pending` amber | ✉ |
| PENDING_SUPPLEMENTARY_REVIEW | `--status-pending` amber | 👁 |
| COMPLETE | `--status-complete` OD green | ✓ |
| SUBMITTED | `--status-submitted` deep green | ✓✓ |
| ACCEPTED | `--status-accepted` deep green bold | ✓✓✓ |
| RETURNED | `--status-overdue` maroon | ✗ |

Add to design tokens in `globals.css`:
```css
--status-accepted: #1A3010;   /* darkest green — terminal success */
```

Update `EvalStatus` enum in `prisma/schema.prisma`:

```prisma
enum EvalStatus {
  DRAFT
  RATER_IN_PROGRESS
  PENDING_SENIOR_RATER
  PENDING_SOLDIER_ACK
  PENDING_SUPPLEMENTARY_REVIEW   // Conditional — rater is 1LT only
  COMPLETE
  SUBMITTED
  ACCEPTED                       // Terminal success — in official record
  RETURNED                       // Correction required
}
```

---

## Section 3 — Dashboard & User Journey

### 3.1 What the User Sees on Login

Every user — regardless of rank or role — lands on a dashboard with two zones:

**Zone A — My Evaluation:** Their own eval and support form. Always at top.  
**Zone B — My Soldiers:** Every soldier they rate or senior rate.

### 3.2 Role Determination Logic

A single user can be RATER for some soldiers and SENIOR_RATER for others 
simultaneously. The system resolves this from `RatingChain` on every load.

```typescript
// lib/utils/role-resolver.ts

export type UserChainRole = "RATER" | "SENIOR_RATER"

export async function getChainRolesForUser(userId: string) {
  const chains = await prisma.ratingChain.findMany({
    where: {
      isActive: true,
      OR: [
        { raterId: userId },
        { seniorRaterId: userId },
      ]
    },
    include: {
      ratedSoldier: true,
      rater: true,
      seniorRater: true,
      evaluations: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { milestones: true, sections: true }
      },
      supportForms: {
        where: { isActive: true },
        take: 1,
        include: { _count: { select: { entries: true } } }
      }
    }
  })

  return chains.map(chain => ({
    chain,
    soldier: chain.ratedSoldier,
    myRole: chain.raterId === userId ? "RATER" : "SENIOR_RATER" as UserChainRole,
    latestEval: chain.evaluations[0] ?? null,
    activeSupportForm: chain.supportForms[0] ?? null,
    ...resolveFormType(chain.ratedSoldier.rank),
  }))
}
```

### 3.3 Dashboard Query (Server Component)

```typescript
// app/(dashboard)/dashboard/page.tsx

export default async function DashboardPage() {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  const dbUser = await prisma.user.findUnique({
    where: { supabaseId: user.id }
  })

  // Zone B — soldiers I rate or senior rate
  const soldierChains = await getChainRolesForUser(dbUser.id)

  // Zone A — my own eval (I am the rated soldier)
  const myChain = await prisma.ratingChain.findFirst({
    where: { ratedSoldierId: dbUser.id, isActive: true },
    include: {
      rater: true,
      seniorRater: true,
      evaluations: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { milestones: true, sections: true }
      },
      supportForms: {
        where: { isActive: true },
        take: 1,
        include: { _count: { select: { entries: true } } }
      }
    }
  })

  return (
    <DashboardShell
      user={dbUser}
      myChain={myChain}
      soldierChains={soldierChains}
    />
  )
}
```

### 3.4 Zone A — My Evaluation Card

Zone A is **always visible to every user, regardless of rank.**
A CPT sees it. An E5 who rates nobody sees it. Everyone has their own eval.

Zone A has two parts: the eval card and the rating scheme.

**Part 1 — My Eval:**
```
┌─────────────────────────────────────────────────────────────────────────┐
│  MY EVALUATION                                                          │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  CPT SMITH, Peter J.               OER  •  DA 67-10-2            │   │
│  │  C Co, 1-505 PIR  •  Company Commander                           │   │
│  │                                                                   │   │
│  │  Period:  01 JUN 2024 – 31 MAY 2025                              │   │
│  │                                                                   │   │
│  │  ○ NOT STARTED                         Due: 31 MAY 2025  337d    │   │
│  │                                                                   │   │
│  │  [ Initiate My Evaluation ]    [ Support Form  0 entries → ]     │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

**Part 2 — My Rating Scheme:**
Always displayed directly below the eval card.
Shows who rates the logged-in soldier — always visible, always present.

```
┌─────────────────────────────────────────────────────────────────────────┐
│  MY RATING SCHEME                                                       │
│                                                                         │
│  Rater          MAJ THOMPSON, David R.   G3 Ops Officer, 1-505 PIR     │
│  Senior Rater   LTC HARRISON, William F. BN CDR, 1-505 PIR             │
│  Reviewer       —  (not required at this rank)                          │
│                                                                         │
│  Rating Period: 01 JUN 2024 – 31 MAY 2025                              │
└─────────────────────────────────────────────────────────────────────────┘
```

This is read-only. The soldier cannot edit their own rating scheme.
It is populated from the active `RatingChain` record.

**Behavior by eval status:**

| Eval Status | Primary CTA | Secondary CTA |
|---|---|---|
| NOT_STARTED | "Initiate My Evaluation" | "Start Support Form" |
| DRAFT / RATER_IN_PROGRESS | "Continue My Evaluation" | "View Support Form  N entries" |
| PENDING_SOLDIER_ACK | "Review & Sign Evaluation" | "View Support Form" |
| COMPLETE / SUBMITTED / ACCEPTED | "View Evaluation" | "View Support Form" |

The rated soldier can never access the rater's or SR's sections —
only their soldier comments section and acknowledgment signature.

**OER stub when builder not available:**
```
┌──────────────────────────────────────────────────────────────────┐
│  OER Builder — In Development                                     │
│  DA 67-10-2  •  CPT Smith, Peter J.                              │
│                                                                   │
│  OER support is coming. Your support form is fully functional    │
│  now — start logging accomplishments for your next OER.          │
│                                                                   │
│  [ View Support Form  0 entries → ]                              │
└──────────────────────────────────────────────────────────────────┘
```

### 3.5 Zone B — My Soldiers

**Zone B only renders if the user has active rating chains where they are
the rater or senior rater. Soldiers who rate nobody see only Zone A.
Their dashboard is clean — no empty zone, no placeholder.**

Default sort: **Due date ascending — closest due date at top.**
This is hardcoded as the default. No configuration needed.
A rater always sees their most urgent eval first.

Filter bar:
```
MY SOLDIERS (8)
[ All ]  [ As Rater (5) ]  [ As Senior Rater (3) ]    Sort: Due Date ↑
```

Soldier card anatomy:
```
┌──────────────────────────────────────────────────┐
│  RATER                                   NCOER   │  ← Role + eval type
│                                                  │
│  SGT SMITH, James R.                             │  ← Rank + name
│  11B  •  Rifleman, B Co 2-504 PIR                │  ← MOS + duty title
│                                                  │
│  Due  31 MAY 2025              28 days           │  ← Due date + countdown
│  ▶  RATER IN PROGRESS                            │  ← Status with icon
│                                                  │
│  ████████████░░░░  65% complete                  │  ← Section progress
│                                                  │
│  [ Open Evaluation ]                             │
└──────────────────────────────────────────────────┘
```

Card states:

| Status | Icon | CTA for Rater | CTA for SR |
|---|---|---|---|
| NOT_STARTED | ○ | "Start Evaluation" | "Start Evaluation" |
| DRAFT | ✏ | "Continue Draft" | "Awaiting Rater" (disabled) |
| RATER_IN_PROGRESS | ▶ | "Continue Evaluation" | "Awaiting Rater" (disabled) |
| PENDING_SENIOR_RATER | ⏳ | "Awaiting SR" (read-only) | "Complete SR Section" |
| PENDING_SOLDIER_ACK | ✉ | "Awaiting Soldier Sig" | "Awaiting Soldier Sig" |
| COMPLETE | ✓ | "View Evaluation" | "View Evaluation" |
| SUBMITTED | ✓✓ | "View Submitted" | "View Submitted" |

OVERDUE overlay on card:
```
┌─ ✗ OVERDUE — Initial Counseling 14 days past due ──────────────┐
│  SGT SMITH, James R.  ...                                       │
```

### 3.6 Self-Initiation Flow (My Eval)

"Initiate My Evaluation" opens `EvalCreationWizard.tsx` pre-filled:

```typescript
{
  ratedSoldierId: currentUser.id,        // Auto-filled — locked
  ratingChainId:  myChain.id,            // Auto-filled — locked
  formType:       resolveFormType(rank), // Auto-determined — read-only display
  // User fills in:
  periodStart, periodEnd, reasonForSubmission
}
```

Step 1 (Select Soldier) is skipped — they are the soldier.  
Step 2 shows form type as read-only.  
Step 3 (period + reason) is the first active input.  
Step 4 links existing support form or offers to create one.

### 3.7 Support Form — Independent of Eval

A soldier can start logging accomplishments before any eval is initiated.  
The support form is always available regardless of eval status.

"Start Support Form" creates a `SupportForm` record linked to their active 
`RatingChain` with today as `ratingPeriodStart`.

After entries exist, the support form CTA shows:
```
[ View Support Form  34 entries → ]
```

Entry count is a small motivator — keeps soldiers logging continuously.

### 3.10 Clean Dashboard — Rated-Only Soldier (E5 Example)

When a soldier rates nobody, Zone B does not render.
The dashboard is intentionally minimal — their world is their own eval.

```
┌────────────────────────────────────────────────────────────────────────┐
│ ████  EES 2.0        SGT Davis, James R.  •  B Co 1-505 PIR  •  28 JUN│
│ ────────────────────────────────────────────────────────────────────── │
│  ⊞  Dashboard                                                          │
│  ☆  My Eval         MY EVALUATION                                      │
│  ≡  All Evals       ┌────────────────────────────────────────────────┐ │
│  ⚙  Admin           │  SGT DAVIS, James R.        NCOER  DA 2166-9-1 │ │
│                     │  Team Leader  •  B Co, 1-505 PIR               │ │
│                     │  Period  01 JUN 2024 – 31 MAY 2025             │ │
│                     │  ○ NOT STARTED                  Due in 337 days│ │
│                     │  [ Initiate My Evaluation ]  [ Support Form → ]│ │
│                     └────────────────────────────────────────────────┘ │
│                                                                        │
│                     MY RATING SCHEME                                   │
│                     ┌────────────────────────────────────────────────┐ │
│                     │  Rater        SSG JOHNSON, M.  Squad Leader    │ │
│                     │  Senior Rater SFC WILLIAMS, R.  Platoon SGT    │ │
│                     │  Reviewer     —  (not required)                │ │
│                     │  Period  01 JUN 2024 – 31 MAY 2025             │ │
│                     └────────────────────────────────────────────────┘ │
│                                                                        │
│                     [No soldiers to rate — Zone B not shown]           │
└────────────────────────────────────────────────────────────────────────┘
```

Key differences from the CPT dashboard:
- Sidebar has no "My Soldiers" item (nothing to show)
- Zone B is absent — no empty section, no "you have no soldiers" placeholder
- Rating Scheme shows who rates this soldier — always visible

### 3.11 Sidebar Navigation by Role

The sidebar adapts based on whether the user rates anyone:

**Rater / Senior Rater (has soldiers):**
```
• Dashboard
• My Eval
• My Soldiers       ← Only shown if user is rater or SR on any active chain
─────────────
• All Evaluations
• Analytics
• Admin
```

**Rated-only soldier (rates nobody):**
```
• Dashboard
• My Eval
─────────────
• Admin
```

The "My Soldiers" nav item is conditionally rendered server-side.
No item, no click, no confusion.

### 3.9 Visual Reference — Full Dashboard

```
┌────────────────────────────────────────────────────────────────────────────┐
│ ████  EES 2.0        Welcome, CPT Smith  •  C Co 1-505 PIR  •  28 JUN 26  │
│ ──────────────────────────────────────────────────────────────────────────  │
│  ⊞  Dashboard                                                              │
│  ☆  My Eval         MY EVALUATION                                          │
│  ◫  My Soldiers     ┌────────────────────────────────────────────────────┐  │
│  ≡  All Evals       │ CPT SMITH, Peter J.              OER  DA 67-10-2   │  │
│  ▣  Analytics       │ Company Commander  •  C Co 1-505 PIR               │  │
│  ⚙  Admin           │ Period  01 JUN 2024 – 31 MAY 2025                  │  │
│                     │ Rater  MAJ Thompson  /  SR  LTC Harrison            │  │
│                     │ ○ NOT STARTED                      Due in 337 days  │  │
│                     │ [ Initiate Evaluation ]  [ Start Support Form ]     │  │
│                     └────────────────────────────────────────────────────┘  │
│                                                                             │
│                     MY SOLDIERS (8)                                        │
│                     [ All ] [ Rater (5) ] [ SR (3) ]    Sort: Due Date ▾  │
│                                                                             │
│  ┌────────────────────┐  ┌────────────────────┐  ┌────────────────────┐   │
│  │ RATER       NCOER  │  │ RATER       NCOER  │  │ SR          NCOER  │   │
│  │                    │  │ ✗ OVERDUE          │  │                    │   │
│  │ SGT SMITH, J.R.    │  │ SSG TAYLOR, R.     │  │ SFC DAVIS, K.      │   │
│  │ 11B • Rifleman     │  │ 11B • Squad Leader │  │ 11B • PSG          │   │
│  │ Due 31 MAY  28d    │  │ Due 01 MAR OVERDUE │  │ Due 30 JUN  365d   │   │
│  │ ▶ IN PROGRESS      │  │ ○ NOT STARTED      │  │ ✓ COMPLETE         │   │
│  │ ████████░░  65%    │  │                    │  │ ██████████  100%   │   │
│  │ [ Open Eval ]      │  │ [ Start Eval ]     │  │ [ View Eval ]      │   │
│  └────────────────────┘  └────────────────────┘  └────────────────────┘   │
│                                                                             │
│  ┌────────────────────┐  ┌────────────────────┐                            │
│  │ RATER        OER   │  │ RATER        OER   │                            │
│  │ 1LT JONES, M.      │  │ 2LT DAVIS, K.      │                            │
│  │ IN • PLT Leader    │  │ IN • PLT Leader    │                            │
│  │ Due 15 DEC  169d   │  │ Due 31 MAY  337d   │                            │
│  │ ✏ DRAFT            │  │ ○ NOT STARTED      │                            │
│  │ OER: in dev        │  │ OER: in dev        │                            │
│  │ [ Support Form → ] │  │ [ Support Form → ] │                            │
│  └────────────────────┘  └────────────────────┘                            │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## Section 4 — Milestone & Suspense Tracking

### New Prisma Models

```prisma
enum MilestoneType {
  INITIAL_COUNSELING_DUE     // AR 623-3: within 30 days of period start
  QUARTERLY_COUNSELING_1     // ~90 days
  QUARTERLY_COUNSELING_2     // ~180 days
  QUARTERLY_COUNSELING_3     // ~270 days
  RATER_SECTION_DUE          // Default: 14 days before period end
  SENIOR_RATER_DUE           // Default: 7 days before period end
  SOLDIER_ACK_DUE            // Default: 3 days before period end
  EVAL_SUBMISSION_DUE        // Hard deadline: period end date
}

enum MilestoneStatus {
  UPCOMING
  DUE_SOON    // Within 7 days
  OVERDUE     // Past due, not complete
  COMPLETE
  WAIVED      // Admin override with reason
}

model EvalMilestone {
  id              String          @id @default(cuid())
  evaluationId    String
  evaluation      Evaluation      @relation(fields: [evaluationId], references: [id])
  type            MilestoneType
  status          MilestoneStatus @default(UPCOMING)
  dueDate         DateTime
  completedAt     DateTime?
  waivedAt        DateTime?
  waivedById      String?
  waivedReason    String?
  notifiedAt      DateTime?
  escalatedAt     DateTime?
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt

  @@unique([evaluationId, type])
  @@map("eval_milestones")
}
```

Add `milestones EvalMilestone[]` to the `Evaluation` model in V2 schema.

### Auto-Generate on Eval Create

```typescript
// lib/milestones/generate.ts
import { addDays } from "date-fns"

export function generateMilestones(
  evaluationId: string,
  periodStart: Date,
  periodEnd: Date
) {
  return [
    { evaluationId, type: "INITIAL_COUNSELING_DUE",  dueDate: addDays(periodStart, 30)  },
    { evaluationId, type: "QUARTERLY_COUNSELING_1",   dueDate: addDays(periodStart, 90)  },
    { evaluationId, type: "QUARTERLY_COUNSELING_2",   dueDate: addDays(periodStart, 180) },
    { evaluationId, type: "QUARTERLY_COUNSELING_3",   dueDate: addDays(periodStart, 270) },
    { evaluationId, type: "RATER_SECTION_DUE",        dueDate: addDays(periodEnd, -14)   },
    { evaluationId, type: "SENIOR_RATER_DUE",         dueDate: addDays(periodEnd, -7)    },
    { evaluationId, type: "SOLDIER_ACK_DUE",          dueDate: addDays(periodEnd, -3)    },
    { evaluationId, type: "EVAL_SUBMISSION_DUE",      dueDate: periodEnd                 },
  ]
}
```

Call `generateMilestones` inside the eval creation API route immediately 
after the `Evaluation` row is created.

### Suspense Board Tab

Add a second tab to the dashboard alongside the soldier card grid:

```
SUSPENSE BOARD

Soldier           │ Init Counsel │  Q1   │  Q2    │ Rater  │  SR   │ Submit
──────────────────┼──────────────┼───────┼────────┼────────┼───────┼───────
SGT Smith, J.R.   │ ✓ Complete   │  ✓    │ ⚠ 3d   │  —     │  —    │ 28d
SSG Taylor, R.    │ ✗ Overdue    │  —    │  —     │  —     │  —    │ 45d
SFC Davis, K.     │ ✓ Complete   │  ✓    │  ✓     │  ✓     │ ✓     │ ✓
```

Colors: ✓ OD green · ⚠ amber (≤7 days) · ✗ maroon (overdue) · — gray

### New API Routes

```
api/milestones/route.ts
api/milestones/[id]/complete/route.ts
api/milestones/[id]/waive/route.ts
```

### New Components

```
components/milestones/
├── SuspenseTimeline.tsx      # Per-eval horizontal milestone timeline
├── SuspenseBadge.tsx         # UPCOMING | DUE SOON | OVERDUE | COMPLETE
├── FormationSuspenseView.tsx # Suspense board table
└── MilestoneCard.tsx         # Single milestone + action button
```

---

## Section 5 — Prohibited Language + Quality Module

Runs in three places: real-time in the editor, before staging→form move, 
and in the pre-submission consistency check.

```typescript
// lib/ai/prohibited-language.ts

export interface BulletQualityResult {
  passed: boolean
  issues: BulletIssue[]
}

export interface BulletIssue {
  type: "PROHIBITED" | "VAGUE" | "FIRST_PERSON" | "SUPERLATIVE" | "FUTURE_PROMISE" | "LENGTH"
  severity: "ERROR" | "WARNING"
  match: string
  suggestion: string
}

const PROHIBITED_PATTERNS = [
  { pattern: /\b(I|my|me|we|our|us)\b/gi,
    message: "First person is prohibited on NCOERs" },
  { pattern: /\b(race|racial|ethnic|ethnicity|religion|religious|gender|sex|sexual|disability|national origin)\b/gi,
    message: "References to protected class characteristics are prohibited" },
  { pattern: /\b\d{3}-\d{2}-\d{4}\b/,
    message: "Do not include SSN on evaluation reports" },
  { pattern: /\b(married|single|divorced|spouse|husband|wife|children|pregnant)\b/gi,
    message: "References to marital or family status are prohibited" },
  { pattern: /\b(democrat|republican|political party)\b/gi,
    message: "Political references are prohibited" },
]

const VAGUE_PATTERNS = [
  { pattern: /\b(assisted with|helped to|participated in|was involved in)\b/gi,
    message: "Vague — specify what this NCO did directly" },
  { pattern: /\b(various|numerous|many|several|some)\b/gi,
    message: "Quantify where possible" },
  { pattern: /\b(very|extremely|highly|incredibly)\b/gi,
    message: "Avoid adverb intensifiers — let the action speak" },
]

const SUPERLATIVE_PATTERNS = [
  { pattern: /\b(best|greatest|most talented|number one|#1|top performer)\b/gi,
    message: "Superlatives require comparative evidence" },
]

const FUTURE_PATTERNS = [
  { pattern: /\b(will|should be promoted|promote immediately|potential to)\b/gi,
    message: "Evals assess past performance — remove future-tense language" },
]

export function checkBulletQuality(text: string): BulletQualityResult {
  const issues: BulletIssue[] = []

  if (text.length > 200) {
    issues.push({
      type: "LENGTH", severity: "ERROR",
      match: `${text.length} chars`,
      suggestion: `Reduce by ${text.length - 200} characters`
    })
  }

  for (const { pattern, message } of PROHIBITED_PATTERNS) {
    const match = text.match(pattern)
    if (match) issues.push({ type: "PROHIBITED", severity: "ERROR", match: match[0], suggestion: message })
  }
  for (const { pattern, message } of VAGUE_PATTERNS) {
    const match = text.match(pattern)
    if (match) issues.push({ type: "VAGUE", severity: "WARNING", match: match[0], suggestion: message })
  }
  for (const { pattern, message } of SUPERLATIVE_PATTERNS) {
    const match = text.match(pattern)
    if (match) issues.push({ type: "SUPERLATIVE", severity: "WARNING", match: match[0], suggestion: message })
  }
  for (const { pattern, message } of FUTURE_PATTERNS) {
    const match = text.match(pattern)
    if (match) issues.push({ type: "FUTURE_PROMISE", severity: "ERROR", match: match[0], suggestion: message })
  }

  return { passed: !issues.some(i => i.severity === "ERROR"), issues }
}
```

Also run `checkBulletQuality` on every AI-generated bullet before 
returning results to the client. Flag issues inline in the staging panel.

Inline indicator:
```
"Led 12-Soldier squad through 3 air assault ops..."
✓ No issues                      [54 chars]  ████░░░░░░  [ Edit ] [ Add → ]

"I assisted with the unit's PT program..."
✗ First person prohibited — remove "I"
⚠ "assisted with" is vague — what did this NCO do?
                                              [ Fix ] [ Dismiss ]
```

Errors: bullet cannot move to form until resolved.  
Warnings: bullet can move, issue is surfaced.

New component: `components/ai/BulletQualityIndicator.tsx`

---

## Section 6 — Draft Collaboration & In-System Review

Before formal routing for signatures, raters and SRs can exchange 
informal feedback inside the system — no emailing Word documents.

### New Prisma Model

```prisma
enum CommentStatus {
  OPEN
  RESOLVED
  ACKNOWLEDGED
}

model EvalComment {
  id            String        @id @default(cuid())
  evaluationId  String
  evaluation    Evaluation    @relation(fields: [evaluationId], references: [id])
  sectionKey    SectionKey?   // null = general comment on the whole eval
  authorId      String
  author        User          @relation("AuthoredComments", fields: [authorId], references: [id])
  content       String
  status        CommentStatus @default(OPEN)
  resolvedById  String?
  resolvedAt    DateTime?
  parentId      String?
  parent        EvalComment?  @relation("CommentThread", fields: [parentId], references: [id])
  replies       EvalComment[] @relation("CommentThread")
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt

  @@map("eval_comments")
}
```

Add `comments EvalComment[]` to `Evaluation` model.  
Add `authoredComments EvalComment[] @relation("AuthoredComments")` to `User` model.

### Request Informal Review Flow

1. Rater clicks **"Request Review"** on any section before formal routing
2. Modal: select recipient (SR, or other chain member) + optional message
3. Recipient gets notification: *"CPT Smith would like feedback on SGT Taylor's ACHIEVES section"*
4. Recipient adds an `EvalComment` — not a signature, just feedback
5. Comment appears inline next to the section — rater resolves it and continues
6. Once resolved, rater proceeds to formal "Send for Signatures"

### New API Routes

```
api/evaluations/[id]/comments/route.ts          # GET list, POST create
api/evaluations/[id]/comments/[cid]/route.ts    # PATCH resolve, DELETE
```

### New Components

```
components/collaboration/
├── CommentThread.tsx
├── CommentBubble.tsx        # Inline indicator on section nav (unresolved count)
├── RequestReviewModal.tsx
└── ResolveCommentButton.tsx
```

---

## Section 7 — Guided Eval Creation Wizard

Replace `/evaluations/new/page.tsx` single-page form with a 5-step wizard.

### Steps

**Step 1 — Select Rated Soldier**  
Search/select from your active rating chains. Auto-displays rank, MOS, duty title.  
Shows active support form entry count.  
*Skipped if soldier is initiating their own eval.*

**Step 2 — Confirm Form Type**  
Auto-selected based on rank. Displayed read-only:  
*"Based on SGT Smith's rank (E5), this will be a DA 2166-9-1 NCOER."*  
Admin can override with reason logged in audit trail.

**Step 3 — Rating Period + Reason**  
Period start/end date pickers.  
Reason for submission (dropdown):
- Annual
- Change of Rater
- Change of Duty
- Relief for Cause
- Retirement / Separation
- Senior Rater Option
- Complete the Record

**Step 4 — Link Support Form**  
Shows active support form if one exists with entry count + counseling session count.  
Warning if no support form: *"AI assistance requires support form entries. You can add entries after starting."*

**Step 5 — Review + Launch**  
Summary card of all selections. Confirms rating chain members.  
"Create Evaluation" auto-generates all milestones on submit.

New component: `components/evaluation/EvalCreationWizard.tsx`

---

## Section 8 — IPPS-A Integration Stub

Not built for MVP. Placeholder shows the HRC PM exactly where integration 
hooks in — without pretending it's built.

```typescript
// lib/integrations/ipps-a.ts

/**
 * IPPS-A Integration Layer
 * STATUS: Stub — not implemented for MVP.
 *
 * When authorized, this will:
 * - Import authoritative personnel data (rank, MOS, unit, chain of command)
 * - Sync counseling dates to official record
 * - Pull active duty status codes
 * - Submit completed NCOERs directly to IPERMS
 *
 * Requires: IPPS-A API access, IL4 hosting, CAC/PKI auth.
 */

export async function fetchSoldierRecord(dodid: string) {
  console.warn("IPPS-A integration not yet implemented")
  return null
}

export async function submitToIPERMS(evaluationId: string) {
  console.warn("IPERMS submission not yet implemented")
  return { success: false }
}
```

UI placeholder in Admin → User Creation:

```
┌──────────────────────────────────────────────────────┐
│  Import from IPPS-A                                  │
│                                                      │
│  IPPS-A integration is configured for production     │
│  deployment only. Enter soldier data manually below. │
│                                                      │
│  [ Import from IPPS-A (Production) ]  [ Manual Entry]│
└──────────────────────────────────────────────────────┘
```

Add to `.env.example`:
```bash
# IPPS-A — production only, requires IL4 + CAC
IPPS_A_API_URL=
IPPS_A_API_KEY=
```

---

## Section 9 — Analytics: Processing Delay Visibility

Shows where evals are delayed — not individual rating data.
No analytics surface how a rater rated a specific soldier.

### New Page

```
app/(dashboard)/analytics/page.tsx
```

### Metrics (derived from existing tables — no new schema required)

```typescript
// lib/analytics/processing-delays.ts

// Average days at each stage — unit-level only
export type StageMetrics = {
  stage: string
  avgDaysToComplete: number
  overdueCount: number
  completedOnTimeCount: number
}

// Where are evals currently stuck?
export type ChainBottleneck = {
  role: "RATER" | "SENIOR_RATER" | "SOLDIER"
  evalsCurrentlyPending: number
  avgDaysPending: number
}

// Counseling compliance by unit
export type CounselingCompliance = {
  unit: string
  initialCounselingRate: number
  quarterlyCounselingRate: number
}
```

### New Components

```
components/analytics/
├── StageMetricsChart.tsx         # Bar chart: avg days per stage
├── BottleneckIndicator.tsx       # Which role is the current bottleneck
├── CounselingComplianceRing.tsx  # Donut: compliance %
└── EvalsAtRiskTable.tsx          # Evals with overdue milestones
```

Use `recharts` for all charts (already available via shadcn).

---

## Section 10 — Digital Signature Mechanism

Current V2 approach is a button click with a timestamp. Replace with 
a two-step consent mechanism that creates a legally defensible audit trail.

### Schema Addition

Add to the existing `Signature` model in `prisma/schema.prisma`:

```prisma
model Signature {
  // ... all existing V2 fields unchanged ...

  // Consent mechanism
  nameConfirmation  String?    // User types their own name to confirm
  ipAddress         String?    // Captured server-side at signing
  userAgent         String?    // Browser info

  // Future CAC/PKI (stubbed — not implemented for MVP)
  cacCertSerial     String?
  pkiTokenHash      String?
}
```

### Signing Flow (sign/page.tsx)

```
STEP 1 — Review
──────────────────────────────────────────────────────────
Full eval displayed read-only.
"Confirm" button is disabled until user scrolls to bottom.

STEP 2 — Confirm Identity
──────────────────────────────────────────────────────────
By signing below, I confirm I have reviewed this
evaluation in its entirety and understand I cannot
retract this signature without administrative action.

Type your full name to confirm:
[ _________________________ ]

Typed: "SMITH, PETER J."  ✓ matches account

[ Sign Evaluation ]    [ Decline — Add Reason ]
```

"Sign Evaluation" is disabled until:
1. Scroll-to-bottom detected on the eval preview
2. Typed name exactly matches `user.firstName + " " + user.lastName`

Both conditions logged in the `AuditLog` with IP + timestamp.

---

## Section 11 — Mobile-Responsive Support Form Entry

The support form entry screen is the one soldiers use from a phone in 
the field. It must be designed mobile-first.

### Mobile Entry Bottom Sheet

On screens below the `md` breakpoint (768px), the entry screen becomes 
a bottom sheet instead of a full-page form.

```
┌────────────────────────────────────┐
│  Log Entry                   ✕    │
├────────────────────────────────────┤
│                                    │
│  Section                           │
│  [ ACHIEVES ▾ ]                    │
│                                    │
│  Type                              │
│  [● Accomplishment  ○ Objective]   │
│                                    │
│  What happened?                    │
│  ┌──────────────────────────────┐  │
│  │                              │  │
│  └──────────────────────────────┘  │
│  🎤  Use voice input               │
│                                    │
│  [ Save Entry ]                    │
└────────────────────────────────────┘
```

### Voice Input

```typescript
// components/support-form/VoiceInput.tsx
const recognition = new (
  window.SpeechRecognition || window.webkitSpeechRecognition
)()
recognition.continuous = false
recognition.interimResults = true
recognition.lang = "en-US"
```

### Mobile UI Rules

- All touch targets: minimum 44×44px
- All form inputs: minimum `text-base` (16px) — prevents iOS zoom on focus
- Sheet adjusts when soft keyboard appears (`env(keyboard-inset-height)`)
- No horizontal scroll anywhere

### Responsive Strategy

```
Support form entry:   mobile-first  (default = mobile, md: = desktop)
All eval editor pages: desktop-first (default = desktop, responsive for tablet)
Dashboard:            responsive    (cards reflow to single column on mobile)
```

New components:
```
components/support-form/
├── MobileEntrySheet.tsx
└── VoiceInput.tsx
```

---

## Section 12 — Row Level Security Policies

```sql
-- supabase/rls-policies.sql
-- Run in Supabase SQL editor after schema is pushed.

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE eval_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_form_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE rating_chains ENABLE ROW LEVEL SECURITY;
ALTER TABLE counseling_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE eval_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE eval_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Helper functions
CREATE OR REPLACE FUNCTION current_user_id()
RETURNS TEXT AS $$
  SELECT id FROM users WHERE supabase_id = auth.uid()::text
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE supabase_id = auth.uid()::text
    AND 'ADMIN' = ANY(roles)
  )
$$ LANGUAGE sql SECURITY DEFINER;

-- Evaluations: visible to anyone in the rating chain
CREATE POLICY "eval_chain_access" ON evaluations FOR ALL USING (
  is_admin() OR
  EXISTS (
    SELECT 1 FROM rating_chains rc
    WHERE rc.id = evaluations.rating_chain_id AND (
      rc.rated_soldier_id = current_user_id() OR
      rc.rater_id         = current_user_id() OR
      rc.senior_rater_id  = current_user_id() OR
      rc.reviewer_id      = current_user_id()
    )
  )
);

-- Support forms: soldier sees own; rater/SR sees their chain's
CREATE POLICY "support_form_access" ON support_forms FOR ALL USING (
  is_admin() OR
  soldier_id = current_user_id() OR
  EXISTS (
    SELECT 1 FROM rating_chains rc
    WHERE rc.rated_soldier_id = support_forms.soldier_id AND (
      rc.rater_id        = current_user_id() OR
      rc.senior_rater_id = current_user_id()
    )
  )
);

-- Signatures: users can only update their own row
CREATE POLICY "signature_own_update" ON signatures
  FOR UPDATE USING (user_id = current_user_id());

CREATE POLICY "signature_chain_read" ON signatures FOR SELECT USING (
  is_admin() OR
  EXISTS (
    SELECT 1 FROM rating_chains rc
    JOIN evaluations e ON e.rating_chain_id = rc.id
    WHERE e.id = signatures.evaluation_id AND (
      rc.rated_soldier_id = current_user_id() OR
      rc.rater_id         = current_user_id() OR
      rc.senior_rater_id  = current_user_id() OR
      rc.reviewer_id      = current_user_id()
    )
  )
);

-- Audit log: read-only, never delete
CREATE POLICY "audit_log_read" ON audit_logs
  FOR SELECT USING (is_admin() OR actor_id = current_user_id());

CREATE POLICY "audit_log_no_delete" ON audit_logs
  AS RESTRICTIVE FOR DELETE USING (false);
```

---

## Section 13 — Design System Upgrade

### Additional Color Tokens

Add to `src/app/globals.css`:

```css
:root {
  /* Elevation */
  --shadow-card:   0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04);
  --shadow-panel:  0 4px 12px rgba(0,0,0,0.10), 0 2px 4px rgba(0,0,0,0.06);
  --shadow-modal:  0 20px 40px rgba(0,0,0,0.16), 0 8px 16px rgba(0,0,0,0.08);

  /* Status — full set */
  --status-not-started: #6B7280;   /* gray */
  --status-draft:       #4B5563;   /* slate */
  --status-progress:    #1E3A5F;   /* navy */
  --status-pending:     #B45309;   /* amber */
  --status-complete:    #4B5320;   /* OD green */
  --status-submitted:   #2D4A1E;   /* deep green */
  --status-overdue:     #7F1D1D;   /* maroon */

  /* Bullet source */
  --source-human:       #4B5320;
  --source-ai-modified: #1E3A5F;
  --source-ai-raw:      #B45309;   /* amber — needs review */
}
```

### Motion Tokens

```typescript
// lib/utils/motion.ts
export const transitions = {
  panel:   "transition-all duration-200 ease-out",
  badge:   "transition-colors duration-150",
  section: "transition-opacity duration-300",
  bullet:  "transition-all duration-200 ease-in-out",
}
// Never use duration-500+ — the tool should feel instant.
```

### Component Patterns

**Status Badge** — straight-edge, no pill shapes:
```tsx
<span className="inline-flex items-center gap-1.5 px-2 py-0.5
  text-xs font-medium tracking-wide uppercase rounded-sm border">
```

**Section Nav Active State** — left border, no background fill:
```
✓ CHARACTER     → 3px OD green left border + OD green text
▶ PRESENCE      → 3px navy left border + navy text
  INTELLECT     → no border, gray text
```

**Rating Box** — square selectors, not browser radio circles:
```tsx
className="w-4 h-4 rounded-none border-2 checked:bg-[#4B5320]"
```

**Bullet Card in Staging Panel:**
```
┌────────────────────────────────────────────────────────┐
│  "Led 12-Soldier squad through 3 air assault ops..."   │
│  ✓ No issues        54 chars   [ Edit ] [ Add to Form ]│
└────────────────────────────────────────────────────────┘
```
`rounded-sm · shadow-card · border border-[--border]`

**Soldier Header** — persistent strip on all eval pages:
```
┌──────────────────────────────────────────────────────────────────┐
│  ████  SGT SMITH, James R.    11B Infantry                       │
│  ████  C Co, 1-505 PIR        Rifleman / Asst Gunner             │
│        01 JUN 2024 – 31 MAY 2025  │  Rating Chain ∨             │
└──────────────────────────────────────────────────────────────────┘
```
Background: `#2C3E2D` · Bottom border: `1px #4B5320` · Always sticky.  
"Rating Chain ∨" expands inline to show rater/SR without leaving the page.

### Google Fonts

```tsx
// app/layout.tsx
import { Inter, JetBrains_Mono } from "next/font/google"

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" })
const mono  = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" })
```

Use `font-mono` on: bullet editors, character counters, form field previews.

---

## Section 14 — Complete File Inventory

### New Lib Files

```
lib/
├── milestones/
│   └── generate.ts
├── ai/
│   └── prohibited-language.ts
├── analytics/
│   └── processing-delays.ts
├── integrations/
│   └── ipps-a.ts
└── utils/
    ├── role-resolver.ts
    └── motion.ts
```

### New Components

```
components/
├── dashboard/
│   ├── DashboardShell.tsx
│   ├── MyEvalCard.tsx
│   ├── SoldierCard.tsx
│   ├── SoldierGrid.tsx
│   ├── StatusBadge.tsx
│   ├── RoleBadge.tsx
│   └── CountdownLabel.tsx
├── milestones/
│   ├── SuspenseTimeline.tsx
│   ├── SuspenseBadge.tsx
│   ├── FormationSuspenseView.tsx
│   └── MilestoneCard.tsx
├── collaboration/
│   ├── CommentThread.tsx
│   ├── CommentBubble.tsx
│   ├── RequestReviewModal.tsx
│   └── ResolveCommentButton.tsx
├── evaluation/
│   └── EvalCreationWizard.tsx
├── ai/
│   └── BulletQualityIndicator.tsx
├── support-form/
│   ├── MobileEntrySheet.tsx
│   └── VoiceInput.tsx
└── analytics/
    ├── StageMetricsChart.tsx
    ├── BottleneckIndicator.tsx
    ├── CounselingComplianceRing.tsx
    └── EvalsAtRiskTable.tsx
```

### New Pages

```
app/(dashboard)/
└── analytics/
    └── page.tsx
```

### New API Routes

```
api/milestones/
├── route.ts
└── [id]/
    ├── complete/route.ts
    └── waive/route.ts
api/evaluations/[id]/
└── comments/
    ├── route.ts
    └── [cid]/route.ts
```

### New Config Files

```
supabase/
└── rls-policies.sql
```

---

## Section 15 — Complete Schema Changes

### New Models (add to prisma/schema.prisma)

```
EvalMilestone       (Section 4)
EvalComment         (Section 6)
```

### Modified Enums

```
EvalFormType    → Full rank coverage, all OER form types (Section 1)

EvalStatus      → 9 states total (Section 2):
                  Added:   PENDING_SUPPLEMENTARY_REVIEW, ACCEPTED
                  Removed: PENDING_REVIEWER
                  Full list: DRAFT | RATER_IN_PROGRESS | PENDING_SENIOR_RATER |
                             PENDING_SOLDIER_ACK | PENDING_SUPPLEMENTARY_REVIEW |
                             COMPLETE | SUBMITTED | ACCEPTED | RETURNED
```

### Modified Models

```
Evaluation  → add: milestones EvalMilestone[]
              add: comments EvalComment[]
              add: requiresSupplementaryReview Boolean @default(false)
                   (set at creation when rater.rank === FIRST_LT)

Signature   → add: nameConfirmation String?
              add: ipAddress String?
              add: userAgent String?
              add: cacCertSerial String?   (stub — future CAC)
              add: pkiTokenHash String?    (stub — future CAC)

User        → add: authoredComments EvalComment[] @relation("AuthoredComments")
```

### New Files (from Section 16)

```
app/(auth)/dev-login/page.tsx
lib/auth/dev-login.ts
```

---

## Section 16 — Dev Login & CAC Simulation

In production, the user's rank, name, unit, and chain of command are pulled
from authoritative Army systems (IPPS-A) via CAC card authentication.

For MVP and demo purposes, a dev login screen simulates exactly what CAC
would provide — so you can demo any rank's experience without a real CAC card.

### How It Works

On login, the system checks `NODE_ENV`:
- **Production:** CAC → IPPS-A → user profile auto-populated
- **Development:** Dev login screen → manual rank/role selection → same result

```typescript
// lib/auth/dev-login.ts

export const DEV_PROFILES = [
  {
    label: "CPT Smith — Company Commander",
    rank: "CPT", firstName: "Peter", lastName: "Smith",
    mos: "11A", dutyTitle: "Company Commander",
    unit: "C Co, 1-505 PIR, 82nd ABN",
    roles: ["SOLDIER", "RATER", "SENIOR_RATER"],
  },
  {
    label: "SGT Davis — Team Leader",
    rank: "SGT", firstName: "James", lastName: "Davis",
    mos: "11B", dutyTitle: "Team Leader",
    unit: "B Co, 1-505 PIR, 82nd ABN",
    roles: ["SOLDIER"],
  },
  {
    label: "SSG Johnson — Squad Leader",
    rank: "SSG", firstName: "Marcus", lastName: "Johnson",
    mos: "11B", dutyTitle: "Squad Leader",
    unit: "B Co, 1-505 PIR, 82nd ABN",
    roles: ["SOLDIER", "RATER"],
  },
  {
    label: "1LT Torres — PLT Leader (triggers supplementary review)",
    rank: "FIRST_LT", firstName: "Maria", lastName: "Torres",
    mos: "11A", dutyTitle: "Platoon Leader",
    unit: "A Co, 1-505 PIR, 82nd ABN",
    roles: ["SOLDIER", "RATER"],
  },
  {
    label: "SFC Williams — Platoon Sergeant",
    rank: "SFC", firstName: "Robert", lastName: "Williams",
    mos: "11B", dutyTitle: "Platoon Sergeant",
    unit: "B Co, 1-505 PIR, 82nd ABN",
    roles: ["SOLDIER", "RATER", "SENIOR_RATER"],
  },
]
```

### Dev Login Screen UI

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│          ████  EES 2.0                                          │
│                                                                 │
│          Development Login                                      │
│          CAC authentication is configured for production.       │
│          Select a profile to simulate CAC login:               │
│                                                                 │
│          ┌───────────────────────────────────────────────┐      │
│          │ ○  CPT Smith — Company Commander              │      │
│          │    Rates LTs + NCOs  •  Has OER               │      │
│          ├───────────────────────────────────────────────┤      │
│          │ ○  SSG Johnson — Squad Leader                 │      │
│          │    Rates SGTs  •  Has NCOER (9-2)            │      │
│          ├───────────────────────────────────────────────┤      │
│          │ ○  SGT Davis — Team Leader                    │      │
│          │    Rated only  •  Has NCOER (9-1)            │      │
│          ├───────────────────────────────────────────────┤      │
│          │ ○  1LT Torres — PLT Leader                    │      │
│          │    Rater = 1LT, triggers supplementary review │      │
│          ├───────────────────────────────────────────────┤      │
│          │ ○  SFC Williams — Platoon Sergeant            │      │
│          │    Rater + SR  •  Has NCOER (9-2)            │      │
│          └───────────────────────────────────────────────┘      │
│                                                                 │
│          [ Login as Selected Profile ]                          │
│                                                                 │
│          Production: CAC login pulls from IPPS-A automatically  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Why the Profile List Matters for Demo

Each profile shows a completely different dashboard:

| Profile | Zone A | Zone B | What it demonstrates |
|---|---|---|---|
| CPT Smith | OER stub | Mix of NCOERs + OER LTs | Commander's full formation view |
| SSG Johnson | NCOER 9-2 | SGTs in his squad | Squad leader mid-chain view |
| SGT Davis | NCOER 9-1, NOT STARTED | Empty (rates nobody) | Soldier self-service view |
| 1LT Torres | OER stub | NCOs she rates | Supplementary review state trigger |
| SFC Williams | NCOER 9-2 | Junior NCOs | SR profile meter visible |

Walk an HRC PM through five distinct journeys in one session by switching
profiles — no real users, no CAC card required.

### Environment Guard

```typescript
// app/(auth)/dev-login/page.tsx
if (process.env.NODE_ENV === "production") {
  redirect("/login")  // Hard redirect to real CAC login in production
}
```

### New Files

```
app/(auth)/dev-login/
└── page.tsx             # Only renders in development — hard guarded

lib/auth/
└── dev-login.ts         # DEV_PROFILES array + session creation helpers
```

---

## Section 17 — Build Sequence

### Phase 1 — Foundation (add these)
- Dev login screen (`app/(auth)/dev-login/page.tsx`)
- `DEV_PROFILES` array in `lib/auth/dev-login.ts`
- Environment guard ensuring dev screen never renders in production
- Seed script populates all five dev profiles with realistic rating chains

### Phase 3 — NCOER Shell (add these)
- `EvalCreationWizard.tsx` — 5-step wizard replaces single-page new eval form
- `resolveFormType()` with full rank coverage including OER stubs
- Milestone auto-generation on eval creation
- Dashboard: `DashboardShell`, `MyEvalCard`, `SoldierCard`, `SoldierGrid`
- Dashboard: Suspense Board tab (`FormationSuspenseView`)
- Sidebar navigation update
- RLS policies (`supabase/rls-policies.sql`)
- Design system tokens + SoldierHeader upgrade + Google Fonts

### Phase 4 — AI Bullets (add these)
- Prohibited language module (`lib/ai/prohibited-language.ts`)
- `BulletQualityIndicator.tsx` on staging panel and form editor
- Quality check runs on AI output before returning to client

### Phase 5 — Signing & Collaboration (add these)
- `EvalComment` model + `CommentThread`, `RequestReviewModal`
- "Request Informal Review" flow
- Two-step signature consent (scroll-to-bottom + name confirmation)
- `nameConfirmation` + `ipAddress` captured on sign route

### Phase 6 — Polish & Demo Prep (add these)
- IPPS-A stub + UI placeholder in Admin
- Analytics page (processing delays, counseling compliance)
- Mobile entry sheet + voice input
- Motion tokens applied across all transitions
- Demo seed script with full formation data
- Commander's Access dashboard + RLS scope
- Delegate appointment UI + delegate session view

---

## Section 18 — Rating Scheme (Lineage Display)

The rating scheme is not a flat list of names — it is a visual lineage
showing the chain of who rates whom, in order, from the soldier up.

### Visual Design

```
MY RATING SCHEME
─────────────────────────────────────────────────────────────

  SGT SMITH, James R.              ← You
  11B  •  Team Leader, B Co 1-505 PIR
         │
         │  rated by
         ▼
  1LT JONES, Michael A.            [RATER]
  11A  •  Platoon Leader, A Co 1-505 PIR

         │
         │  senior rated by
         ▼
  CPT SMITH, Peter J.              [SENIOR RATER]
  11A  •  Company Commander, C Co 1-505 PIR

         │
         │  reviewer
         ▼
  —  Not required at this grade
```

Straight vertical line connecting each tier.
Each tier shows: rank + name, MOS, duty title, unit.
Reviewer slot always shows — either a name or "Not required."

### Component

```
components/dashboard/RatingSchemeLineage.tsx
```

This component receives the active `RatingChain` with all users included
and renders the vertical lineage. It is displayed in Zone A on the
dashboard directly below the My Evaluation card — always visible to
every user, regardless of whether they rate anyone.

### Data Shape

The `myChain` query in Section 3.3 already includes `rater`, `seniorRater`,
and `reviewer` — no additional query needed. `RatingSchemeLineage` takes
the chain record directly as a prop.

---

## Section 19 — Delegate System

A user can appoint a delegate to their profile. The delegate gets
visibility into that user's eval status and can help push the process
along — useful when the principal is deployed, TDY, or otherwise absent.

The delegate cannot sign on behalf of the principal. They have no
write access to eval content. Their role is presence and nudging only.

### Use Case

SGT Smith is deployed and can't log in to acknowledge their NCOER.
SGT Smith previously appointed SSG Williams as their delegate.
SSG Williams logs in, sees SGT Smith's eval in their delegate view,
and can see it's `PENDING_SOLDIER_ACK` — and knows to notify the chain.

### New Prisma Model

```prisma
enum DelegateAccessLevel {
  VIEW_ONLY      // Can see eval status, support form summary, rating scheme
  PUSH_ALONG     // VIEW_ONLY + can send reminder notifications to chain members
}

model Delegate {
  id               String              @id @default(cuid())
  principalId      String              // The user who appointed the delegate
  principal        User                @relation("DelegateAppointments", fields: [principalId], references: [id])
  delegateUserId   String              // The user who is the delegate
  delegateUser     User                @relation("DelegatedAccess", fields: [delegateUserId], references: [id])
  accessLevel      DelegateAccessLevel @default(VIEW_ONLY)
  effectiveDate    DateTime
  expiryDate       DateTime?           // Delegate access can be time-limited
  isActive         Boolean             @default(true)
  appointedReason  String?             // "Deployed to CENTCOM AOR 01 JUN 2025"
  createdAt        DateTime            @default(now())
  updatedAt        DateTime            @updatedAt

  @@unique([principalId, delegateUserId])
  @@map("delegates")
}
```

Add to `User` model:
```prisma
delegateAppointments  Delegate[]  @relation("DelegateAppointments")
delegatedAccess       Delegate[]  @relation("DelegatedAccess")
```

### What a Delegate Can See (VIEW_ONLY)

When a delegate logs in, their dashboard shows a new section below
Zone A and Zone B called **"Delegated Access":**

```
DELEGATED ACCESS

┌─────────────────────────────────────────────────────────────────┐
│  SGT SMITH, James R.             Delegated by Smith on 01 JUN   │
│  B Co 1-505 PIR  •  Active thru 30 NOV 2025                    │
│                                                                 │
│  NCOER  DA 2166-9-1                                             │
│  ⏳ PENDING SOLDIER ACK          Due in 3 days                  │
│                                                                 │
│  Rater:        1LT Jones — section complete                     │
│  Senior Rater: CPT Smith — section complete                     │
│  Soldier:      SGT Smith — ✗ not yet acknowledged               │
│                                                                 │
│  [ View Status ]   [ Send Reminder to Chain ]                   │
└─────────────────────────────────────────────────────────────────┘
```

"Send Reminder to Chain" is only available at `PUSH_ALONG` access level.
It sends a notification to all pending chain members: *"SGT Smith's delegate
has flagged this eval as needing attention."*

### What a Delegate Cannot Do

- Cannot view bullet content or rating boxes (eval text is private)
- Cannot sign for the principal
- Cannot edit any section
- Cannot change the rating scheme
- Cannot appoint sub-delegates

### Delegate Appointment UI

Accessible from the user's profile settings page:

```
MY DELEGATES
─────────────────────────────────────────────────────────────────

Active delegates who can see your eval status:

  SSG Williams, R.     PUSH_ALONG     Active thru 30 NOV 2025
  [ Edit ]  [ Revoke ]

[ + Appoint a Delegate ]
```

Appointment modal:
```
Appoint a Delegate

Search soldier:   [ _________________ ]
Access level:     [ VIEW_ONLY ▾ ]
Active from:      [ 01 JUN 2025 ]
Active thru:      [ 30 NOV 2025 ]  (optional)
Reason:           [ Deployed — CENTCOM AOR ]

[ Appoint ]
```

### New API Routes

```
api/delegates/route.ts              # GET list, POST appoint
api/delegates/[id]/route.ts         # PATCH update, DELETE revoke
api/delegates/[id]/remind/route.ts  # POST send chain reminder (PUSH_ALONG only)
```

### New Components

```
components/delegates/
├── DelegatedAccessSection.tsx    # Zone on dashboard showing delegated profiles
├── DelegateCard.tsx              # Single delegate profile card
├── AppointDelegateModal.tsx      # Appointment form
└── DelegateStatusView.tsx        # Read-only eval status for the delegate
```

### RLS Addition

```sql
-- Delegates can see eval status (not content) for their principal
CREATE POLICY "delegate_eval_status_read" ON evaluations FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM delegates d
    WHERE d.delegate_user_id = current_user_id()
    AND d.principal_id = (
      SELECT rc.rated_soldier_id FROM rating_chains rc
      WHERE rc.id = evaluations.rating_chain_id
    )
    AND d.is_active = true
    AND (d.expiry_date IS NULL OR d.expiry_date > NOW())
  )
);

-- Delegates can NOT see eval section content (bullets, ratings)
-- eval_sections table has no delegate policy — covered by default deny
```

---

## Section 20 — Commander's Access

A distinct access level that appears in the sidebar only when the
logged-in user is a commander. Gives full formation-wide visibility
into every eval in their command — not just the ones they personally rate.

This mirrors the distinction in IPPS-A between self-service access and
the broader access granted to commanders and HR professionals.

### Who Gets Commander's Access

Determined by a `COMMANDER` role on the `User` model, set by an admin.
Applicable to: Company Commander, Battalion Commander, Brigade Commander,
and equivalent command positions. Not automatic — explicitly granted.

Add to `UserRole` enum:
```prisma
enum UserRole {
  SOLDIER
  RATER
  SENIOR_RATER
  REVIEWER
  COMMANDER      // Grants Commander's Access sidebar + dashboard
  ADMIN
}
```

A CPT might have roles: `["SOLDIER", "RATER", "SENIOR_RATER", "COMMANDER"]`
An SSG might have: `["SOLDIER", "RATER"]`

### Sidebar Visibility

```
• Dashboard
• My Eval
• My Soldiers          ← Only if rater/SR on any chain
─────────────
  COMMANDER'S ACCESS   ← Section header — only if COMMANDER role
• Formation Overview
• Eval Status Board
• Counseling Compliance
─────────────
• All Evaluations
• Analytics
• Admin
```

The entire "Commander's Access" section is conditionally rendered.
If the user does not have the `COMMANDER` role, this section does not exist.

### Commander's Formation Overview

Shows every soldier in the commander's formation — not just their
personal rating chain. Includes soldiers rated by their subordinate leaders.

```
FORMATION OVERVIEW — C Co, 1-505 PIR
─────────────────────────────────────────────────────────────────

Total soldiers:     42       Evals complete:      31 (74%)
Overdue evals:       3       Counseling due:       7

Filter: [ All Platoons ▾ ]  [ All Statuses ▾ ]  Search: [______]

Soldier             Rank  Eval Type  Status                  Due
─────────────────── ───── ────────── ─────────────────────── ────────
SMITH, James R.     SGT   NCOER 9-1  ✗ OVERDUE — 14 days    01 MAR
TAYLOR, Robert M.   SSG   NCOER 9-2  ⏳ PENDING SR           15 MAR
JOHNSON, Marcus K.  SFC   NCOER 9-2  ▶ RATER IN PROGRESS    01 APR
DAVIS, Kyle T.      SGT   NCOER 9-1  ○ NOT STARTED          31 MAY
...
```

Sort: Overdue first, then by due date ascending.
Click any row → read-only eval status view (commander cannot edit content).

### What a Commander Can See

- Every soldier's eval status in their formation
- Counseling compliance rates by platoon
- Which evals are overdue and by how long
- Which stage is the bottleneck (rater late? SR late? Soldier late?)
- Support form entry counts per soldier (are people logging?)

### What a Commander Cannot Do

- Cannot view bullet content or rating boxes (that belongs to the rater)
- Cannot edit any eval
- Cannot override signatures
- Can send an escalation notification: *"Commander has flagged this eval
  as overdue — action required"* — logged in audit trail

### New Page

```
app/(dashboard)/commander/
├── page.tsx                   # Formation overview table
├── eval-board/page.tsx        # Kanban-style eval status board
└── counseling/page.tsx        # Counseling compliance by platoon
```

### Commander Scope Query

```typescript
// lib/commander/formation.ts

export async function getCommanderFormation(commanderId: string) {
  // Get the commander's unit
  const commander = await prisma.user.findUnique({
    where: { id: commanderId },
    include: { unit: { include: { children: true } } }
  })

  // Get all soldiers in the unit and subordinate units
  const unitIds = [
    commander.unitId,
    ...commander.unit.children.map(u => u.id)
  ]

  return prisma.user.findMany({
    where: {
      unitId: { in: unitIds },
      roles: { has: "SOLDIER" }
    },
    include: {
      ratedOnChains: {
        where: { isActive: true },
        include: {
          evaluations: {
            orderBy: { createdAt: "desc" },
            take: 1,
            include: { milestones: true }
          }
        }
      }
    },
    orderBy: [
      // Overdue first, then by due date
      { ratedOnChains: { _count: "asc" } }
    ]
  })
}
```

### RLS Addition

```sql
-- Commanders can see all evals in their unit and subordinate units
CREATE POLICY "commander_formation_read" ON evaluations FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM users u
    JOIN rating_chains rc ON rc.id = evaluations.rating_chain_id
    JOIN users soldier ON soldier.id = rc.rated_soldier_id
    JOIN units ON units.id = soldier.unit_id
    WHERE u.id = current_user_id()
    AND 'COMMANDER' = ANY(u.roles)
    AND (
      soldier.unit_id = u.unit_id OR
      units.parent_id = u.unit_id
    )
  )
);

-- Commanders cannot see eval section content (bullets, ratings)
-- No SELECT policy on eval_sections for COMMANDER role
-- Commanders see status only, never content
```

### New Components

```
components/commander/
├── FormationTable.tsx          # Full formation list with status
├── CommanderStatBar.tsx        # Total / complete / overdue counts
├── EvalStatusBoard.tsx         # Kanban board: columns by status
├── CounselingComplianceByPlatoon.tsx
└── EscalateButton.tsx          # Send overdue notification
```

---

## Section 21 — Updated Schema Summary

All models and changes across the full delta (Sections 1–20):

### New Models
```
EvalMilestone          Section 4
EvalComment            Section 6
Delegate               Section 19
```

### Modified Enums
```
EvalFormType    → Full rank/OER coverage           Section 1
EvalStatus      → 9 states incl. PENDING_SUPPLEMENTARY_REVIEW, ACCEPTED  Section 2
UserRole        → Add COMMANDER                    Section 20
```

### Modified Models
```
Evaluation   → requiresSupplementaryReview Boolean
               milestones EvalMilestone[]
               comments EvalComment[]

Signature    → nameConfirmation String?
               ipAddress String?
               userAgent String?
               cacCertSerial String?
               pkiTokenHash String?

User         → authoredComments EvalComment[]
               delegateAppointments Delegate[]
               delegatedAccess Delegate[]
```

### New Files Summary (full delta)
```
lib/
├── milestones/generate.ts
├── ai/prohibited-language.ts
├── analytics/processing-delays.ts
├── integrations/ipps-a.ts
├── auth/dev-login.ts
├── commander/formation.ts
└── utils/
    ├── role-resolver.ts
    └── motion.ts

components/
├── dashboard/
│   ├── DashboardShell.tsx
│   ├── MyEvalCard.tsx
│   ├── RatingSchemeLineage.tsx      ← Section 18
│   ├── SoldierCard.tsx
│   ├── SoldierGrid.tsx
│   ├── StatusBadge.tsx
│   ├── RoleBadge.tsx
│   └── CountdownLabel.tsx
├── milestones/
│   ├── SuspenseTimeline.tsx
│   ├── SuspenseBadge.tsx
│   ├── FormationSuspenseView.tsx
│   └── MilestoneCard.tsx
├── collaboration/
│   ├── CommentThread.tsx
│   ├── CommentBubble.tsx
│   ├── RequestReviewModal.tsx
│   └── ResolveCommentButton.tsx
├── delegates/                        ← Section 19
│   ├── DelegatedAccessSection.tsx
│   ├── DelegateCard.tsx
│   ├── AppointDelegateModal.tsx
│   └── DelegateStatusView.tsx
├── commander/                        ← Section 20
│   ├── FormationTable.tsx
│   ├── CommanderStatBar.tsx
│   ├── EvalStatusBoard.tsx
│   ├── CounselingComplianceByPlatoon.tsx
│   └── EscalateButton.tsx
├── evaluation/
│   └── EvalCreationWizard.tsx
├── ai/
│   └── BulletQualityIndicator.tsx
├── support-form/
│   ├── MobileEntrySheet.tsx
│   └── VoiceInput.tsx
└── analytics/
    ├── StageMetricsChart.tsx
    ├── BottleneckIndicator.tsx
    ├── CounselingComplianceRing.tsx
    └── EvalsAtRiskTable.tsx

app/(dashboard)/
├── analytics/page.tsx
└── commander/
    ├── page.tsx
    ├── eval-board/page.tsx
    └── counseling/page.tsx

app/(auth)/dev-login/page.tsx
supabase/rls-policies.sql
```