import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Clean minimal seed for dev testing.
 * Creates only the 5 dev personas matched to auth.ts DEV_USERS.
 */
async function main() {
  // ── Unit ──────────────────────────────────────────────────────
  const unit = await prisma.unit.upsert({
    where: { uic: "DEV-505" },
    update: {},
    create: { name: "Dev Test Unit", uic: "DEV-505" },
  });

  // ── 5-Persona Dev Users (matched to auth.ts DEV_USERS) ─────────
  const cpSsmith = await prisma.user.upsert({
    where: { email: "peter.smith@army.mil" },
    update: {},
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
    },
  });

  const ssgJohnson = await prisma.user.upsert({
    where: { email: "marcus.johnson@army.mil" },
    update: {},
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
    },
  });

  const sgtDavis = await prisma.user.upsert({
    where: { email: "james.davis@army.mil" },
    update: {},
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
    },
  });

  const ltTorres = await prisma.user.upsert({
    where: { email: "maria.torres@army.mil" },
    update: {},
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
    },
  });

  const sfcWilliams = await prisma.user.upsert({
    where: { email: "robert.williams@army.mil" },
    update: {},
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
      effectiveDate: new Date("2024-06-01"),
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
      effectiveDate: new Date("2024-06-01"),
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
      effectiveDate: new Date("2024-06-01"),
    },
  });

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
