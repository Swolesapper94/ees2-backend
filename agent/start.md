# EES 2.0 — Technical Scaffold Plan (V2)
**Purpose:** Purpose-built replacement for the Army's EES UI. Modern, clean, soldier-focused. 
MVP targets NCOERs (DA 2166-9-1 and 9-2) with AI-assisted writing, continuous support form 
capture, and parallel signing workflow. Demo target: HRC program manager.

> **V2 corrections from V1:**
> - Rating scales split by form type (binary for E5, 4-level for E6+)
> - Support form entry model corrected to match actual DA 2166-9-1A structure
> - Counseling tracking added as a regulatory requirement (AR 623-3 mandated)
> - AI guardrail mechanics fully specified (anti-autopilot design)
> - Senior rater profile meter added
> - Design system finalized with soldier-focused persistent header
> - All enums locked to actual form field values

---

## 1. Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Framework | Next.js 14 (App Router, TypeScript) | One repo: frontend + API routes |
| Database | PostgreSQL via Supabase | Managed, free tier for MVP, RLS built in |
| ORM | Prisma | Type-safe schema-as-code, clean migrations |
| Auth | Supabase Auth | Email/password for MVP — swap for CAC/PKI later |
| UI Components | shadcn/ui + Tailwind CSS | Accessible, professional, not templated |
| AI | Anthropic Claude API (`claude-sonnet-4-6`) | Core product IP |
| PDF | `@react-pdf/renderer` | React → DA-form-accurate PDF output |
| Deployment | Vercel + Supabase | Both free tier sufficient for demo |

---

## 2. Scaffolding Commands

```bash
# 1. Create project
npx create-next-app@latest ees2 \
  --typescript --tailwind --eslint --app --src-dir \
  --import-alias "@/*"
cd ees2

# 2. Core dependencies
npm install @prisma/client prisma
npm install @supabase/supabase-js @supabase/ssr
npm install @anthropic-ai/sdk
npm install @react-pdf/renderer
npm install zustand
npm install react-hook-form @hookform/resolvers zod
npm install date-fns
npm install lucide-react
npm install clsx tailwind-merge class-variance-authority

# 3. shadcn/ui
npx shadcn@latest init
# Style: Default | Base color: Slate | CSS variables: Yes

npx shadcn@latest add button card dialog form input label
npx shadcn@latest add select textarea badge progress tabs
npx shadcn@latest add table dropdown-menu sheet toast
npx shadcn@latest add separator skeleton avatar tooltip

# 4. Prisma
npx prisma init
```

---

## 3. Environment Variables

