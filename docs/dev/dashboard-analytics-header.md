# EES 2.0 — Dashboard Analytics Header
## Implementation Specification

**Version:** 1.0  
**Section:** `/dashboard` — top-of-page intelligence strip  
**Applies to:** All users who are Rater, Senior Rater, or both  
**Source of truth:** delta.md §14 (milestones), FLOWS.md §3–§7, DA PAM 623-3 §3-19, §5-1

---

## 1. Overview

The Dashboard Analytics Header is a read-only intelligence section that renders **above** Zone A and Zone B on the main dashboard. Its purpose is to give rating officials a persistent, at-a-glance view of their evaluation health — without requiring them to navigate into individual evals to understand what's happening across their whole chain.

It is organized into two visual tiers:

- **Tier 1 — KPI Strip:** Five headline numbers, always visible, scannable in seconds.
- **Tier 2 — Detail Panels:** Five focused panels in a two-row grid, each expanding on one KPI.

The SR Profile Panel is **conditionally rendered** — it appears only if `currentUser.isSeniorRater === true`.

All data is scoped to the **logged-in user's own rating activity** — not unit-wide aggregates (that belongs to `/analytics`).

---

## 2. Tooltip System Design

### Philosophy

Tooltips in this dashboard exist to answer one question per metric: *"How is this number calculated, and why does it matter for my record?"* They are not UI chrome — they carry regulatory context that a user genuinely needs to act correctly.

### Placement Rules

| Rule | Rationale |
|---|---|
| Triggered by hover on a `ⓘ` icon, not on the metric value itself | Prevents accidental triggers; keeps values clean |
| `ⓘ` appears only on **panel headers** and **SR Profile labels** — never on KPI strip tiles | KPI strip is fast-scan only; tooltips belong at the detail layer |
| One tooltip per panel header | One concept per panel — prevents tooltip overload |
| SR Profile distribution rows each carry a `ⓘ` | These rows encode regulatory thresholds that users must understand to avoid misfires |
| Tooltip max-width: `320px` | Enough for 2–3 sentences without feeling like a modal |
| Position: above the trigger by default, flip to below if near top edge | Never clips against viewport |

### Tooltip Component Spec

```tsx
// components/ui/MetricTooltip.tsx

interface MetricTooltipProps {
  content: string | React.ReactNode;
  position?: 'above' | 'below';   // default: 'above'
  width?: number;                  // default: 300, max: 320
}
```

**Visual design:**
- Background: `bg-slate-900` (dark, regardless of app theme — ensures contrast)
- Text: `text-slate-100`, `text-sm`, `leading-relaxed`
- Border radius: `rounded-md`
- Padding: `px-3 py-2`
- Shadow: `shadow-lg`
- Arrow: 6px CSS triangle pointing toward the trigger
- Animation: `opacity-0 → opacity-100`, 120ms ease — no bounce, no scale
- `ⓘ` trigger icon: `text-slate-400`, `hover:text-slate-600`, `w-3.5 h-3.5`, inline after the panel title with `ml-1.5`

**Accessibility:**
- `role="tooltip"` on the tooltip container
- `aria-describedby` on the trigger pointing to tooltip `id`
- Keyboard: tooltip opens on `:focus` as well as `:hover`
- `Escape` key closes any open tooltip

---

## 3. Tier 1 — KPI Strip

### Layout

```
[ Avg HRC Processing ] [ Late Eval Rate ] [ Due in 30 Days ] [ Counseling Compliance ] [ HRC Returns ]
```

Five equal-width tiles in a CSS grid (`grid-cols-5`). Each tile:
- Background: `bg-slate-50` (or equivalent surface token `--surface-1`)
- Border radius: `rounded-lg`
- Padding: `px-4 py-3`
- No individual borders — the strip reads as a unified band

**No tooltips on KPI tiles.** The tiles are intentionally minimal — they drive the user's eye to the detail panels below, where context lives.

### Tile Specs

#### Tile 1 — Avg HRC Processing

