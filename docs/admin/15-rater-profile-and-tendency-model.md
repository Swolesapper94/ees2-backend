# 15 - Rater Profile & Rater Tendency Model

> Demo-build specification for adding the missing rater-side comparative instruments named in AR 623-3 section 3-11. Section 12 records the demo-scope sign-off decisions from 2026-07-18; production feed integration, PDF baseline extraction, and CAC binding remain out of scope.

---

## 1. Purpose

EES 2.0 currently models the `SeniorRaterProfile` comparative axis. AR 623-3 section 3-11 names three rating-history instruments, leaving two rater-side instruments unmodeled today:

| Instrument | AR 623-3 source | Applies to | Capped? | Modeled today |
| --- | --- | --- | --- | --- |
| Rater Profile | section 3-11a | OER, DA 67-10-1 and 67-10-2 | Yes: `EXCELS` must be less than 50 percent, by grade | No |
| Rater Tendency | section 3-11b | NCOER, DA 2166-9-2 and 2166-9-3 | No: tracked and disclosed only | No |
| Senior Rater Profile | section 3-11c | OER and NCOER | Yes: MQ less than 50 percent for OER, <= 24 percent for NCOER | Yes |

This feature is a **decision-support layer**, not an enforcement layer. It surfaces the comparison the regulation already requires, states the regulation's own language, records exactly what was shown, and leaves the rating official responsible for the decision.

Hard non-goals:

- No merit score, index, or numeric ranking of a soldier.
- No cross-soldier stack ranking.
- No hard gate on the rater box check.
- No enforcement of an "upper third" interpretation.
- No export, aggregation, command visibility, analytics surface, or cross-rater comparison of a rater's distribution.

---

## 2. Regulatory Lookup Tables

Encode these constants as data. Do not scatter regulatory literals through route or UI code.

### 2.1 Rater Profile - OER

| Rule | Value | Citation |
| --- | --- | --- |
| Population tracked | Officers 2LT-LTC; warrant officers WO1-CW5 | AR 623-3 section 3-11a |
| Population excluded | Officers COL and above | AR 623-3 section 3-11a |
| Population excluded | Retired officers recalled to active duty | AR 623-3 section 3-11a, sections 3-2g and 3-33 |
| Separated by | Grade | AR 623-3 section 3-11a(5) |
| Top box | `EXCELS` | DA 67-10-1 Part IV block b; DA 67-10-2 Part IV block e |
| Box vocabulary | `EXCELS`, `PROFICIENT`, `CAPABLE`, `UNSATISFACTORY` | AR 623-3 section 3-7c |
| Cap | `EXCELS` strictly less than 50 percent of rendered OERs, per grade | AR 623-3 section 3-11a(5) |
| Applies on plates | Company grade and field grade OERs | AR 623-3 section 3-11a(5) |
| Misfire consequence | HQDA applies a `PROFICIENT` label; the `EXCELS` still counts against the profile | AR 623-3 section 3-11a(5), section 3-12a(1)(c) |
| Processing order | HQDA processes daily in order of receipt, regardless of THRU date | AR 623-3 section 3-11a(1)(b) |
| Portability | Follows the rater job to job, military or civilian status | AR 623-3 section 3-11a(1)(d) |
| AMHRR | First-page summary authorized for the rater's AMHRR | AR 623-3 section 3-11a(1)(f) |
| Visibility | Rater or rater's designated representative | AR 623-3 section 3-11a |
| Initial credit | Three `PROFICIENT` box checks credited to a rater first establishing a profile | DA PAM 623-3 tables 2-4 and 2-10 |

### 2.2 Rater Tendency - NCOER

| Rule | Value | Citation |
| --- | --- | --- |
| Applies to forms | DA 2166-9-2 and DA 2166-9-3 only | AR 623-3 section 3-11b |
| Population tracked | NCOs SSG-CSM, all components | AR 623-3 section 3-11b |
| Population excluded | NCOs SGT and below; no tendency is maintained | AR 623-3 section 3-11b |
| Population excluded | Retired NCOs recalled to active duty | AR 623-3 section 3-11b |
| Box vocabulary | `FAR_EXCEEDED`, `EXCEEDED`, `MET`, `DID_NOT_MEET` | AR 623-3 section 3-7d |
| Cap | None | AR 623-3 section 3-11b |
| Purpose | Disclosure: "a means of disciplining the rating system" | AR 623-3 section 3-11b(1)(c) |
| Board exposure | Completed NCOERs display the rater's tendency history | AR 623-3 section 3-11b(1)(c) |
| Processing order | HQDA processes daily in order of receipt, regardless of THRU date | AR 623-3 section 3-11b(1)(b) |
| Visibility | Rater and senior rater | AR 623-3 section 3-11b |