**.env.local**
```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
DATABASE_URL=postgresql://postgres:[password]@db.[project].supabase.co:5432/postgres
DIRECT_URL=postgresql://postgres:[password]@db.[project].supabase.co:5432/postgres
ANTHROPIC_API_KEY=sk-ant-...
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

**.env.example** (commit this)
```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=
DIRECT_URL=
ANTHROPIC_API_KEY=
NEXT_PUBLIC_APP_URL=
```

---

## 4. Database Schema (Prisma)

**prisma/schema.prisma**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

// ─────────────────────────────────────────────────────────────────
// ENUMS
// ─────────────────────────────────────────────────────────────────

enum Rank {
  // Enlisted
  PVT E1
  PV2   // E2
  PFC   // E3
  SPC   // E4
  CPL   // E4
  SGT   // E5 — DA 2166-9-1
  SSG   // E6 — DA 2166-9-2
  SFC   // E7 — DA 2166-9-2
  MSG   // E8 — DA 2166-9-2
  FIRST_SERGEANT // E8 — DA 2166-9-2
  SGM   // E9 — DA 2166-9-3
  CSM   // E9 — DA 2166-9-3
  SMA   // E9 special
  // Warrant Officers
  WO1
  CW2
  CW3
  CW4
  CW5
  // Officers
  SECOND_LT
  FIRST_LT
  CPT
  MAJ
  LTC
  COL
  BG
  MG
  LTG
  GEN
}

enum UserRole {
  SOLDIER        // Can log support form entries, view own eval
  RATER          // Writes Part III + Part IV rater sections
  SENIOR_RATER   // Writes Part V senior rater section
  REVIEWER       // Supplementary reviewer (when required)
  ADMIN          // Unit admin: manage users, chains, units
}

enum EvalFormType {
  NCOER_9_1    // DA 2166-9-1 — SGT (E5). Binary attribute ratings.
  NCOER_9_2    // DA 2166-9-2 — SSG through 1SG/MSG (E6–E8). 4-level ratings.
  NCOER_9_3    // DA 2166-9-3 — CSM/SGM (E9). 4-level ratings.
}

// ── RATING SCALES ─────────────────────────────────────────────────
// E5 (SGT) — DA 2166-9-1 — binary per attribute
enum RatingBinary {
  MET_STANDARD
  DID_NOT_MEET_STANDARD
}

// E6+ (SSG and above) — DA 2166-9-2 and 9-3 — 4-level per attribute
enum RatingFourLevel {
  NOT_MET_STANDARD
  QUALIFIED
  EXCEEDED_STANDARD
  FAR_EXCEEDED_STANDARD
}

// Senior Rater overall potential — all NCO forms
enum SeniorRaterRating {
  MOST_QUALIFIED
  HIGHLY_QUALIFIED
  QUALIFIED
  NOT_QUALIFIED
}

// ── EVALUATION STATUS ─────────────────────────────────────────────
enum EvalStatus {
  DRAFT                    // Started, rater working
  RATER_COMPLETE           // Rater finished, sent to chain
  PENDING_SENIOR_RATER     // SR working their section
  PENDING_SOLDIER_ACK      // Awaiting rated soldier acknowledgment
  PENDING_REVIEWER         // Awaiting supplementary reviewer (if required)
  COMPLETE                 // All signatures collected
  SUBMITTED                // Forwarded to HRC (future)
}

// ── SECTION KEYS ─────────────────────────────────────────────────
// Maps to Part IV sections on the NCOER and support form
enum SectionKey {
  CHARACTER    // Army Values, Empathy, Warrior Ethos, Discipline
  PRESENCE     // Bearing, Fitness, Confidence, Resilience
  INTELLECT    // Mental Agility, Judgment, Innovation, Tact, Expertise
  LEADS        // Leads Others, Trust, Influence, Example, Communicates
  DEVELOPS     // Environment, Esprit, Prepares Self, Develops Others, Stewards
  ACHIEVES     // Gets Results
  // Not a Part IV section — separate forms:
  RATER_OVERALL        // Part IV rater overall performance comments
  SENIOR_RATER_OVERALL // Part V senior rater comments + box
  SOLDIER_COMMENTS     // Rated soldier's acknowledgment comments
}

// ── SUPPORT FORM ENTRY TYPES ──────────────────────────────────────
// Matches actual DA 2166-9-1A Part V structure
enum EntryType {
  OBJECTIVE        // "Indicate major performance objectives"
  ACCOMPLISHMENT   // "List significant contributions and accomplishments"
}

enum SignatureStatus {
  NOT_REQUIRED
  PENDING
  SIGNED
  DECLINED
}

enum CounselingType {
  INITIAL    // Within 30 days of rating period start (AR 623-3 requirement)
  QUARTERLY  // Quarterly follow-up (AR 623-3 requirement)
}

// ─────────────────────────────────────────────────────────────────
// UNITS
// ─────────────────────────────────────────────────────────────────

model Unit {
  id        String   @id @default(cuid())
  name      String                          // e.g. "C Co, 1-505 PIR"
  uic       String?  @unique                // Unit Identification Code
  parentId  String?
  parent    Unit?    @relation("UnitHierarchy", fields: [parentId], references: [id])
  children  Unit[]   @relation("UnitHierarchy")
  users     User[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("units")
}

// ─────────────────────────────────────────────────────────────────
// USERS
// ─────────────────────────────────────────────────────────────────

model User {
  id          String     @id @default(cuid())
  supabaseId  String     @unique
  email       String     @unique
  firstName   String
  lastName    String
  rank        Rank
  mos         String                        // e.g. "11B", "25U"
  roles       UserRole[]
  unitId      String?
  unit        Unit?      @relation(fields: [unitId], references: [id])
  dodid       String?    @unique            // Future CAC integration
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt

  // Relations
  supportForms             SupportForm[]    @relation("SoldierSupportForms")
  raterOnChains            RatingChain[]    @relation("RaterChains")
  seniorRaterOnChains      RatingChain[]    @relation("SeniorRaterChains")
  reviewerOnChains         RatingChain[]    @relation("ReviewerChains")
  ratedOnChains            RatingChain[]    @relation("RatedSoldierChains")
  signatures               Signature[]
  notifications            Notification[]
  auditLogs                AuditLog[]
  seniorRaterProfile       SeniorRaterProfile?

  @@map("users")
}

// ─────────────────────────────────────────────────────────────────
// RATING CHAINS
// ─────────────────────────────────────────────────────────────────

model RatingChain {
  id              String    @id @default(cuid())
  ratedSoldierId  String
  raterId         String
  seniorRaterId   String
  reviewerId      String?                   // Required per AR 623-3 for certain grades
  effectiveDate   DateTime
  endDate         DateTime?
  isActive        Boolean   @default(true)

  ratedSoldier    User      @relation("RatedSoldierChains", fields: [ratedSoldierId], references: [id])
  rater           User      @relation("RaterChains", fields: [raterId], references: [id])
  seniorRater     User      @relation("SeniorRaterChains", fields: [seniorRaterId], references: [id])
  reviewer        User?     @relation("ReviewerChains", fields: [reviewerId], references: [id])
  evaluations     Evaluation[]
  counselingSessions CounselingSession[]
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  @@map("rating_chains")
}

// ─────────────────────────────────────────────────────────────────
// COUNSELING SESSIONS
// AR 623-3 requires: initial counseling within 30 days of period start,
// plus quarterly follow-up counseling. This table tracks compliance.
// ─────────────────────────────────────────────────────────────────

model CounselingSession {
  id             String          @id @default(cuid())
  ratingChainId  String
  ratingChain    RatingChain     @relation(fields: [ratingChainId], references: [id])
  type           CounselingType
  sessionDate    DateTime
  notes          String?         // Summary comments for inclusion in NCOER
  raterInitials  String?
  soldierInitials String?
  createdAt      DateTime        @default(now())
  updatedAt      DateTime        @updatedAt

  @@map("counseling_sessions")
}

// ─────────────────────────────────────────────────────────────────
// SUPPORT FORMS
// ─────────────────────────────────────────────────────────────────

model SupportForm {
  id                String             @id @default(cuid())
  soldierId         String
  soldier           User               @relation("SoldierSupportForms", fields: [soldierId], references: [id])
  ratingPeriodStart DateTime
  ratingPeriodEnd   DateTime?
  dutyTitle         String
  dutyMosc          String
  dailyDutiesScope  String?
  areasOfEmphasis   String?
  appointedDuties   String?
  // Part IV: Soldier's own goals and expectations for the period
  soldierGoals      String?
  isActive          Boolean            @default(true)
  entries           SupportFormEntry[]
  evaluations       Evaluation[]
  createdAt         DateTime           @default(now())
  updatedAt         DateTime           @updatedAt

  @@map("support_forms")
}

model SupportFormEntry {
  id             String        @id @default(cuid())
  supportFormId  String
  supportForm    SupportForm   @relation(fields: [supportFormId], references: [id])
  entryDate      DateTime      @default(now())

  // Maps to Part V of DA 2166-9-1A
  // Each section has both objectives and accomplishments
  section        SectionKey    // CHARACTER | PRESENCE | INTELLECT | LEADS | DEVELOPS | ACHIEVES
  entryType      EntryType     // OBJECTIVE | ACCOMPLISHMENT

  rawText        String        // What the soldier or rater wrote
  tags           String[]      // Free-form tags for filtering
  isHighlight    Boolean       @default(false)  // Flagged as strongest entry for this period
  counseled      Boolean       @default(false)  // Was this discussed in a counseling session?
  counseledDate  DateTime?

  // AI usage tracking
  usedInEvalId   String?       // Which eval used this entry, if any

  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt

  @@map("support_form_entries")
}

// ─────────────────────────────────────────────────────────────────
// EVALUATIONS (NCOERs)
// ─────────────────────────────────────────────────────────────────

model Evaluation {
  id                    String       @id @default(cuid())
  ratingChainId         String
  ratingChain           RatingChain  @relation(fields: [ratingChainId], references: [id])
  supportFormId         String?
  supportForm           SupportForm? @relation(fields: [supportFormId], references: [id])
  formType              EvalFormType
  status                EvalStatus   @default(DRAFT)

  // Part I — Administrative Data (exact DA form field names)
  periodStart           DateTime
  periodEnd             DateTime
  ratedMonths           Int
  nonRatedMonths        Int          @default(0)
  nonRatedCodes         String?
  reasonForSubmission   String       // Annual, Change of Rater, Relief for Cause, etc.
  statusCode            String?      // e.g. "00" Active Duty
  numberOfEnclosures    Int          @default(0)

  // Part III — Duty Description (rater completes)
  principalDutyTitle    String?
  dutyMosc              String?
  dailyDutiesScope      String?      // People, equipment, facilities, dollars
  areasOfSpecialEmphasis String?
  appointedDuties       String?

  // Part V — Senior Rater succession planning
  // AR 623-3: two successive assignments + one broadening (3-5 years)
  successiveAssignment1 String?
  successiveAssignment2 String?
  broadeningAssignment  String?

  // Senior rater overall
  seniorRaterRating     SeniorRaterRating?

  // APFT/ACFT data (Part IVa/IVb on DA 2166-9-1)
  acftPassFail          String?      // "Pass" | "Fail" | "Profile"
  acftDate              DateTime?
  heightInches          Int?
  weightLbs             Int?
  withinWeightStandard  Boolean?

  sections              EvalSection[]
  signatures            Signature[]
  aiGenerations         AiGeneration[]
  auditLogs             AuditLog[]
  notifications         Notification[]

  createdAt             DateTime     @default(now())
  updatedAt             DateTime     @updatedAt

  @@map("evaluations")
}

// ─────────────────────────────────────────────────────────────────
// EVALUATION SECTIONS
// One row per section per evaluation.
// Rating field used depends on formType:
//   - NCOER_9_1 → ratingBinary
//   - NCOER_9_2 / NCOER_9_3 → ratingFourLevel
// ─────────────────────────────────────────────────────────────────

model EvalSection {
  id               String           @id @default(cuid())
  evaluationId     String
  evaluation       Evaluation       @relation(fields: [evaluationId], references: [id])
  section          SectionKey

  // Rating box — only one is used per form type
  ratingBinary     RatingBinary?    // E5 (SGT) forms only
  ratingFourLevel  RatingFourLevel? // E6+ forms only

  // Bullet pipeline
  // stagingBullets = AI suggestions in the staging panel (not yet on the form)
  // finalBullets   = bullets accepted and moved onto the form
  stagingBullets   String[]         @default([])
  finalBullets     String[]         @default([])

  // Anti-autopilot tracking
  // Tracks which final bullets originated from AI vs. were human-written
  bulletSources    Json?
  // e.g. { "0": "AI_MODIFIED", "1": "HUMAN", "2": "AI_UNMODIFIED" }
  // "AI_UNMODIFIED" triggers the soft-gate prompt before submission

  isComplete       Boolean          @default(false)
  completedAt      DateTime?
  completedById    String?

  createdAt        DateTime         @default(now())
  updatedAt        DateTime         @updatedAt

  @@unique([evaluationId, section])
  @@map("eval_sections")
}

// ─────────────────────────────────────────────────────────────────
// SENIOR RATER PROFILE
// Tracks how many evals the SR has rated by grade and rating level.
// Enforces the MQ% constraint — live profile meter in the UI.
// ─────────────────────────────────────────────────────────────────

model SeniorRaterProfile {
  id              String   @id @default(cuid())
  userId          String   @unique
  user            User     @relation(fields: [userId], references: [id])

  // Counts by grade (JSON for flexibility across form types)
  // e.g. { "SGT": { "MQ": 2, "HQ": 5, "Q": 3, "NQ": 0 } }
  profileData     Json     @default("{}")
  lastUpdated     DateTime @default(now())

  @@map("senior_rater_profiles")
}

// ─────────────────────────────────────────────────────────────────
// SIGNATURES
// All parties are notified simultaneously (parallel, not sequential).
// Status visible to everyone in the chain.
// ─────────────────────────────────────────────────────────────────

model Signature {
  id             String          @id @default(cuid())
  evaluationId   String
  evaluation     Evaluation      @relation(fields: [evaluationId], references: [id])
  userId         String
  user           User            @relation(fields: [userId], references: [id])
  role           UserRole
  status         SignatureStatus @default(PENDING)
  signedAt       DateTime?
  declineReason  String?
  notifiedAt     DateTime?
  createdAt      DateTime        @default(now())
  updatedAt      DateTime        @updatedAt

  @@unique([evaluationId, role])
  @@map("signatures")
}

// ─────────────────────────────────────────────────────────────────
// AI GENERATIONS
// Full audit trail: what went in, what came out, what the user chose.
// ─────────────────────────────────────────────────────────────────

model AiGeneration {
  id              String     @id @default(cuid())
  evaluationId    String
  evaluation      Evaluation @relation(fields: [evaluationId], references: [id])
  section         SectionKey
  promptVersion   String     // Track which prompt version produced this output

  // Pre-generation rater inputs (the guided questions)
  raterResponses  Json?
  // e.g. { "impactQuestion": "...", "developmentQuestion": "...", "promotionReady": true }

  // What support form entries were selected as context
  entryIds        String[]

  // What Claude returned
  outputBullets   String[]

  // What the user did with each bullet
  // -1 = rejected, 0-N = accepted (index into outputBullets)
  // "modified" = accepted but edited
  selectionLog    Json?
  // e.g. [{ "index": 0, "action": "ACCEPTED_MODIFIED", "finalText": "..." }, ...]

  createdAt       DateTime   @default(now())

  @@map("ai_generations")
}

// ─────────────────────────────────────────────────────────────────
// NOTIFICATIONS
// ─────────────────────────────────────────────────────────────────

model Notification {
  id           String      @id @default(cuid())
  userId       String
  user         User        @relation(fields: [userId], references: [id])
  evaluationId String?
  evaluation   Evaluation? @relation(fields: [evaluationId], references: [id])
  type         String      // "SIGNATURE_REQUIRED" | "EVAL_COMPLETE" | "COUNSELING_DUE" | etc.
  title        String
  message      String
  readAt       DateTime?
  createdAt    DateTime    @default(now())

  @@map("notifications")
}

// ─────────────────────────────────────────────────────────────────
// AUDIT LOG — immutable, never delete rows
// ─────────────────────────────────────────────────────────────────

model AuditLog {
  id           String      @id @default(cuid())
  evaluationId String?
  evaluation   Evaluation? @relation(fields: [evaluationId], references: [id])
  actorId      String
  actor        User        @relation(fields: [actorId], references: [id])
  action       String
  // Examples: SECTION_RATED | BULLET_ACCEPTED | BULLET_AI_UNMODIFIED_OVERRIDE
  //           SIGNATURE_APPLIED | SIGNATURE_DECLINED | CONSISTENCY_CHECK_OVERRIDDEN
  //           SR_PROFILE_MQ_WARNING_ACKNOWLEDGED
  entityType   String
  entityId     String
  metadata     Json?
  createdAt    DateTime    @default(now())

  @@map("audit_logs")
}
```