| Property | Value |
|---|---|
| Label | `Avg HRC processing` |
| Value | Rolling 90-day average of `(acceptedAt - submittedAt)` in days |
| Unit suffix | `days` (small, muted, beside the number) |
| Delta | vs. prior 90-day window — shown as `+N days` in danger red if increasing, `−N days` in success green if decreasing |
| Data source | `evaluations` where `status = 'ACCEPTED'` and `submittedAt IS NOT NULL` |

#### Tile 2 — Late Eval Rate

| Property | Value |
|---|---|
| Label | `Late eval rate (you)` |
| Value | `(evals submitted after THRU + 90 days) / (total submitted evals)` × 100, as a percentage |
| Delta | vs. prior year — directional |
| Data source | `evaluations` where `currentUser` is rater or SR, `status IN ('SUBMITTED','ACCEPTED','RETURNED')` |
| Regulatory basis | DA PAM 623-3 §5-1a(1): submission must reach HRC no later than 90 days after THRU date |

#### Tile 3 — Due in 30 Days

| Property | Value |
|---|---|
| Label | `Due in 30 days` |
| Value | Count of soldiers whose `nextEvalDueDate` falls within 30 calendar days |
| Value color | `text-red-700` if count > 0, default if 0 |
| Sub-label | `as Rater or SR` |
| `nextEvalDueDate` logic | Most recent ACCEPTED/COMPLETE eval for that soldier with `reasonCode = '02'` (Annual) → `thruDate + 365 days`. If no prior annual eval exists, use `ratingPeriodStart + 365 days`. |

#### Tile 4 — Counseling Compliance

| Property | Value |
|---|---|
| Label | `Counseling compliance` |
| Value | `(COMPLETE milestones of types INITIAL_COUNSELING_DUE + QUARTERLY_COUNSELING_1/2/3) / (total expected milestones of those types)` × 100 |
| Delta | Count of currently OVERDUE counseling milestones shown as `N sessions overdue` in amber |
| Data source | `milestones` where `evalId` belongs to evals where `currentUser` is rater, filtered to counseling types |

#### Tile 5 — HRC Returns

| Property | Value |
|---|---|
| Label | `HRC returns (lifetime)` |
| Value | Displayed as `N/total` (e.g. `1/14`) |
| Sub-label | Calculated percentage (e.g. `7% return rate`) |
| Delta | `below unit avg` or `above unit avg` — compare against unit-wide return rate from `/analytics` aggregate |
| Data source | `evaluations` where `currentUser` is rater or SR and `status = 'RETURNED'` at least once (count distinct evals, not return events) |

---

## 4. Tier 2 — Detail Panels

### Grid Layout

```
Row 1:  [ HRC Processing Trend (wide) ]  [ Evals Due by Window ]
Row 2:  [ Chain Velocity ]  [ Counseling Compliance ]  [ HRC Return Rate ]
Row 3:  [ SR Profile Health ]  ← conditional, full width, only if isSeniorRater
```

Row 1: `grid-cols-[1.35fr_1fr]`  
Row 2: `grid-cols-3`  
Row 3: `grid-cols-1` (SR panel spans full width)

All panels: `bg-slate-50`, `rounded-lg`, `p-4`, `border border-slate-100`

---

### Panel 1 — HRC Processing Time Trend

**Panel header:** `HRC processing time trend`  
**Sub-header (right-aligned, muted):** `Submission → accepted at HRC`

**Tooltip on `ⓘ` beside panel title:**
> "This chart tracks how many days elapsed between when each evaluation was submitted to HRC and when HRC officially accepted it into the record. Data is drawn from all evaluations submitted through EES 2.0. Rising processing times may indicate backlogs at HRC — plan your submission timelines accordingly, especially before boards."

**Chart:** Chart.js line chart, 8-month rolling window
- Series 1 — NCOERs: solid blue `#2a78d6`, 2px stroke
- Series 2 — OERs: dashed amber `#eda100`, 2px stroke, `borderDash: [4,3]`
- Y-axis: 10–35 days, labeled in `Nd` format
- X-axis: month abbreviations, all labels visible (`autoSkip: false`)
- Grid: `#e1e0d9` (light), `#2c2c2a` (dark)
- No Chart.js legend — custom HTML legend above chart with colored squares
- Tooltip on hover: `index` mode, both series, format: `NCOER: 23 days`
- Canvas height: `160px`

