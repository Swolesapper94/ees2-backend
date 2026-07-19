import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const DEMO_SYNCED_AT = new Date("2026-07-18T13:45:00Z");
const DEMO_ASSIGNMENT_START = new Date("2026-03-01T00:00:00Z");

interface DemoPersonnelProfile {
  component: string;
  payGrade: string;
  branchOrMOS: string;
  dutyTitle: string;
  unitName: string;
  unitUic: string;
  officialEmail: string;
  assignmentStartDate: string;
  assignmentEndDate: string | null;
  acftStatus: string;
  acftScore: number;
  acftDate: string;
  heightInches: number;
  weightPounds: number;
  bodyCompositionStatus: string;
  bodyCompositionEffectiveDate: string;
  personnelSourceSystem: string;
  personnelSourceRecordId: string;
  personnelSyncStatus: string;
  personnelSynchronizedAt: string;
  isDemoIdentity: boolean;
  profilePhotoSourceSystem: string;
  profilePhotoUrl: string;
  profilePhotoSynchronizedAt: string;
}

function demoProfile(input: Omit<DemoPersonnelProfile, "personnelSourceSystem" | "personnelSyncStatus" | "personnelSynchronizedAt" | "isDemoIdentity" | "profilePhotoSourceSystem" | "profilePhotoSynchronizedAt">): DemoPersonnelProfile {
  return {
    ...input,
    personnelSourceSystem: "IPPS_A_STUB",
    personnelSyncStatus: "CURRENT",
    personnelSynchronizedAt: DEMO_SYNCED_AT.toISOString(),
    isDemoIdentity: true,
    profilePhotoSourceSystem: "MICROSOFT_365_STUB",
    profilePhotoSynchronizedAt: DEMO_SYNCED_AT.toISOString(),
  };
}

async function seedDemoIdentity(userId: string, profile: DemoPersonnelProfile) {
  await prisma.identitySourceRecord.upsert({
    where: { userId },
    update: {
      sourceSystem: "IPPS_A",
      authoritativePersonId: profile.personnelSourceRecordId,
      authoritativeEmail: profile.officialEmail,
      dutyPosition: profile.dutyTitle,
      sourcePayload: profile,
      syncStatus: "CURRENT",
      lastSyncAttemptAt: DEMO_SYNCED_AT,
      lastSynchronizedAt: DEMO_SYNCED_AT,
      syncError: null,
    },
    create: {
      userId,
      sourceSystem: "IPPS_A",
      authoritativePersonId: profile.personnelSourceRecordId,
      authoritativeEmail: profile.officialEmail,
      dutyPosition: profile.dutyTitle,
      sourcePayload: profile,
      syncStatus: "CURRENT",
      lastSyncAttemptAt: DEMO_SYNCED_AT,
      lastSynchronizedAt: DEMO_SYNCED_AT,
    },
  });
}

async function ensurePublishedAssignment(input: {
  id: string;
  ratedSoldierId: string;
  raterId: string;
  seniorRaterId: string;
  unitId: string;
  ratingSchemeId: string;
  formCategory: "NCOER" | "OER";
  createdByUserId: string;
}) {
  const overlapping = await prisma.ratingSchemeAssignment.findFirst({
    where: {
      id: { not: input.id },
      ratedSoldierId: input.ratedSoldierId,
      status: "PUBLISHED",
      effectiveFrom: { lte: new Date("9999-12-31T00:00:00Z") },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: DEMO_ASSIGNMENT_START } }],
    },
  });
  if (overlapping) {
    await prisma.ratingSchemeAssignment.updateMany({
      where: { id: input.id },
      data: {
        status: "SUPERSEDED",
        effectiveTo: new Date(overlapping.effectiveFrom.getTime() - 86_400_000),
      },
    });
    return overlapping;
  }
  return prisma.ratingSchemeAssignment.upsert({
    where: { id: input.id },
    update: {
      ratingSchemeId: input.ratingSchemeId,
      ratedSoldierId: input.ratedSoldierId,
      raterId: input.raterId,
      seniorRaterId: input.seniorRaterId,
      unitId: input.unitId,
      formCategory: input.formCategory,
      effectiveFrom: DEMO_ASSIGNMENT_START,
      effectiveTo: null,
      status: "PUBLISHED",
      publishedByUserId: input.createdByUserId,
      publishedAt: DEMO_SYNCED_AT,
    },
    create: {
      id: input.id,
      ratingSchemeId: input.ratingSchemeId,
      ratedSoldierId: input.ratedSoldierId,
      raterId: input.raterId,
      seniorRaterId: input.seniorRaterId,
      unitId: input.unitId,
      formCategory: input.formCategory,
      effectiveFrom: DEMO_ASSIGNMENT_START,
      status: "PUBLISHED",
      createdByUserId: input.createdByUserId,
      approvedByUserId: input.createdByUserId,
      approvedAt: DEMO_SYNCED_AT,
      publishedByUserId: input.createdByUserId,
      publishedAt: DEMO_SYNCED_AT,
    },
  });
}