---

## 5. Directory Structure

```
ees2/
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   └── layout.tsx
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx                  # Sidebar + top nav + soldier header
│   │   │   ├── dashboard/page.tsx          # Formation eval status overview
│   │   │   ├── support-form/
│   │   │   │   ├── page.tsx                # Soldier's continuous performance log
│   │   │   │   └── entry/
│   │   │   │       ├── new/page.tsx        # Log accomplishment or objective
│   │   │   │       └── [id]/page.tsx       # Edit entry
│   │   │   ├── evaluations/
│   │   │   │   ├── page.tsx                # All evals in your chain
│   │   │   │   ├── new/page.tsx            # Start new NCOER
│   │   │   │   └── [id]/
│   │   │   │       ├── page.tsx            # Eval overview + section nav
│   │   │   │       ├── admin/page.tsx      # Part I: administrative data
│   │   │   │       ├── duty/page.tsx       # Part III: duty description
│   │   │   │       ├── [section]/page.tsx  # Part IV sections (dynamic)
│   │   │   │       ├── senior-rater/page.tsx
│   │   │   │       ├── review/page.tsx     # Full preview + consistency check
│   │   │   │       └── sign/page.tsx       # Signature page
│   │   │   └── admin/
│   │   │       ├── users/page.tsx
│   │   │       ├── units/page.tsx
│   │   │       └── rating-chains/page.tsx
│   │   ├── api/
│   │   │   ├── auth/callback/route.ts
│   │   │   ├── users/route.ts
│   │   │   ├── units/route.ts
│   │   │   ├── rating-chains/route.ts
│   │   │   ├── support-forms/
│   │   │   │   ├── route.ts
│   │   │   │   └── [id]/entries/route.ts
│   │   │   ├── evaluations/
│   │   │   │   ├── route.ts
│   │   │   │   └── [id]/
│   │   │   │       ├── route.ts
│   │   │   │       ├── sections/route.ts
│   │   │   │       ├── sign/route.ts
│   │   │   │       └── consistency-check/route.ts
│   │   │   ├── ai/
│   │   │   │   ├── generate-bullets/route.ts
│   │   │   │   └── refine-bullet/route.ts
│   │   │   └── pdf/generate/route.ts
│   ├── components/
│   │   ├── ui/                             # shadcn auto-generated
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx
│   │   │   ├── TopNav.tsx
│   │   │   └── SoldierHeader.tsx           # Persistent rated soldier identity bar
│   │   ├── evaluation/
│   │   │   ├── SectionEditor.tsx           # Section wrapper with rating box + bullets
│   │   │   ├── RatingBoxBinary.tsx         # MET / DID NOT MEET (E5 only)
│   │   │   ├── RatingBoxFourLevel.tsx      # NMS / Q / ES / FES (E6+)
│   │   │   ├── BulletStagingPanel.tsx      # AI suggestions — not auto-inserted
│   │   │   ├── BulletEditor.tsx            # Accepted bullets on the form
│   │   │   ├── BulletCard.tsx              # Single bullet with source tracking
│   │   │   ├── ConsistencyCheckModal.tsx   # Pre-submission warning review
│   │   │   ├── EvalProgressBar.tsx
│   │   │   ├── SectionNav.tsx
│   │   │   └── RatingChainStatus.tsx       # Parallel sig status display
│   │   ├── ai/
│   │   │   ├── GuidedQuestionsForm.tsx     # Required before generation
│   │   │   ├── BulletGenerator.tsx         # Orchestrates the AI flow
│   │   │   └── GeneratingIndicator.tsx
│   │   ├── support-form/
│   │   │   ├── EntryTimeline.tsx
│   │   │   ├── EntryCard.tsx
│   │   │   └── QuickEntryBar.tsx
│   │   ├── senior-rater/
│   │   │   ├── ProfileMeter.tsx            # Live MQ% profile tracker
│   │   │   └── SuccessionPlanForm.tsx
│   │   └── pdf/
│   │       ├── NCOER91Template.tsx         # DA 2166-9-1
│   │       ├── NCOER92Template.tsx         # DA 2166-9-2
│   │       └── NCOERStyles.ts
│   ├── lib/
│   │   ├── db/prisma.ts
│   │   ├── supabase/
│   │   │   ├── client.ts
│   │   │   └── server.ts
│   │   ├── ai/
│   │   │   ├── claude.ts
│   │   │   ├── prompts.ts
│   │   │   └── consistency-check.ts
│   │   ├── pdf/generator.ts
│   │   └── utils/
│   │       ├── army-ranks.ts
│   │       ├── form-constants.ts
│   │       └── cn.ts
│   └── types/
│       ├── evaluation.ts
│       └── api.ts
├── prisma/schema.prisma
├── public/
└── .env.local
```