**Data query:**
```sql
SELECT
  DATE_TRUNC('month', submitted_at) AS month,
  form_type,
  ROUND(AVG(EXTRACT(DAY FROM (accepted_at - submitted_at)))) AS avg_days
FROM evaluations
WHERE status = 'ACCEPTED'
  AND submitted_at IS NOT NULL
  AND accepted_at IS NOT NULL
  AND (rater_id = :userId OR senior_rater_id = :userId)
  AND submitted_at >= NOW() - INTERVAL '8 months'
GROUP BY 1, 2
ORDER BY 1 ASC
```

---

### Panel 2 — Evals Due by Window

**Panel header:** `Evals due by window`  
**Sub-header:** `From soldiers' last THRU date`

**Tooltip on `ⓘ` beside panel title:**
> "Each soldier's next evaluation due date is calculated from the THRU date of their most recent annual evaluation, plus 365 days. The HRC submission deadline is 90 days after that THRU date. These buckets show how many soldiers in your rating chains are approaching their annual eval window — as either Rater or SR."

**Layout:** Three stacked bucket rows, each a clickable card.

**Bucket row structure:**
```
[ icon ]  [ label ]  [ role breakdown ]  [ count ]  [ view ↗ ]
```

| Bucket | Icon | Icon bg | Count color | Label |
|---|---|---|---|---|
| 0–30 days | `ti-alert-triangle` | `bg-red-50` `text-red-700` | `text-red-700` | `Due within 30 days` |
| 31–60 days | `ti-clock` | `bg-amber-50` `text-amber-800` | `text-amber-800` | `Due in 31–60 days` |
| 61–90 days | `ti-calendar` | `bg-green-50` `text-green-700` | `text-green-700` | `Due in 61–90 days` |

Role breakdown below the label: `N as Rater · N as SR` — muted text, 11px

Each bucket is clickable → navigates to `/evaluations?dueWindow=30` (or `60`, `90`), filtered to current user's rating chains.

**Footer below buckets:**
```
ⓘ  HRC submission deadline = soldier's last THRU date + 90 days
```
This inline note is static — no tooltip needed, it IS the tooltip content.

---

### Panel 3 — Chain Velocity

**Panel header:** `Chain velocity`  
**Sub-header:** `Avg days per stage, your evals`

**Tooltip on `ⓘ` beside panel title:**
> "Chain velocity shows the average number of days an evaluation spent in each routing stage before moving forward. Long Rater stage times suggest drafting delays. Long SR stage times may indicate routing bottlenecks or insufficient informal review before formal submission. Soldier acknowledgment times above 7 days may warrant a direct conversation."

**Chart:** Chart.js horizontal bar chart
- Three bars: Rater stage, SR stage, Soldier ack
- Colors encode meaning, not sequence:
  - Rater stage: `#2a78d6` (neutral blue — your responsibility)
  - SR stage: color is **dynamic** — `#2a78d6` if ≤ 2× rater stage avg; `#e34948` (red) if > 2× rater stage avg
  - Soldier ack: `#1baf7a` (green — typically short, not actionable)
- X-axis: 0–40 days
- Bar height: `indexAxis: 'y'`, `borderRadius: 4`
- Canvas height: `140px`

**Insight callout below chart** (dynamic):

| Condition | Callout text | Color |
|---|---|---|
| SR stage > 2× rater stage | `SR stage is [N]× your rater stage — consider earlier informal review requests` | Amber bg |
| All stages within normal range (< 15 days each) | `Your chain is moving efficiently across all stages` | Green bg |
| Soldier ack > 7 days avg | `Soldier acknowledgment is averaging [N] days — a direct conversation may help` | Amber bg |