/**
 * Clean minimal seed for dev testing.
 * Creates the dev personas matched to auth.ts DEV_USERS.
 */
async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("The demo seed is development/demo only and cannot run in production.");
  }

  // ── Unit ──────────────────────────────────────────────────────
  const unit = await prisma.unit.upsert({
    where: { uic: "W8A0AA" },
    update: { name: "721st Engineer Company" },
    create: { id: "dev-unit-721st-engineer", name: "721st Engineer Company", uic: "W8A0AA" },
  });

  // ── Dev Users (matched to auth.ts DEV_USERS) ────────────────────
  const cpSsmith = await prisma.user.upsert({
    where: { email: "peter.smith@army.mil" },
    update: { unitId: unit.id, category: "OFFICER", profilePictureUrl: "/demo-avatars/peter-smith.webp" },
    create: {
      id: "dev-cpt-smith",
      supabaseId: "dev-cpt-smith",
      email: "peter.smith@army.mil",
      firstName: "Peter",
      lastName: "Smith",
      rank: "CPT",
      mos: "11A",
      roles: ["SOLDIER", "RATER", "SENIOR_RATER", "COMMANDER"],
      unitId: unit.id,
      category: "OFFICER",
      profilePictureUrl: "/demo-avatars/peter-smith.webp",
    },
  });

  const ssgJohnson = await prisma.user.upsert({
    where: { email: "marcus.johnson@army.mil" },
    update: { unitId: unit.id, category: "NCO", profilePictureUrl: "/demo-avatars/marcus-johnson.webp" },
    create: {
      id: "dev-ssg-johnson",
      supabaseId: "dev-ssg-johnson",
      email: "marcus.johnson@army.mil",
      firstName: "Marcus",
      lastName: "Johnson",
      rank: "SSG",
      mos: "11B",
      roles: ["SOLDIER", "RATER"],
      unitId: unit.id,
      category: "NCO",
      profilePictureUrl: "/demo-avatars/marcus-johnson.webp",
    },
  });

  const sgtDavis = await prisma.user.upsert({
    where: { email: "james.davis@army.mil" },
    update: { unitId: unit.id, category: "NCO", profilePictureUrl: "/demo-avatars/james-davis.webp" },
    create: {
      id: "dev-sgt-davis",
      supabaseId: "dev-sgt-davis",
      email: "james.davis@army.mil",
      firstName: "James",
      lastName: "Davis",
      rank: "SGT",
      mos: "11B",
      roles: ["SOLDIER"],
      unitId: unit.id,
      category: "NCO",
      profilePictureUrl: "/demo-avatars/james-davis.webp",
    },
  });

  const ltTorres = await prisma.user.upsert({
    where: { email: "maria.torres@army.mil" },
    update: { unitId: unit.id, category: "OFFICER", profilePictureUrl: "/demo-avatars/maria-torres.webp" },
    create: {
      id: "dev-1lt-torres",
      supabaseId: "dev-1lt-torres",
      email: "maria.torres@army.mil",
      firstName: "Maria",
      lastName: "Torres",
      rank: "FIRST_LT",
      mos: "11A",
      roles: ["SOLDIER", "RATER"],
      unitId: unit.id,
      category: "OFFICER",
      profilePictureUrl: "/demo-avatars/maria-torres.webp",
    },
  });

  const sfcWilliams = await prisma.user.upsert({
    where: { email: "robert.williams@army.mil" },
    update: { unitId: unit.id, category: "NCO", profilePictureUrl: "/demo-avatars/robert-williams.webp" },
    create: {
      id: "dev-sfc-williams",
      supabaseId: "dev-sfc-williams",
      email: "robert.williams@army.mil",
      firstName: "Robert",
      lastName: "Williams",
      rank: "SFC",
      mos: "11B",
      roles: ["SOLDIER", "RATER", "SENIOR_RATER"],
      unitId: unit.id,
      category: "NCO",
      profilePictureUrl: "/demo-avatars/robert-williams.webp",
    },
  });

  const majLee = await prisma.user.upsert({
    where: { email: "jordan.lee@army.mil" },
    update: { unitId: unit.id, category: "OFFICER" },
    create: {
      id: "dev-maj-lee",
      supabaseId: "dev-maj-lee",
      email: "jordan.lee@army.mil",
      firstName: "Jordan",
      lastName: "Lee",
      rank: "MAJ",
      category: "OFFICER",
      mos: "11A",
      roles: ["SOLDIER", "SENIOR_RATER"],
      unitId: unit.id,
    },
  });

  await Promise.all([
    seedDemoIdentity(sgtDavis.id, demoProfile({ component: "USAR", payGrade: "E-5", branchOrMOS: "11B", dutyTitle: "Team Leader", unitName: unit.name, unitUic: unit.uic ?? "W8A0AA", officialEmail: "james.davis.demo@army.mil", assignmentStartDate: "2026-03-01", assignmentEndDate: null, acftStatus: "PASS", acftScore: 523, acftDate: "2026-05-18", heightInches: 70, weightPounds: 178, bodyCompositionStatus: "COMPLIANT", bodyCompositionEffectiveDate: "2026-05-18", personnelSourceRecordId: "ippsa-demo-davis-001", profilePhotoUrl: "/demo-avatars/james-davis.webp" })),
    seedDemoIdentity(ssgJohnson.id, demoProfile({ component: "USAR", payGrade: "E-6", branchOrMOS: "11B", dutyTitle: "Squad Leader", unitName: unit.name, unitUic: unit.uic ?? "W8A0AA", officialEmail: "marcus.johnson.demo@army.mil", assignmentStartDate: "2026-03-01", assignmentEndDate: null, acftStatus: "PASS", acftScore: 548, acftDate: "2026-05-20", heightInches: 71, weightPounds: 186, bodyCompositionStatus: "COMPLIANT", bodyCompositionEffectiveDate: "2026-05-20", personnelSourceRecordId: "ippsa-demo-johnson-001", profilePhotoUrl: "/demo-avatars/marcus-johnson.webp" })),
    seedDemoIdentity(sfcWilliams.id, demoProfile({ component: "USAR", payGrade: "E-7", branchOrMOS: "11B", dutyTitle: "Platoon Sergeant", unitName: unit.name, unitUic: unit.uic ?? "W8A0AA", officialEmail: "robert.williams.demo@army.mil", assignmentStartDate: "2026-03-01", assignmentEndDate: null, acftStatus: "PASS", acftScore: 561, acftDate: "2026-05-16", heightInches: 72, weightPounds: 190, bodyCompositionStatus: "COMPLIANT", bodyCompositionEffectiveDate: "2026-05-16", personnelSourceRecordId: "ippsa-demo-williams-001", profilePhotoUrl: "/demo-avatars/robert-williams.webp" })),
    seedDemoIdentity(cpSsmith.id, demoProfile({ component: "USAR", payGrade: "O-3", branchOrMOS: "11A", dutyTitle: "Company Commander", unitName: unit.name, unitUic: unit.uic ?? "W8A0AA", officialEmail: "peter.smith.demo@army.mil", assignmentStartDate: "2026-03-01", assignmentEndDate: null, acftStatus: "PASS", acftScore: 536, acftDate: "2026-05-14", heightInches: 70, weightPounds: 181, bodyCompositionStatus: "COMPLIANT", bodyCompositionEffectiveDate: "2026-05-14", personnelSourceRecordId: "ippsa-demo-smith-001", profilePhotoUrl: "/demo-avatars/peter-smith.webp" })),
    seedDemoIdentity(ltTorres.id, demoProfile({ component: "USAR", payGrade: "O-2", branchOrMOS: "11A", dutyTitle: "Platoon Leader", unitName: unit.name, unitUic: unit.uic ?? "W8A0AA", officialEmail: "maria.torres.demo@army.mil", assignmentStartDate: "2026-03-01", assignmentEndDate: null, acftStatus: "PASS", acftScore: 519, acftDate: "2026-05-22", heightInches: 66, weightPounds: 142, bodyCompositionStatus: "COMPLIANT", bodyCompositionEffectiveDate: "2026-05-22", personnelSourceRecordId: "ippsa-demo-torres-001", profilePhotoUrl: "/demo-avatars/maria-torres.webp" })),
    seedDemoIdentity(majLee.id, demoProfile({ component: "USAR", payGrade: "O-4", branchOrMOS: "11A", dutyTitle: "Battalion Executive Officer", unitName: "1-505 PIR, 82nd ABN", unitUic: "W8A0AB", officialEmail: "jordan.lee.demo@army.mil", assignmentStartDate: "2026-03-01", assignmentEndDate: null, acftStatus: "PASS", acftScore: 532, acftDate: "2026-05-17", heightInches: 69, weightPounds: 176, bodyCompositionStatus: "COMPLIANT", bodyCompositionEffectiveDate: "2026-05-17", personnelSourceRecordId: "ippsa-demo-lee-001", profilePhotoUrl: "/demo-avatars/jordan-lee.webp" })),
  ]);

  const ratingScheme = await prisma.ratingScheme.upsert({
    where: { id: "demo-rating-scheme-2026" },
    update: {
      unitId: unit.id,
      battalionId: unit.id,
      status: "PUBLISHED",
      effectiveFrom: DEMO_ASSIGNMENT_START,
      effectiveTo: null,
      publishedByUserId: cpSsmith.id,
      publishedAt: DEMO_SYNCED_AT,
    },
    create: {
      id: "demo-rating-scheme-2026",
      unitId: unit.id,
      battalionId: unit.id,
      version: 1,
      status: "PUBLISHED",
      effectiveFrom: DEMO_ASSIGNMENT_START,
      createdByUserId: cpSsmith.id,
      approvedByUserId: cpSsmith.id,
      approvedAt: DEMO_SYNCED_AT,
      publishedByUserId: cpSsmith.id,
      publishedAt: DEMO_SYNCED_AT,
    },
  });

  // ── Rating Chains (3 dev chains for testing) ──────────────────
  // Chain 1: SGT Davis (rated) → SSG Johnson (rater) → SFC Williams (sr)
  const davisChain = await prisma.ratingChain.upsert({
    where: { id: "dev-chain-davis" },
    update: {},
    create: {
      id: "dev-chain-davis",
      ratedSoldierId: sgtDavis.id,
      raterId: ssgJohnson.id,
      seniorRaterId: sfcWilliams.id,
      effectiveDate: DEMO_ASSIGNMENT_START,
    },
  });

  // Chain 2: SSG Johnson (rated) → CPT Smith (rater) → SFC Williams (sr)
  const johnsonChain = await prisma.ratingChain.upsert({
    where: { id: "dev-chain-johnson" },
    update: {},
    create: {
      id: "dev-chain-johnson",
      ratedSoldierId: ssgJohnson.id,
      raterId: cpSsmith.id,
      seniorRaterId: sfcWilliams.id,
      effectiveDate: DEMO_ASSIGNMENT_START,
    },
  });

  // Chain 3: 1LT Torres (rated) → CPT Smith (rater) → SFC Williams (sr)
  const torresChain = await prisma.ratingChain.upsert({
    where: { id: "dev-chain-torres" },
    update: {},
    create: {
      id: "dev-chain-torres",
      ratedSoldierId: ltTorres.id,
      raterId: cpSsmith.id,
      seniorRaterId: sfcWilliams.id,
      effectiveDate: DEMO_ASSIGNMENT_START,
    },
  });

  await Promise.all([
    ensurePublishedAssignment({ id: "demo-assignment-davis-2026", ratedSoldierId: sgtDavis.id, raterId: ssgJohnson.id, seniorRaterId: sfcWilliams.id, unitId: unit.id, ratingSchemeId: ratingScheme.id, formCategory: "NCOER", createdByUserId: cpSsmith.id }),
    ensurePublishedAssignment({ id: "demo-assignment-johnson-2026", ratedSoldierId: ssgJohnson.id, raterId: cpSsmith.id, seniorRaterId: sfcWilliams.id, unitId: unit.id, ratingSchemeId: ratingScheme.id, formCategory: "NCOER", createdByUserId: cpSsmith.id }),
    ensurePublishedAssignment({ id: "demo-assignment-torres-2026", ratedSoldierId: ltTorres.id, raterId: cpSsmith.id, seniorRaterId: majLee.id, unitId: unit.id, ratingSchemeId: ratingScheme.id, formCategory: "OER", createdByUserId: cpSsmith.id }),
  ]);

  // ── Support Form — SGT Davis ───────────────────────────────────
  const davisSupportForm = await prisma.supportForm.upsert({
    where: { id: "dev-sf-davis" },
    update: {
      ratingChainId: davisChain.id,
      evalCategory: "NCOER",
      entries: {
        deleteMany: {},
        create: [
          {
            section: "CHARACTER",
            entryType: "ACCOMPLISHMENT",
            rawText:
              "Maintained exemplary conduct and integrity throughout rating period; served as model NCO for company and received zero adverse action.",
            tags: ["integrity", "values"],
            isHighlight: true,
            counseled: true,
            counseledDate: new Date("2024-09-10"),
          },
          {
            section: "PRESENCE",
            entryType: "ACCOMPLISHMENT",
            rawText:
              "Scored 540 on ACFT; successfully completed Air Assault school as honor graduate, demonstrating physical fitness and military competence.",
            tags: ["acft", "airborne"],
            isHighlight: true,
            counseled: true,
            counseledDate: new Date("2024-12-09"),
          },
          {
            section: "INTELLECT",
            entryType: "ACCOMPLISHMENT",
            rawText:
              "Completed advanced leadership training ahead of peers; applied lessons to improve squad execution of complex battle drills and tactical movements.",
            tags: ["training", "intellect"],
            isHighlight: false,
            counseled: true,
            counseledDate: new Date("2024-09-10"),
          },
          {
            section: "LEADS",
            entryType: "ACCOMPLISHMENT",
            rawText:
              "Led 4-Soldier team with zero UCMJ incidents; consistently met or exceeded all operational requirements; commanded respect through professionalism and competence.",
            tags: ["leadership", "discipline"],
            isHighlight: true,
            counseled: true,
            counseledDate: new Date("2025-03-12"),
          },
          {
            section: "DEVELOPS",
            entryType: "ACCOMPLISHMENT",
            rawText:
              "Mentored two junior soldiers on technical and leadership skills; both soldiers advanced in position and demonstrated significant skill development.",
            tags: ["mentorship", "development"],
            isHighlight: false,
            counseled: true,
            counseledDate: new Date("2024-12-09"),
          },
          {
            section: "CHARACTER",
            entryType: "OBJECTIVE",
            rawText:
              "Improve squad discipline and performance; achieve 95% pass rate on next PT test.",
            tags: ["discipline", "fitness"],
            isHighlight: false,
            counseled: false,
          },
          {
            section: "LEADS",
            entryType: "OBJECTIVE",
            rawText:
              "Achieve promotion to Staff Sergeant and complete Squad Leader Course.",
            tags: ["promotion", "leadership"],
            isHighlight: false,
            counseled: false,
          },
        ],
      },
    },
    create: {
      id: "dev-sf-davis",
      soldierId: sgtDavis.id,
      ratingChainId: davisChain.id,
      evalCategory: "NCOER",
      ratingPeriodStart: new Date("2024-06-01"),
      ratingPeriodEnd: new Date("2025-05-31"),
      dutyTitle: "Team Leader",
      dutyMosc: "11B2O",
      dailyDutiesScope:
        "4 Soldiers, team equipment, and crew-served weapons. Responsible for training, leadership, and readiness of assigned personnel.",
      areasOfEmphasis:
        "Air assault proficiency, ACFT performance above 500, leadership development, combat readiness.",
      soldierGoals:
        "Complete promotion board preparation, attend advanced leadership course, develop two junior leaders.",
      entries: {
        create: [
          {
            section: "CHARACTER",
            entryType: "ACCOMPLISHMENT",
            rawText:
              "Maintained exemplary conduct and integrity throughout rating period; served as model NCO for company and received zero adverse action.",
            tags: ["integrity", "values"],
            isHighlight: true,
            counseled: true,
            counseledDate: new Date("2024-09-10"),
          },
          {
            section: "PRESENCE",
            entryType: "ACCOMPLISHMENT",
            rawText:
              "Scored 540 on ACFT; successfully completed Air Assault school as honor graduate, demonstrating physical fitness and military competence.",
            tags: ["acft", "airborne"],
            isHighlight: true,
            counseled: true,
            counseledDate: new Date("2024-12-09"),
          },
          {
            section: "INTELLECT",
            entryType: "ACCOMPLISHMENT",
            rawText:
              "Completed advanced leadership training ahead of peers; applied lessons to improve squad execution of complex battle drills and tactical movements.",
            tags: ["training", "intellect"],
            isHighlight: false,
            counseled: true,
            counseledDate: new Date("2024-09-10"),
          },
          {
            section: "LEADS",
            entryType: "ACCOMPLISHMENT",
            rawText:
              "Led 4-Soldier team with zero UCMJ incidents; consistently met or exceeded all operational requirements; commanded respect through professionalism and competence.",
            tags: ["leadership", "discipline"],
            isHighlight: true,
            counseled: true,
            counseledDate: new Date("2025-03-12"),
          },
          {
            section: "DEVELOPS",
            entryType: "ACCOMPLISHMENT",
            rawText:
              "Mentored two junior soldiers on technical and leadership skills; both soldiers advanced in position and demonstrated significant skill development.",
            tags: ["mentorship", "development"],
            isHighlight: false,
            counseled: true,
            counseledDate: new Date("2024-12-09"),
          },
          {
            section: "CHARACTER",
            entryType: "OBJECTIVE",
            rawText:
              "Improve squad discipline and performance; achieve 95% pass rate on next PT test.",
            tags: ["discipline", "fitness"],
            isHighlight: false,
            counseled: false,
          },
          {
            section: "LEADS",
            entryType: "OBJECTIVE",
            rawText:
              "Achieve promotion to Staff Sergeant and complete Squad Leader Course.",
            tags: ["promotion", "leadership"],
            isHighlight: false,
            counseled: false,
          },
        ],
      },
    },
  });

  // ── TEST NCOER — SGT Davis (DRAFT) ────────────────────────────
  const davisEval = await prisma.evaluation.upsert({
    where: { id: "dev-eval-davis" },
    update: {},
    create: {
      id: "dev-eval-davis",
      ratingChainId: davisChain.id,
      supportFormId: davisSupportForm.id,
      formType: "NCOER_9_1",
      status: "DRAFT",
      periodStart: new Date("2024-06-01"),
      periodEnd: new Date("2025-05-31"),
      ratedMonths: 12,
      nonRatedMonths: 0,
      reasonForSubmission: "Annual",
      statusCode: "00",
      numberOfEnclosures: 0,
      principalDutyTitle: "Team Leader",
      dutyMosc: "11B2O",
      dailyDutiesScope:
        "Leads, trains, and maintains a 4-Soldier infantry team equipped with M4/M249. Responsible for individual and collective readiness, weapons qualification, PT standards, and welfare of assigned personnel.",
      areasOfSpecialEmphasis:
        "Air assault operations, small unit tactics, ACFT performance, and subordinate leader development.",
      appointedDuties:
        "Squad SHARP representative; assistant armorer (secondary). Performed duties in good faith throughout rating period.",
      successiveAssignment1: "Squad Leader, light infantry company",
      successiveAssignment2: "Advanced Leader Course attendance",
      broadeningAssignment: "Drill Sergeant, Initial Entry Training",
      seniorRaterRating: "HIGHLY_QUALIFIED",
      acftPassFail: "Pass",
      acftDate: new Date("2024-08-15"),
      heightInches: 70,
      weightLbs: 185,
      withinWeightStandard: true,
    },
  });

  console.log(
    "✅ Seed complete: 5 dev personas + 3 rating chains + 1 test evaluation"
  );
  console.log(
    "  Users: CPT Smith, SSG Johnson, SGT Davis, 1LT Torres, SFC Williams"
  );
  console.log(
    "  Chains: Davis (SSG Johnson rater, SFC Williams SR), Johnson, Torres"
  );
  console.log("  Evaluation: dev-eval-davis (DRAFT status, ready for rater)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