---

## 6. AI Architecture — Anti-Autopilot Design

This is the core product philosophy: AI is a writing coach, not a ghostwriter. 
The rater must engage, own, and be accountable for every word on the form.

### The Bullet Generation Flow (3 gates before anything hits the form)

```
GATE 1 — Rater answers guided questions
         ↓
GATE 2 — Rater selects relevant support form entries
         ↓
GATE 3 — AI generates bullets into STAGING PANEL (not the form)
         ↓
      Rater reviews, edits, drags to form
         ↓
      Unmodified AI bullets trigger soft prompt before submission
```

### Gate 1 — Guided Questions (GuidedQuestionsForm.tsx)

Before the AI generates anything, the rater must answer section-specific questions.
These answers become part of the AI context — the output reflects rater judgment.

Example questions per section:

**CHARACTER**
- "Describe a specific situation where this NCO's values were tested."
- "Did this NCO fully support SHARP, EO, and EEO requirements? Any notable actions?"
- "Any discipline issues this period?"

**LEADS**
- "What's the most impactful thing this NCO did to lead their subordinates?"
- "How did they perform when the chain of command wasn't present?"
- "Did they extend influence beyond their direct chain? How?"

**ACHIEVES**
- "What was the single most significant result this NCO produced?"
- "Were there any mission failures or near-misses to address?"
- "What quantifiable outcomes can you cite (numbers, percentages, dollar values)?"