**Data query:**
```sql
-- Rater stage: DRAFT/RATER_IN_PROGRESS → PENDING_SENIOR_RATER
-- SR stage:    PENDING_SENIOR_RATER → PENDING_SOLDIER_ACK
-- Ack stage:   PENDING_SOLDIER_ACK → COMPLETE
SELECT
  ROUND(AVG(sr_routed_at - rater_started_at)) AS rater_stage_days,
  ROUND(AVG(soldier_routed_at - sr_routed_at)) AS sr_stage_days,
  ROUND(AVG(completed_at - soldier_routed_at)) AS ack_stage_days
FROM evaluation_stage_log   -- derived from evaluation_events/audit log
WHERE (rater_id = :userId OR senior_rater_id = :userId)
  AND completed_at IS NOT NULL
```

> **Note:** If `evaluation_stage_log` is not yet materialized, derive stage timestamps from the existing `EvaluationEvent` / status-change audit table by pivoting on `toStatus`.

---

### Panel 4 — Counseling Compliance

**Panel header:** `Counseling compliance`  
**Sub-header:** `Your active rated soldiers`

**Tooltip on `ⓘ` beside panel title:**
> "Counseling compliance tracks whether required counseling sessions have been completed on time for each soldier you rate. Initial counseling is required within 30 days of the rating period start. Quarterly counseling is required at ~90-day intervals (at least quarterly for RA/AGR; semiannually for USAR/ARNG). Missed counselings weaken your eval and can be cited as a deficiency by a Commander. Source: DA PAM 623-3."

**Layout:** Donut chart (left) + compliance table (right), side by side.

**Donut chart:**
- Single value: overall compliance % (inline SVG, not Chart.js — avoids canvas overhead for a simple ring)
- Ring color: `#2a78d6` for the filled arc; `#e1e0d9` for the background ring
- Center label: `N%` in 14px medium weight
- Size: `72×72px`

**Compliance table (right of donut):**

| Row | Label | Value format |
|---|---|---|
| 1 | `Initial counseling` | `5/5` in green if 100%; `3/5` in red if any missed |
| 2 | `Quarterly 1` | Same pattern |
| 3 | `Quarterly 2` | Same pattern |
| 4 | `Quarterly 3` | Same pattern |

**Tooltip on each table row label `ⓘ`:**

| Row | Tooltip text |
|---|---|
| Initial counseling | "Must occur within the first 30 days of the rating period. The rated soldier and rater initial Part II of the DA 2166-9-1A to confirm it occurred. (DA PAM 623-3)" |
| Quarterly 1 / 2 / 3 | "Required at approximately 90-day intervals for RA and AGR NCOs. USAR/ARNG NCOs require at least semiannual counseling. Documented by dated initials in Part II of the support form." |

**Footer callout** (dynamic, only if overdue milestones exist):
```
⚠  [Soldier A] and [Soldier B] are missing [milestone type] — review now ↗
```
Link navigates to `/soldiers?filter=counseling-overdue`.

---

### Panel 5 — HRC Return Rate

**Panel header:** `HRC return rate`  
**Sub-header:** `Your lifetime submission history`

**Tooltip on `ⓘ` beside panel title:**
> "A return occurs when HRC rejects a submitted evaluation and sends it back for correction. Common causes include administrative errors (incorrect dates or missing data), prohibited language in narratives, missing or out-of-sequence signatures, and rating period overlaps. Each return delays the official record and is visible in the SR timeliness report. EES 2.0 tracks your return history by cause to help you avoid repeat errors."

**Layout:** Large return count + denominator at top, comparison to unit avg, then a breakdown list by return reason.

**Header numbers:**
```
1          return out of 14 submitted
7% return rate — below unit avg of 11%
```
"Below unit avg" in green; "above unit avg" in red.

**Return reason breakdown list:**

| Reason | Count display |
|---|---|
| Administrative error | `1 return` badge (red bg) |
| Prohibited language | `0 returns` badge (green bg) |
| Missing signature | `0 returns` badge (green bg) |
| Rating period error | `0 returns` badge (green bg) |

**Tooltip on `ⓘ` beside "Prohibited language" reason row:**
> "Prohibited language includes superlatives used as gimmicks (e.g., 'the best NCO I have ever rated'), future-oriented statements, and references to race, gender, religion, or national origin. EES 2.0's language checker intercepts these before submission. (AR 623-3)"