The visibility asymmetry is regulatory, not a product preference: rater profile is rater/designated-representative visible; rater tendency is visible to the rater and senior rater.

### 2.3 Derived Profiling Grade

Promotable soldiers with a `P` designator who are serving in an authorized position of the next higher rank profile against the next higher rank. This is derived from AR 623-3 sections 3-7c(2) and 3-8, plus DA PAM 623-3 table 2-10. Use an explicit next-grade table, never arithmetic.

### 2.4 Restart Rules

Model restarts as attested state only. Do not implement a restart request workflow.

| Instrument | Prerequisites | Authority | Citation |
| --- | --- | --- | --- |
| Rater Profile | Six OERs processed at HQDA in that grade, written authorization from the first two-star GO commander or equivalent, and a documented misfire in that grade | HRC Evaluation Policy Branch, AHRC-PDV-E | AR 623-3 section 3-12a(1) |
| Rater Tendency | Six NCOERs processed at HQDA in that grade and written authorization from the first general officer commander or equivalent | HRC Evaluation Policy Branch, AHRC-PDV-E | AR 623-3 section 3-12b(1) |
| Both | Effective first date of a given month; bucketed by rater signature date, not THRU date | HRC | AR 623-3 sections 3-12a(3), 3-12b(3) |
| Rater Profile | Previously applied profile credits are not carried into an approved restart | HRC | AR 623-3 section 3-12a(2) |

### 2.5 LOCK Mechanic - OER Only

| Rule | Value | Citation |
| --- | --- | --- |
| Rater applies a CAC initial through `LOCK`, verifying their profile supports the selected assessment | Required EES mechanic | DA PAM 623-3 tables 2-4 and 2-10 |
| `LOCK` cannot be applied earlier than 14 days before THRU date | T-14 window | DA PAM 623-3 tables 2-4 and 2-10 |
| Once locked, the assessment cannot be changed or altered | Immutable | DA PAM 623-3 table 2-10 |
| Change to locked assessment before submission requires a memorandum from the rater's senior rater to HRC | Out of band | DA PAM 623-3 table 2-10 |

CAC binding is out of scope pending accreditation. If LOCK is built for the demo, display this honestly as "CAC binding pending accreditation."

---

## 3. Authority Boundary

EES 2.0 is not HQDA. The authoritative profile and tendency are computed at HRC from processed reports, in order of receipt, and are retrievable by the rater at `evaluations.hrc.army.mil` with a CAC. EES 2.0 has no authoritative feed and must never imply otherwise.

Implementation consequences:

1. EES computes a **projection**, never an official profile.
2. Every displayed number is labeled "Projected" and carries baseline provenance plus as-of date.
3. A projection without an attested baseline is incomplete and must not display a percentage.
4. EES-local data can show counts, but not a percentage, when `baselineSource == NONE`.
5. EES cannot know HQDA order of receipt. Multiple rendered-but-unprocessed top-box reports must surface an order-of-receipt advisory.

This boundary is a demo asset: it shows institutional humility and frames the Phase 2 ask precisely. With an authoritative feed, the same model can become definitive; without one, it remains explicitly projected.

---

## 4. Domain Model

Additive Prisma models and enums:

```prisma
enum RatingInstrumentKind {
  RATER_PROFILE
  RATER_TENDENCY
}

enum InstrumentBaselineSource {
  NONE
  RATER_ATTESTED
  AUTHORITATIVE_FEED
}

enum InstrumentEntryStatus {
  PENDING_LOCAL
  EXPORTED
  ATTESTED_PROCESSED
}

model RatingInstrument {
  id                  String                    @id @default(cuid())
  ratingOfficialId    String
  ratingOfficial      User                      @relation("RatingInstrumentOwner", fields: [ratingOfficialId], references: [id])
  kind                RatingInstrumentKind
  profilingGrade      String

  baselineSource      InstrumentBaselineSource  @default(NONE)
  baselineAsOf        DateTime?
  baselineCounts      Json?
  baselineAttestedAt  DateTime?
  baselineAttestedBy  String?

  restartAttestedFrom DateTime?

  createdAt           DateTime                  @default(now())
  updatedAt           DateTime                  @updatedAt

  entries             RatingInstrumentEntry[]

  @@unique([ratingOfficialId, kind, profilingGrade])
  @@index([ratingOfficialId])
}

model RatingInstrumentEntry {
  id                  String                @id @default(cuid())
  instrumentId        String
  instrument          RatingInstrument      @relation(fields: [instrumentId], references: [id], onDelete: Cascade)

  evaluationId        String                @unique
  evaluation          Evaluation            @relation(fields: [evaluationId], references: [id])

  ratedSoldierGrade   String
  profilingGrade      String
  profilingGradeBasis String

  boxCheck            String
  raterSignedAt       DateTime?
  status              InstrumentEntryStatus @default(PENDING_LOCAL)
  hqdaLabelAttested   String?

  createdAt           DateTime              @default(now())
  updatedAt           DateTime              @updatedAt

  @@index([instrumentId, status])
}

model RatingInstrumentSnapshot {
  id                       String                    @id @default(cuid())
  evaluationId             String                    @unique
  evaluation               Evaluation                @relation(fields: [evaluationId], references: [id])

  applicable               Boolean
  inapplicableReason       String?

  kind                     RatingInstrumentKind?
  profilingGrade           String?
  profilingGradeBasis      String?

  capApplies               Boolean                   @default(false)
  capThresholdBps          Int?
  capComparator            String?

  baselineSource           InstrumentBaselineSource?
  baselineAsOf             DateTime?

  displayedCounts          Json?
  displayedTotal           Int?
  displayedTopBoxCount     Int?
  displayedPercentBps      Int?
  proposedBoxCheck         String?
  projectedMisfire         Boolean                   @default(false)
  pendingUnprocessedTopBox Int?

  regTextShown             String                    @db.Text
  displayedAt              DateTime                  @default(now())
}
```

Required relation stubs on existing models:

- `User` needs a `RatingInstrumentOwner` opposite relation.
- `Evaluation` needs `RatingInstrumentEntry` and `RatingInstrumentSnapshot` opposite relations.

### 4.1 Data Dependencies

These fields are not present in the current Prisma schema as of 2026-07-18 and must be handled deliberately before implementation:

| Field | Used for | If absent |
| --- | --- | --- |
| `isPromotable` | Profiling-grade derivation | Treat as `false`; record basis `ACTUAL` |
| `servingInAuthorizedPositionOfNextHigherGrade` | Profiling-grade derivation | Treat as `false`; record basis `ACTUAL` |
| `isRetiredRecalled` | Population exclusion | Blocker: flag to Peter; do not silently guess |

---

## 5. Computation Rules

### 5.1 Profiling Grade

```ts
function resolveProfilingGrade(soldier) {
  if (soldier.isPromotable && soldier.servingInAuthorizedPositionOfNextHigherGrade) {
    return { grade: nextGrade(soldier.grade), basis: "PROMOTABLE_NEXT_HIGHER" };
  }

  return { grade: soldier.grade, basis: "ACTUAL" };
}
```

`nextGrade` must be an explicit table. `E9` and `O6` have no next grade for these purposes and should return the actual grade/basis.

### 5.2 Instrument Applicability

Retired-recall status is a blocking dependency. If the field does not exist, do not silently include those records in a projection.

OER rules:

- `67-10-1` and `67-10-2` resolve to `RATER_PROFILE`.
- `capApplies = true`, `capThresholdBps = 5000`, `capComparator = "LT"`.
- Box vocabulary: `EXCELS`, `PROFICIENT`, `CAPABLE`, `UNSATISFACTORY`.
- `67-10-3` and profiling grade `O6` or above resolve to `NOT_APPLICABLE` with the section 3-11a citation.

NCOER rules:

- `2166-9-1` resolves to `NOT_APPLICABLE` with the section 3-11b SGT-and-below citation.
- `2166-9-2` and `2166-9-3` resolve to `RATER_TENDENCY`.
- `capApplies = false`.
- Box vocabulary: `FAR_EXCEEDED`, `EXCEEDED`, `MET`, `DID_NOT_MEET`.

### 5.3 Projection

```ts
function project(instrument, proposedBox) {
  const counts = merge(
    instrument.baselineCounts ?? {},
    countBy(instrument.entries.filter((entry) => entry.status !== "ATTESTED_PROCESSED"), (entry) => entry.boxCheck)
  );

  const total = sum(Object.values(counts));

  const percentBps = instrument.baselineSource === "NONE"
    ? null
    : instrument.capApplies
      ? Math.round((counts[instrument.topBox] / total) * 10000)
      : null;

  let misfire = false;
  if (instrument.capApplies && proposedBox === instrument.topBox && instrument.baselineSource !== "NONE") {
    const totalAfter = total + 1;
    const topAfter = (counts[instrument.topBox] ?? 0) + 1;
    misfire = topAfter * 10000 >= totalAfter * 5000;
  }

  const pendingTop = count(
    instrument.entries.filter((entry) =>
      entry.boxCheck === instrument.topBox && ["PENDING_LOCAL", "EXPORTED"].includes(entry.status)
    )
  );

  return { counts, total, percentBps, misfire, pendingTop };
}
```

Comparator precision matters. AR 623-3 section 3-11a(5) says **less than 50 percent**. Exactly 50.0 percent is a misfire. Use integer basis points and `>= 5000`, not floating-point `> 0.50`.

### 5.4 Never Cache the Projection

The live projection is derived on read. Do not cache it on the evaluation. The only persisted copy is the immutable `RatingInstrumentSnapshot` written once at box-check commit.

---

## 6. Rater-Facing Surface

### 6.1 States

| State | Condition | Display |
| --- | --- | --- |
| `NOT_APPLICABLE` | Applicability returns not applicable | Regulatory citation and one sentence; no numbers and no empty chart |
| `NO_BASELINE` | `baselineSource == NONE` | Counts of EES-rendered reports only; no percentage; CTA to attest a baseline |
| `PROJECTED` | Baseline attested | Distribution, projected percentage where applicable, as-of date, and advisory copy |

### 6.2 Required Copy - Projected Rater Profile

Every `PROJECTED` rater-profile surface must render:

- Label: "Projected - not your HQDA profile."
- Provenance line: "Baseline attested by you as of `{baselineAsOf}`; `{n}` reports rendered in EES since."
- The regulation's own words adjacent to the box check.
- Misfire advisory when applicable:

> Rendering "Excels" here projects your O3 profile to 50.0%. AR 623-3 section 3-11a(5) requires **less than** 50%. HQDA would label this report "Proficient" - and the "Excels" would still be charged against your profile.

The advisory must not block the box check. The rater can proceed.

### 6.3 Order-of-Receipt Advisory

When `pendingTop > 0`, render separately from the misfire advisory:

> You have `{pendingTop}` rendered "Excels" report(s) for this grade not yet processed at HQDA. AR 623-3 section 3-11a(1)(b): HQDA profiles in order of receipt, regardless of THRU date. Which report carries the label depends on arrival order.

### 6.4 Rater Tendency Surface

Rater tendency has no cap, no misfire advisory, and no percentage framing. Display the distribution and this copy:

> AR 623-3 section 3-11b(1)(c): your tendency history is displayed on completed NCOERs received at HQDA. Selection boards see it.

### 6.5 Anti-Gaming Constraints

- Never present the profile as a budget.
- Never use allowance, quota, capacity, or "remaining Excels" language.
- Never show the projection before the evidence and regulatory language.
- Never render an unrendered soldier into the projection.
- Never build a "what if" planner across a rater's population.

---

## 7. API Contract

All routes use the existing three-layer authorization model: RLS, role middleware, and rating-chain/domain rules. Zod validates every boundary.

### 7.1 `GET /api/rating-instruments/me`

Query:

```text
?kind=RATER_PROFILE|RATER_TENDENCY&profilingGrade=O3
```

Response shape:

```ts
type InstrumentResponse = {
  state: "NOT_APPLICABLE" | "NO_BASELINE" | "PROJECTED";
  inapplicableReason?: string;
  kind?: "RATER_PROFILE" | "RATER_TENDENCY";
  profilingGrade?: string;
  capApplies: boolean;
  capThresholdBps?: number;
  capComparator?: "LT" | "LTE";
  baseline?: { source: "RATER_ATTESTED"; asOf: string; counts: Record<string, number> };
  localCounts: Record<string, number>;
  mergedCounts?: Record<string, number>;
  total?: number;
  topBox?: string;
  topBoxCount?: number;
  percentBps?: number | null;
  pendingUnprocessedTopBox: number;
  regText: string;
};
```

Authorization: caller must be the instrument owner. No `userId` parameter exists on this route.

### 7.2 `PUT /api/rating-instruments/me/baseline`

```ts
type BaselineRequest = {
  kind: "RATER_PROFILE" | "RATER_TENDENCY";
  profilingGrade: string;
  asOf: string;
  counts: Record<string, number>;
  attestation: true;
};
```

Requirements:

- Reject future `asOf` dates.
- Reject unknown box keys for the resolved vocabulary.
- Reject negative counts.
- Baseline is replaceable, not appendable.
- Write an audit entry with actor, kind, grade, prior counts, new counts, and `asOf`.
- `baselineAttestedBy` must equal `ratingOfficialId`.

### 7.3 `POST /api/evaluations/:id/box-check`

```ts
type BoxCheckRequest = {
  section: "OVERALL_PERFORMANCE";
  boxCheck: string;
  acknowledgedProjection: boolean;
};
```

Single transaction:

1. Authorize caller as rater on the evaluation's `EvaluationRatingSnapshot`, not the legacy chain.
2. Resolve instrument applicability.
3. Compute projection server-side inside the transaction.
4. Write exactly one immutable `RatingInstrumentSnapshot` for the evaluation. A second write returns `409`.
5. Upsert `RatingInstrumentEntry`.
6. Persist the box check on the evaluation.
7. Audit actor, evaluation, box, `projectedMisfire`, `acknowledgedProjection`, and snapshot id.

The route is idempotent only on `(evaluationId, boxCheck)`. Duplicate submit returns `409` and never creates a duplicate entry. Follow the existing immutable source-snapshot and suggestion-acceptance pattern used by `AIBulletSuggestion`.

### 7.4 Projection Freshness

The client never supplies a projection. `acknowledgedProjection` is the only client claim accepted, and only as an audit fact.

---

## 8. LOCK Gate - OER Only

Build only the deterministic demo scope authorized in section 12.3.

| Element | Implement? | Notes |
| --- | --- | --- |
| T-14 window | Yes | `LOCK` unavailable until `now >= thruDate - 14 days` |
| Post-lock immutability | Yes | Box-check mutation returns `409` with regulatory citation |
| Memo path | Copy only | Display that change requires memo from rater's senior rater to HRC |
| CAC binding | No | Pending accreditation; display honestly |

`LOCK` is not applicable to NCOERs and must not render on any 2166-9 form.

---

## 9. Privacy and Visibility

| Instrument | Readable by | Citation |
| --- | --- | --- |
| `RATER_PROFILE` | Rater; rater's designated representative | AR 623-3 section 3-11a |
| `RATER_TENDENCY` | Rater and senior rater | AR 623-3 section 3-11b |

Designated representative maps to the existing Access and Assistance grant model. Add capability `VIEW_RATING_INSTRUMENT` as a read grant only. It never confers rating authority, never permits box-check commit, and expires under the existing grant TTL. Delegated reads are audited with actor, subject, grant, and capability.

Prohibited without exception:

- No command, S1, admin, or broad leadership visibility of any rater's distribution.
- No inclusion in formation analytics, dashboards, commander views, or reports.
- No CSV, PDF, API, or third-party export of a distribution.
- No cross-rater comparison surface.

Rationale: if a rater's distribution leaves the rater's own visibility boundary, EES 2.0 has invented rater-profile policy HQDA did not write.

---

## 10. Demo Mapping

### 10.1 Beat A - The 50 Percent Edge