These are not skippable. The Generate button is disabled until all required fields are filled.

### Gate 2 — Staging Panel (BulletStagingPanel.tsx)

AI suggestions appear in a panel to the RIGHT of the form. 
They are NOT inserted automatically. The rater must:
- Read each suggestion
- Edit if desired (encouraged)
- Deliberately drag or click to move a bullet onto the form

No "Accept All" button exists. Each bullet requires individual action.

### Gate 3 — Edit-Required Soft Prompt

Every bullet on the form is tagged with its source:

```typescript
type BulletSource = 
  | "HUMAN"           // Rater wrote it from scratch
  | "AI_MODIFIED"     // Started as AI, rater edited it (good)
  | "AI_UNMODIFIED"   // AI output, zero changes made (flagged)
```

Before submission, if any bullet is `AI_UNMODIFIED`, a modal appears:

> **"This bullet hasn't been modified."**
> *[Bullet text shown]*
> Does this accurately reflect your personal assessment of SGT Smith's performance?
> [ Edit Bullet ] [ Yes, it accurately reflects my assessment ]

Choosing "Yes" is logged in the audit trail. It's not a hard block — it's accountability.

### Pre-Submission Consistency Check (consistency-check.ts)

Runs automatically before the rater can send for signatures. Flags (warnings, not blockers):