**Tooltip on `ⓘ` beside "Rating period error" reason row:**
> "Rating period errors occur when the FROM and THRU dates overlap with a previous eval, are entered in the wrong order, or don't align with the soldier's assignment history. HRC will reject overlapping periods without exception."

**Data query:**
```sql
SELECT
  return_reason,
  COUNT(DISTINCT evaluation_id) AS return_count
FROM evaluation_returns
WHERE (rater_id = :userId OR senior_rater_id = :userId)
GROUP BY return_reason
```

---

### Panel 6 — SR Profile Health *(Conditional)*

**Render condition:** `currentUser.isSeniorRater === true`

**Panel border:** `border-blue-300` (accent border to distinguish from standard panels — SR-only content)

**Panel header:** `SR profile health`  
**Badge beside title:** `Senior Rater only` — small pill, `bg-blue-50 text-blue-700`  
**Right-aligned note:** `Only visible to you — not shared with your chain`

**Tooltip on `ⓘ` beside panel title:**
> "Your SR profile is a running record at HRC of how you have rated every NCO and officer at each grade. HRC selection boards use your profile to calibrate the weight of your ratings. A 'misfire' occurs when your MOST QUALIFIED percentage exceeds the cap for that grade — the rating is downgraded automatically at HRC and flagged on the timeliness report. You are responsible for managing your own profile. (DA PAM 623-3 §3-19)"

---

#### 6a. Layout

Two-column grid inside the panel:
- Left column (`flex-[1.4]`): Per-grade distribution chart with rank tabs
- Right column (`flex-[1]`): Lifetime summary stats + sequencing reminder

---

#### 6b. Rank Tabs

Tabs render dynamically based on grades where `currentUser` has rendered ≥1 NCOER or OER as SR.

```tsx
// Tab labels pulled from:
const grades = await db.evaluations
  .where({ senior_rater_id: userId, status: ['ACCEPTED', 'COMPLETE', 'SUBMITTED'] })
  .distinct('rated_soldier_grade')
  .orderBy('grade_sort_order')
```

Active tab: `border-blue-400 text-blue-700 font-medium`  
Inactive tab: `border-slate-200 text-slate-500`

---

#### 6c. Per-Grade Distribution

For each grade, display four horizontal bar rows:

| Row | Label | Bar color | Regulatory cap |
|---|---|---|---|
| Most qualified | `Most qualified` | `#2a78d6` | 24% for NCOs; 33% recommended / <50% hard cap for officers |
| Highly qualified | `Highly qualified` | `#1baf7a` | No cap |
| Qualified | `Qualified` | `#888780` | No cap |
| Not qualified | `Not qualified` | `#e34948` | No cap |

**Cap line:** A 1px vertical red line rendered inside the "Most qualified" bar's background track at the cap percentage position (24% for NCO grades, 33% for OER grades as the recommended ceiling). Label: `← 24% cap` or `← 33% cap` in 10px red text below the bar.

**Tooltip on `ⓘ` beside "Most qualified" row label:**

For NCO grades (NCOER):
> "For NCOERs, MOST QUALIFIED ratings must not exceed 24% of your total ratings at this grade. Exceeding the cap causes a 'Senior Rater Misfire' — the rating is automatically downgraded to HIGHLY QUALIFIED at HRC and permanently charged to your profile. (DA PAM 623-3 §3-19)"

For officer grades (OER):
> "For OERs, MOST QUALIFIED ratings must remain below 50% of your total ratings at this grade. Best practice is to limit MQ ratings to no more than one-third of all ratings to maintain a meaningful cushion. Exceeding 50% triggers a misfire and automatic downgrade. (DA PAM 623-3 §2-x)"

**Tooltip on `ⓘ` beside "Highly qualified" row label (NCO only):**
> "HIGHLY QUALIFIED is the second tier. An NCOER with a MOST QUALIFIED box check that causes a misfire will be relabeled HIGHLY QUALIFIED at HRC — but it still counts against your profile as a MOST QUALIFIED and is permanently charged as a misfire."

---

#### 6d. Status Callout (below distribution bars)