Seed a rater with `RATER_PROFILE` at `O3`, `baselineSource = RATER_ATTESTED`, `baselineAsOf = 2026-04-01`, and `baselineCounts = { EXCELS: 1, PROFICIENT: 2 }`.

Script:

1. Rater opens the OER section builder for a CPT and reviews evidence.
2. Rater sees the regulation's verbatim language.
3. Rater selects `EXCELS`.
4. Projection fires: `2 / 4 = 50.0%`, so misfire advisory renders.
5. Rater is not blocked.
6. Show the audit entry and immutable snapshot of exactly what was displayed.

Talking point: the tool told the truth and then got out of the way.

### 10.2 Beat B - Precision by Omission

Script:

1. Rater opens the NCOER section builder for a SGT.
2. Panel renders: "Rater tendency is not maintained for NCOs in the rank of SGT and below (AR 623-3 section 3-11b). No instrument applies."
3. No chart, zeroes, or empty state render.

### 10.3 Beat C - The Authority Boundary

Show the `NO_BASELINE` state and say plainly:

> We are not HQDA. We do not have your profile. We can project from a baseline you attest, and we label every number as projected. Give us a feed and this becomes definitive - that is a Phase 2 partnership question, not something we would assume.

---

## 11. Acceptance Criteria

| # | Criterion | Verification |
| --- | --- | --- |
| AC-1 | `67-10-1` and `67-10-2` resolve to `RATER_PROFILE` with cap settings `true`, `5000`, `LT` | Unit |
| AC-2 | `67-10-3` and profiling grade `O6` or above resolve to `NOT_APPLICABLE` citing section 3-11a | Unit |
| AC-3 | `2166-9-1` resolves to `NOT_APPLICABLE` citing section 3-11b | Unit |
| AC-4 | `2166-9-2` and `2166-9-3` resolve to `RATER_TENDENCY` with `capApplies = false` | Unit |
| AC-5 | `isRetiredRecalled` soldier resolves to `NOT_APPLICABLE` citing section 3-11 | Unit |
| AC-6 | Promotable plus authorized-position soldier yields `PROMOTABLE_NEXT_HIGHER` and the next grade | Unit |
| AC-7 | Exactly 50.0 percent projects `misfire = true` for 2/4, 3/6, and 5/10 | Unit |
| AC-8 | 49.9 percent projects `misfire = false` for 4/9 | Unit |
| AC-9 | Non-top-box proposals never project a misfire | Unit |
| AC-10 | `baselineSource = NONE` returns `percentBps = null` and UI renders no percentage | Unit + visual |
| AC-11 | Misfire advisory does not block box-check commit | Integration |
| AC-12 | Box-check commit writes exactly one `RatingInstrumentSnapshot`; second attempt returns `409` | Integration |
| AC-13 | Snapshot is byte-identical to what was displayed, including `regTextShown` | Integration |
| AC-14 | Snapshot is immutable: no route or service path updates it | Code review + integration |
| AC-15 | Projection is recomputed server-side in the commit transaction; client projection is ignored | Integration tamper test |
| AC-16 | `GET /me` exposes no `userId` parameter; a rater cannot read another rater's instrument | Integration negative |
| AC-17 | Senior rater can read a subordinate rater's `RATER_TENDENCY` | Integration positive |
| AC-18 | Senior rater cannot read a subordinate rater's `RATER_PROFILE` | Integration negative |
| AC-19 | Admin, commander, and S1 roles cannot read any instrument | Integration negative |
| AC-20 | No instrument data appears in export, dashboard, or formation analytics responses | Integration negative + grep |
| AC-21 | `VIEW_RATING_INSTRUMENT` grant permits read only; box-check commit under the grant returns `403` | Integration negative |
| AC-22 | Baseline attestation is audited with prior and new values | Integration |
| AC-23 | Future baseline `asOf` is rejected | Unit |
| AC-24 | Unknown box keys in baseline counts are rejected against vocabulary | Unit |
| AC-25 | `LOCK` unavailable before THRU minus 14 days | Unit |
| AC-26 | Post-lock box-check mutation returns `409` with regulatory citation | Integration |
| AC-27 | `LOCK` is not rendered on any 2166-9 form | Visual |
| AC-28 | Demo beats 10.1 and 10.2 execute end to end on seeded fixtures | Manual, per document 12 format |

---