1. **Box check vs. bullet mismatch** — Rated "MET STANDARD" on CHARACTER but bullets 
   contain language suggesting deficiency (or vice versa)
2. **Duplicate/near-duplicate bullets** — Same bullet text appearing in multiple sections
3. **Rating vs. narrative strength** — Rated "FAR EXCEEDED STANDARD" but ACHIEVES 
   section has only one weak bullet
4. **Empty sections** — Any Part IV section with a box check but no bullets
5. **Counseling gap** — Support form entries that were never discussed in a counseling 
   session (flags to the rater, not a blocker)
6. **SR profile MQ warning** — Adding MOST QUALIFIED would push SR's profile 
   above the ~50% MQ threshold for this grade

Each flag has: a description, the specific section/field, and a "Resolve" or "Acknowledge and Continue" action. All acknowledgments are logged.

---

## 7. AI Prompts (lib/ai/prompts.ts)

```typescript
export const SYSTEM_PROMPT = `
You are an expert Army evaluation writer with deep knowledge of AR 623-3, 
DA PAM 623-3, and Army leadership doctrine (ADP 6-22).

You help raters write NCOER bullets for DA Form 2166-9 series evaluations.
Your role is to assist and suggest — the rater owns the final assessment.

BULLET WRITING RULES (from DA PAM 623-3):
- Begin every bullet with a strong action verb
- Include quantifiable impact wherever the input supports it
  (X of Y Soldiers, $X equipment value, X% improvement, X/X possible score)
- Tie performance to mission impact or Army Values
- Do NOT use first person (no "I", "my", "we")
- Use active voice
- Maximum 200 characters per bullet
- Each bullet must stand alone — no bullet requires reading another
- Avoid vague language ("assisted with", "helped to", "participated in")
- Prohibited: personal opinions, reference to race, gender, religion, SSN

IMPORTANT: You generate candidates. The rater decides what goes on the form.
Return ONLY a valid JSON array of strings. No preamble, no explanation, 
no markdown code fences.
Example: ["Bullet one", "Bullet two", "Bullet three"]
`;

export function buildSectionPrompt(input: {
  soldierRank: string
  soldierMos: string
  dutyTitle: string
  section: string
  sectionDefinition: string
  raterResponses: Record<string, string>
  supportEntries: string[]
}): string {
  return `
SOLDIER: ${input.soldierRank}, MOS ${input.soldierMos}
DUTY TITLE: ${input.dutyTitle}
SECTION: ${input.section}

SECTION DEFINITION:
${input.sectionDefinition}

RATER'S ASSESSMENT (use this to shape the bullets — this is their judgment):
${Object.entries(input.raterResponses).map(([k, v]) => `- ${k}: ${v}`).join('\n')}

SUPPORT FORM ENTRIES (raw accomplishments and objectives to draw from):
${input.supportEntries.map((e, i) => `${i + 1}. ${e}`).join('\n')}

Generate 4 NCOER bullet candidates for the ${input.section} section.
Prioritize the rater's assessment. Use support form entries as evidence.
Return JSON array only.
`.trim()
}

// Section definitions drawn from DA 2166-9-1A doctrinal text
export const SECTION_DEFINITIONS: Record<string, string> = {
  CHARACTER: `Army Values (Loyalty, Duty, Respect, Selfless Service, Honor, Integrity, 
Personal Courage), Empathy, Warrior Ethos/Service Ethos, Discipline. 
Must address SHARP, EO, and EEO adherence.`,

  PRESENCE: `Military and professional bearing, Fitness, Confidence, Resilience. 
The impression the NCO makes — outward appearance, demeanor, actions, words.`,

  INTELLECT: `Mental agility, Sound judgment, Innovation, Interpersonal tact, Expertise. 
Conceptual abilities applied to duties: problem solving, analytical thinking, 
anticipating second and third order effects.`,

  LEADS: `Leads others, Builds trust, Extends influence beyond the chain of command, 
Leads by example, Communicates. Motivates, inspires, and influences others 
toward mission accomplishment.`,

  DEVELOPS: `Creates a positive environment/Fosters esprit de corps, Prepares self, 
Develops others, Stewards the profession. Long-term focus on people and organization.`,

  ACHIEVES: `Gets Results. A leader's ultimate purpose is to accomplish tasks and achieve 
results. Focus on consistent, ethical task accomplishment through supervising, 
managing, monitoring, and controlling work.`
}
```

---

## 8. Design System

### Philosophy
This is a working tool for NCOs and raters at a desk. Not a consumer app.
Design should feel like what EES *should have been*: fast, data-dense, professional.
The rated soldier is present throughout — you're writing about a person, not filling out paperwork.