| Condition | Callout | Style |
|---|---|---|
| Current MQ% > cap | `Misfire risk: Your MQ rate for [grade] is [N]% — above the [X]% cap. The next MOST QUALIFIED rating at this grade will be downgraded at HRC.` | Amber bg, amber border |
| Current MQ% > (cap − 5%) | `Approaching cap: You have [N]pp of cushion remaining for [grade]. Limit MQ ratings at this grade until your population grows.` | Amber bg, amber border |
| Population < 3 at this grade | `New profile: Your first MOST QUALIFIED rating at [grade] will always process as MOST QUALIFIED regardless of profile, per DA PAM 623-3.` | Blue bg, blue border |
| All clear | `Profile is credible for [grade]. [N] percentage points of cushion remaining.` | Green bg, green border |

---

#### 6e. Right Column — Lifetime Summary Stats

Four stat tiles in a `2×2` grid:

| Tile | Label | Value |
|---|---|---|
| 1 | `Total rendered` | Sum of all ACCEPTED NCOERs/OERs as SR |
| 2 | `Submitted on time` | `N/total` format |
| 3 | `Profile misfires` | Count of misfire events — red if > 0 |
| 4 | `On-time rate` | Percentage |

**Sequencing reminder card** below the stat tiles:

```
Sequence reminder
NCOERs must be submitted to HRC in the order they were rendered. Improperly
sequenced evals are not eligible for appeal. Verify submission order before routing.
```

Style: `bg-slate-100 rounded-md p-3 text-xs text-slate-600`

**Tooltip on `ⓘ` beside "Sequence reminder" label:**
> "HRC processes NCOERs in receipt order and publishes your profile in that sequence. If you submit an NCOER out of order — for example, submitting an annual eval before an earlier change-of-rater eval — the profile label on the later eval will reflect an incorrect history. There is no correction process for sequencing errors. (DA PAM 623-3 §3-19c)"

**Action link below reminder card:**
```
💬 Ask about managing my [grade] profile ↗
```
`onClick`: `sendPrompt('Walk me through my SR profile for [grade] and how to avoid a misfire on the next eval')`

This link renders dynamically for whichever rank tab is currently active.

---

## 5. Data Layer Summary

### New API Endpoints Needed

| Endpoint | Method | Description |
|---|---|---|
| `/api/dashboard/analytics` | GET | Returns all KPI strip values for current user |
| `/api/dashboard/hrc-trend` | GET | Returns 8-month rolling avg by form_type |
| `/api/dashboard/due-windows` | GET | Returns counts by 30/60/90-day buckets with role breakdown |
| `/api/dashboard/chain-velocity` | GET | Returns avg days per stage for current user's evals |
| `/api/dashboard/counseling` | GET | Returns compliance counts by milestone type |
| `/api/dashboard/returns` | GET | Returns return count by reason code |
| `/api/dashboard/sr-profile` | GET | Returns distribution by grade + misfire status; SR users only |

All endpoints require auth. SR Profile endpoint returns `403` if `currentUser.isSeniorRater === false`.

### Caching Strategy

| Endpoint | Cache TTL | Rationale |
|---|---|---|
| `/api/dashboard/analytics` | 15 minutes | KPI strip — frequently viewed, infrequently changing |
| `/api/dashboard/hrc-trend` | 1 hour | Historical data, slow-changing |
| `/api/dashboard/due-windows` | 5 minutes | Due dates are time-sensitive |
| `/api/dashboard/chain-velocity` | 30 minutes | Historical averages |
| `/api/dashboard/counseling` | 5 minutes | Milestone status can change |
| `/api/dashboard/returns` | 1 hour | Historical |
| `/api/dashboard/sr-profile` | 15 minutes | Profile data is official record — don't over-cache |

Use **SWR** (already in the Next.js stack) with the above intervals. Show skeleton loaders on first load; on refresh, show stale data while revalidating (no full spinner on revisit).

---

## 6. Component Tree