## 12. Sign-Off Record - Demo Build Authorized

Sign-off status: **authorized for demo-scope build** on 2026-07-18 by the user's follow-up instruction to resolve section 12 and continue autonomously. The decisions below convert the earlier open questions into implementation boundaries. Anything not listed here remains out of scope for the demo build.

| Area | Decision | Demo-build status |
| --- | --- | --- |
| Baseline attestation UX | Use seeded demo baselines only; do not build manual entry or PDF extraction yet | Authorized |
| Profile credits | Do not model credits separately; attested baselines already include them | Authorized |
| LOCK gate | Build T-14 availability, post-lock immutability, and memo-path copy; skip CAC binding | Authorized |
| Restart modeling | Store `restartAttestedFrom` as informational state only; no workflow or demo surface | Authorized |
| `isRetiredRecalled` | Add an explicit field to the rated-soldier identity model before projection code lands | Authorized and required |
| Decision-support join point | Use `RatingInstrumentSnapshot` and `POST /box-check`; later evidence-coverage work extends the snapshot | Confirmed |

### 12.1 Baseline Attestation UX

Decision: no baseline attestation UX in the demo build. Seed the Beat A baseline directly and label the state as `RATER_ATTESTED` for the scripted demo fixture. Manual entry and PDF extraction are post-demo increments.

### 12.2 Profile Credits

Decision: do not model initial profile credits separately. An attested baseline already reflects credits and restarts. For `NO_BASELINE`, the UI may include a footnote that first-establishing profile credits exist in the official HRC profile, but EES does not calculate them without an authoritative baseline.

### 12.3 LOCK Gate

Decision: build the deterministic LOCK mechanics for OER only: T-14 availability, post-lock box-check immutability, and copy explaining the senior-rater memo path to HRC. Do not build CAC binding; display "CAC binding pending accreditation."

### 12.4 Restart Modeling

Decision: model `restartAttestedFrom` as informational only. Do not build a restart request workflow, do not perform HRC restart eligibility checks, and do not surface restart controls in the demo.

### 12.5 `isRetiredRecalled`

Decision: add an explicit `isRetiredRecalled` boolean to the rated-soldier identity model before projection code lands. In the current schema, that means the `User` model unless the implementation introduces a separate soldier profile abstraction first. Default seeded personnel to `false`, add a true fixture for AC-5, and fail closed if the field is unavailable at runtime.

### 12.6 Box-Check Decision-Support Join Point

Decision: no extra work in the demo build. This spec ships the population half of the comparison. Evidence coverage and regulatory-discriminator scaffolding can extend `RatingInstrumentSnapshot` and the `POST /box-check` transaction later; they should not replace this snapshot.

---

## 13. Sequencing Risk Outside This Spec

The original draft flagged [05 - Security & Compliance](./05-security-and-compliance.md) section 7 because the "Prohibited content" row must reflect an actually wired control before this feature is demoed as regulatory-precision work.

As of this document's creation, the backend contains server-side prohibited-language and `BLOCKING_ERROR` enforcement in `src/lib/ai/prohibited-language.ts`, `src/lib/ai/consistency-check.ts`, and `src/routes/evaluations.ts`. Before building or briefing this feature, re-verify that control end to end rather than relying on stale documentation or memory.

---

## 14. Traceability

| Requirement | Source |
| --- | --- |
| Rater Profile scope, cap, misfire, portability, visibility | AR 623-3 section 3-11a |
| Rater Tendency scope, absence of cap, board disclosure, visibility | AR 623-3 section 3-11b |
| Senior Rater Profile contrast | AR 623-3 section 3-11c |
| Restart prerequisites and effective-date bucketing | AR 623-3 sections 3-12a and 3-12b |
| Box vocabularies and comparative definitions | AR 623-3 sections 3-7 and 3-8 |
| LOCK mechanic, T-14 window, post-lock immutability, memo path | DA PAM 623-3 tables 2-4 and 2-10 |
| Initial profile credits | DA PAM 623-3 tables 2-4 and 2-10 |
| Anti-appeal provision on profile gaming | DA PAM 623-3 table 2-4 |

---

**Next:** return to [06 - Roadmap & Status](./06-roadmap-and-status.md) for the signed demo-build sequence.