### Color Palette
```css
/* Layout */
--sidebar:          #1B2533;   /* Dark navy — not legacy Army green */
--sidebar-text:     #E5E7EB;
--sidebar-accent:   #4B5320;   /* OD green — active nav item only */
--background:       #F4F5F0;   /* Warm near-white — subtle field aesthetic */
--surface:          #FFFFFF;   /* Content cards, forms */

/* Soldier header bar — persistent identity strip */
--soldier-header:   #2C3E2D;   /* Deep army green */
--soldier-header-text: #F0F2EE;

/* Text */
--text-primary:     #111827;
--text-muted:       #6B7280;
--text-label:       #374151;

/* Borders */
--border:           #D1D5DB;
--border-strong:    #9CA3AF;

/* Semantic — Army-tuned, no reds or pinks */
--success:          #4B5320;   /* OD green for MET / complete */
--warning:          #B45309;   /* Muted amber — never yellow */
--danger:           #7F1D1D;   /* Dark maroon — only for DID NOT MEET */
--info:             #1E3A5F;   /* Dark navy blue */

/* Rating colors */
--rating-met:       #4B5320;   /* MET STANDARD */
--rating-not-met:   #7F1D1D;   /* DID NOT MEET / NOT MET STANDARD */
--rating-qualified: #1E3A5F;
--rating-exceeded:  #4B5320;
--rating-far:       #2D4A1E;   /* Deepest green — best rating */
```

### Typography
```css
/* UI and body — clean, readable, not legacy-government */
font-family: 'Inter', system-ui, -apple-system, sans-serif;

/* Form field content and character counts */
font-family: 'JetBrains Mono', 'Courier New', monospace;
```

### The Soldier Header (SoldierHeader.tsx)
A persistent strip across the top of every evaluation page. Always visible.
The rater is never writing into a blank form — they're writing about this person.