```
DashboardAnalyticsHeader/
├── index.tsx                    — layout shell, fetches all endpoints in parallel
├── KpiStrip/
│   └── KpiTile.tsx              — individual tile (label, value, delta, sub)
├── HrcTrendPanel/
│   ├── index.tsx
│   └── HrcTrendChart.tsx        — Chart.js line chart wrapper
├── DueWindowsPanel/
│   └── index.tsx                — three BucketRow components
├── ChainVelocityPanel/
│   ├── index.tsx
│   └── VelocityChart.tsx        — Chart.js horizontal bar wrapper
├── CounselingPanel/
│   ├── index.tsx
│   └── ComplianceDonut.tsx      — inline SVG ring
├── HrcReturnPanel/
│   └── index.tsx
├── SrProfilePanel/              — conditional render
│   ├── index.tsx
│   ├── RankTabs.tsx
│   ├── DistributionBars.tsx
│   ├── ProfileCallout.tsx       — dynamic status callout
│   └── LifetimeStats.tsx
└── shared/
    └── MetricTooltip.tsx        — reusable tooltip component
```

---

## 7. Responsive Behavior

| Breakpoint | KPI Strip | Row 1 | Row 2 | SR Panel |
|---|---|---|---|---|
| `xl` (≥1280px) | 5 columns | 1.35fr / 1fr | 3 columns | Full width |
| `lg` (≥1024px) | 5 columns | 1.35fr / 1fr | 3 columns | Full width |
| `md` (768–1023px) | 3 + 2 wrap | Stacked | 2 + 1 wrap | Full width |
| `sm` (<768px) | 2 + 3 wrap | Stacked | Stacked (1 col) | Full width |

At `sm` breakpoint, the SR Profile panel's two-column interior also collapses to stacked (distribution bars above, lifetime stats below).

---

## 8. SR Role Detection

```typescript
// lib/auth/permissions.ts

export function isSeniorRater(user: User): boolean {
  return user.ratingChains.some(chain => chain.role === 'SENIOR_RATER' && chain.isActive);
}

// In DashboardAnalyticsHeader/index.tsx
const showSrPanel = isSeniorRater(currentUser);
```

The SR Panel must **not** render at all in the DOM if `showSrPanel === false` — not hidden with CSS. This prevents a motivated user from inspecting the DOM to infer that an SR panel exists.

---

## 9. Empty States

| Panel | Empty condition | Message |
|---|---|---|
| HRC Trend | No accepted evals yet | `"No submission data yet — trend will populate once your first eval is accepted at HRC."` |
| Due Windows | No active rating chains | `"No soldiers in your rating chains yet."` |
| Chain Velocity | Fewer than 3 completed evals | `"Need at least 3 completed evals to calculate stage averages."` |
| Counseling | No active milestones | `"No active counseling milestones."` |
| HRC Returns | No submissions yet | `"No submissions on record yet."` |
| SR Profile | No SR evals rendered | `"No senior rater evaluations on record. Your profile will populate after your first NCOER or OER is accepted at HRC."` |

All empty states use the same pattern: muted text, centered, with a `ti-inbox` Tabler icon above.

---

## 10. Notes for Implementation

1. **Stage timestamp materialization:** Chain velocity requires knowing when each eval entered and exited each status. If the existing schema does not already log status transitions with timestamps, add an `EvaluationEvent` table (`evalId`, `fromStatus`, `toStatus`, `occurredAt`, `actorId`) and backfill from existing `updatedAt` fields where possible. This table will also power the processing delay analytics page.

2. **`reasonCode` filtering for due-date calculation:** Use only `reasonCode = '02'` (Annual) evals as the anchor for next-due-date projection. Change-of-Rater and other non-annual evals should not reset the annual due date clock.

3. **SR profile data source:** Initially, derive SR profile data from evals within EES 2.0 only. Note to user in the UI: `"Profile reflects evals submitted through EES 2.0. Your full HRC profile includes evals from prior systems — log into HRC's EES to view your complete record."` This is an important caveat to surface explicitly.

4. **Misfire detection:** The cap check must happen at the moment the user selects a rating on an in-progress eval, not just in the dashboard. The dashboard is a monitoring surface; the real guard is in the SR section of the eval builder (already spec'd in the builder flow).

5. **Dark mode:** All hardcoded chart hex values must be audited for dark mode. The existing Chart.js color definitions already handle `isDark` branching — extend this pattern to any new chart added in this spec.