```
┌─────────────────────────────────────────────────────────────────────┐
│  SGT SMITH, JAMES R.   │  11B  │  Rifleman, B Co 2-504 PIR         │
│  Period: 20240601–20250531  │  Rating Chain: SSG Jones / SFC Davis  │
└─────────────────────────────────────────────────────────────────────┘
```
Background: `--soldier-header` (#2C3E2D)
Text: `--soldier-header-text` (#F0F2EE)
Font: Inter Medium, 14px
Always sticky — never scrolls away.

### Straight Lines Only
No border-radius above `rounded-sm` (2px) for form elements.
Cards use `rounded-md` (6px) maximum.
No decorative curves, gradients, or drop shadows heavier than `shadow-sm`.
Sections are separated by clean 1px borders, not whitespace.

---

## 9. Key UI Screens

### Dashboard (`/dashboard`)
- Formation grid: one card per soldier in rating chain
- Each card: name, rank, eval status badge, days until period end
- Color-coded status: Draft (neutral) → In Progress (info) → Pending Sig (warning) → Complete (success)
- Counseling compliance indicators: initial and quarterly counseling dates shown inline
- One-click to jump into any eval

### Section Editor (`/evaluations/[id]/[section]`)
Three-column layout:

```
LEFT PANEL (280px)          CENTER (flex-1)              RIGHT PANEL (320px)
─────────────────────       ──────────────────────────   ──────────────────────
Support Form Entries        SECTION: ACHIEVES            AI Staging Panel
                                                         
Filter by:                  [ Rating Box ]               [ Generate Bullets ]
□ Objectives                ○ NMS  ○ Q  ● ES  ○ FES     ─────────────────────
■ Accomplishments                                         Bullet 1: "Led 12-Soldier
                            Bullets on Form:             squad through 3 air assault
[Entry date] [tag]          ┌──────────────────────┐     operations..."
"Qualified Expert on        │ Achieved 95% company  │
M4/M203 during              │ maintenance rates...  │     [ Edit ] [ Add to Form ]
Warrior Leader Course"      └──────────────────────┘     
                            + Add bullet               Bullet 2: "Maintained 100%
[Entry date] [tag]                                    operational readiness..."
"Led PT session..."          Char count: 47/200
                                                         [ Edit ] [ Add to Form ]
```

Support form entries are always one click away — never hidden on another page.
AI panel slides in from the right — doesn't interrupt the form layout.

### Consistency Check Modal (pre-submission)
Appears before "Send for Signatures." Lists all flags with severity:

```
⚠ REVIEW BEFORE SUBMITTING

[WARNING] ACHIEVES section: 2 bullets are AI-generated and unmodified.
→ [ Review Bullets ]

[WARNING] SR Profile: Adding MOST QUALIFIED would put your MQ rate at 54% for SGT.
  Current: 48% (11 of 23 rated). Threshold: ~50%.
→ [ Acknowledge and Continue ]

[INFO] 3 support form entries were never marked as counseled.
→ [ View Entries ] [ Acknowledge ]

[ Cancel ]                              [ Confirm — Send for Signatures ]
```

### Signing Page (`/evaluations/[id]/sign`)
Clean, read-only form preview. One deliberate action at the bottom:

```
[ I have reviewed this evaluation and my signature is applied ]

[ Decline — Add Comments ]
```
No ambiguity. No confirmation dialogs after. Status updates propagate immediately.

---

## 10. Senior Rater Profile Meter (ProfileMeter.tsx)

Live tracker visible whenever the SR is working their Part V section.

```
YOUR SR PROFILE — SGT (E5)
──────────────────────────────────────────────────────
MOST QUALIFIED    ██████░░░░░░   11 of 24 rated  (46%)
HIGHLY QUALIFIED  ████████░░░░   8 of 24         (33%)
QUALIFIED         ████░░░░░░░░   5 of 24         (21%)
NOT QUALIFIED     ░░░░░░░░░░░░   0 of 24          (0%)

Selecting MOST QUALIFIED: would move to 50% — at threshold.
```

Warning fires at threshold. SR can still select MQ — the warning is not a hard block.
Selecting over threshold requires acknowledging the flag (logged in audit trail).

---

## 11. Counseling Compliance Tracker

AR 623-3 Requirements:
- Initial counseling: within 30 days of rating period start
- Quarterly follow-up: every ~90 days thereafter
- Summary notes from counseling sessions feed the NCOER

What the system tracks:
- Whether initial counseling has been logged
- Whether quarterly sessions are on schedule (alerts at 75 days, flags at 90+)
- Which support form entries were discussed in counseling
- Whether counseling dates are recorded on the NCOER (Part II, field d1)

This is visible on the dashboard (at-a-glance per soldier) and inside the eval.
A soldier with 0 counseling sessions logged gets a soft warning before AI generation:
*"No counseling sessions are recorded for this rating period. 
Have you met with SGT Smith to discuss their performance objectives?"*

---

## 12. PDF Generation

Output is a clean typed version of the DA form — close enough to be immediately recognizable, 
professional enough to not look like EES. Raters download it and submit via EES or S1.
No integration required for MVP.

```typescript
// lib/pdf/generator.ts
import { renderToBuffer } from "@react-pdf/renderer"
import { createElement } from "react"
import { NCOER91Template } from "@/components/pdf/NCOER91Template"
import { NCOER92Template } from "@/components/pdf/NCOER92Template"

export async function generateNCOERPDF(
  evalData: EvalPDFData,
  formType: EvalFormType
): Promise<Buffer> {
  const template = formType === "NCOER_9_1"
    ? createElement(NCOER91Template, { data: evalData })
    : createElement(NCOER92Template, { data: evalData })

  return await renderToBuffer(template)
}
```

Note: Before building the PDF template, confirm current form edition on APD 
(armypubs.army.mil) — forms may have been revised since the Nov 2015 version.

---

## 13. MVP Build Sequence

### Phase 1 — Foundation (Week 1–2)
- [ ] Next.js project + all dependencies installed
- [ ] Supabase project created, auth working (email/password)
- [ ] Prisma schema pushed to DB (`npx prisma db push`)
- [ ] Layout shell: sidebar, top nav, route protection
- [ ] Admin pages: create users, assign units, assign rating chains

### Phase 2 — Support Form (Week 2–3)
- [ ] Support form creation with duty description fields
- [ ] Entry creation: section, entryType, rawText, tags
- [ ] Timeline view with filter by section/entryType
- [ ] Counseling session logging
- [ ] Counseling compliance indicators

### Phase 3 — NCOER Shell (Week 3–4)
- [ ] New eval: select soldier → auto-pulls chain + form type
- [ ] Part I: administrative data form (all fields from DA 2166-9-1)
- [ ] Part III: duty description
- [ ] Section navigation with completion tracking
- [ ] RatingBoxBinary (E5) and RatingBoxFourLevel (E6+) components
- [ ] Persistent SoldierHeader on all eval pages
- [ ] Dashboard: formation eval status grid

### Phase 4 — AI Bullet Generation (Week 4–5)
- [ ] GuidedQuestionsForm — required before generation
- [ ] Support form entry selector
- [ ] generate-bullets API route (Claude)
- [ ] BulletStagingPanel — AI output, not auto-inserted
- [ ] Bullet source tracking (HUMAN / AI_MODIFIED / AI_UNMODIFIED)
- [ ] Edit-required soft prompt for unmodified AI bullets
- [ ] AiGeneration audit trail

### Phase 5 — Consistency Check + Signing (Week 5–6)
- [ ] consistency-check.ts — all 6 warning types
- [ ] ConsistencyCheckModal before submission
- [ ] Parallel signature notifications (all chain members simultaneously)
- [ ] Sign/decline page
- [ ] Senior Rater profile meter
- [ ] Signature status visible on dashboard

### Phase 6 — PDF + Demo Polish (Week 6–8)
- [ ] react-pdf NCOER templates (9-1 and 9-2)
- [ ] PDF download action
- [ ] Full-form review page
- [ ] Demo seed script (realistic formation + evals in different states)
- [ ] Empty states, loading states, error handling

---

## 14. Prisma Commands

```bash
npx prisma db push           # Push schema to DB (development)
npx prisma generate          # Regenerate client after schema changes
npx prisma studio            # Visual DB browser
npx prisma migrate dev --name init   # Create migration (pre-production)
npx prisma db seed           # Seed demo data
```

---

## 15. First Commands to Run

```bash
npx create-next-app@latest ees2 \
  --typescript --tailwind --eslint --app --src-dir \
  --import-alias "@/*"

cd ees2

npm install @prisma/client prisma \
  @supabase/supabase-js @supabase/ssr \
  @anthropic-ai/sdk \
  @react-pdf/renderer \
  zustand \
  react-hook-form @hookform/resolvers zod \
  date-fns lucide-react \
  clsx tailwind-merge class-variance-authority

npx shadcn@latest init
npx prisma init
```

Then: create Supabase project → copy DATABASE_URL into `.env.local` → 
paste schema into `prisma/schema.prisma` → run `npx prisma db push`.

Foundation in ~30 minutes.