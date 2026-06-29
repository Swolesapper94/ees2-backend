import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Demo seed — realistic formation snapshot for EES 2.0 testing.
 *
 * Includes:
 *  - B Co, 2-504 PIR unit
 *  - 4 users: soldier (SGT), rater (SSG), senior rater (SFC), admin
 *  - Rating chains for both soldiers
 *  - Support forms with entries across all sections
 *  - Initial + quarterly counseling sessions
 *  - SGT Smith: COMPLETE NCOER_9_1 (all sections, bullets, signatures) — see what "done" looks like
 *  - SSG Jones:  PENDING_SENIOR_RATER NCOER_9_2 — mid-pipeline state
 *  - Senior rater profile data
 *
 * NOTE: supabaseId values are placeholders. Replace with real Supabase auth
 * user IDs once you have them (or run an admin script to link accounts).
 */
async function main() {
  // ── Unit ──────────────────────────────────────────────────────
  const unit = await prisma.unit.upsert({
    where: { uic: "WJ1AA0" },
    update: {},
    create: { name: "B Co, 2-504 PIR", uic: "WJ1AA0" },
  });

  // ── Users ─────────────────────────────────────────────────────
  const soldier = await prisma.user.upsert({
    where: { email: "james.smith@army.mil" },
    update: {},
    create: {
      supabaseId: "seed-soldier-smith",
      email: "james.smith@army.mil",
      firstName: "James",
      lastName: "Smith",
      rank: "SGT",
      mos: "11B",
      roles: ["SOLDIER"],
      unitId: unit.id,
    },
  });

  const rater = await prisma.user.upsert({
    where: { email: "robert.jones@army.mil" },
    update: {},
    create: {
      supabaseId: "seed-rater-jones",
      email: "robert.jones@army.mil",
      firstName: "Robert",
      lastName: "Jones",
      rank: "SSG",
      mos: "11B",
      roles: ["RATER", "SOLDIER"],
      unitId: unit.id,
    },
  });

  const seniorRater = await prisma.user.upsert({
    where: { email: "david.davis@army.mil" },
    update: {},
    create: {
      supabaseId: "seed-sr-davis",
      email: "david.davis@army.mil",
      firstName: "David",
      lastName: "Davis",
      rank: "SFC",
      mos: "11B",
      roles: ["SENIOR_RATER", "RATER"],
      unitId: unit.id,
    },
  });

  const admin = await prisma.user.upsert({
    where: { email: "patricia.brown@army.mil" },
    update: {},
    create: {
      supabaseId: "seed-admin-brown",
      email: "patricia.brown@army.mil",
      firstName: "Patricia",
      lastName: "Brown",
      rank: "SSG",
      mos: "42A",
      roles: ["ADMIN"],
      unitId: unit.id,
    },
  });

  // ── Rating Chains ─────────────────────────────────────────────
  const smithChain = await prisma.ratingChain.upsert({
    where: { id: "seed-chain-smith" },
    update: {},
    create: {
      id: "seed-chain-smith",
      ratedSoldierId: soldier.id,
      raterId: rater.id,
      seniorRaterId: seniorRater.id,
      effectiveDate: new Date("2024-06-01"),
    },
  });

  const jonesChain = await prisma.ratingChain.upsert({
    where: { id: "seed-chain-jones" },
    update: {},
    create: {
      id: "seed-chain-jones",
      ratedSoldierId: rater.id,
      raterId: seniorRater.id,
      seniorRaterId: seniorRater.id, // simplified for demo
      effectiveDate: new Date("2024-06-01"),
    },
  });

  // ── Counseling Sessions (SGT Smith) ───────────────────────────
  const counselingSessions = [
    {
      id: "seed-counsel-smith-initial",
      type: "INITIAL" as const,
      sessionDate: new Date("2024-06-14"),
      notes:
        "Counseled SGT Smith on rating period expectations, performance objectives, and NCOER criteria. Discussed ACFT goals (target 550+), air assault certification, and squad leader development track.",
      raterInitials: "RJ",
      soldierInitials: "JS",
    },
    {
      id: "seed-counsel-smith-q1",
      type: "QUARTERLY" as const,
      sessionDate: new Date("2024-09-10"),
      notes:
        "Q1 counseling complete. SGT Smith tracking to standard on all objectives. ACFT score 572 — above target. Recommend he begin mentoring SPC Williams for promotion board. No adverse information.",
      raterInitials: "RJ",
      soldierInitials: "JS",
    },
    {
      id: "seed-counsel-smith-q2",
      type: "QUARTERLY" as const,
      sessionDate: new Date("2024-12-09"),
      notes:
        "Q2 counseling complete. Combat deployment confirmed 08 JAN 2025. SGT Smith demonstrated exceptional performance during deployment workup. Succession planning initiated for squad.",
      raterInitials: "RJ",
      soldierInitials: "JS",
    },
    {
      id: "seed-counsel-smith-q3",
      type: "QUARTERLY" as const,
      sessionDate: new Date("2025-03-12"),
      notes:
        "Q3 counseling complete post-deployment. All combat objectives met or exceeded. Recommend immediate promotion and ALC attendance. Zero safety incidents during 22 combat patrols.",
      raterInitials: "RJ",
      soldierInitials: "JS",
    },
  ];

  for (const c of counselingSessions) {
    await prisma.counselingSession.upsert({
      where: { id: c.id },
      update: {},
      create: { ...c, ratingChainId: smithChain.id },
    });
  }

  // ── Support Form — SGT Smith ───────────────────────────────────
  const smithSupportForm = await prisma.supportForm.upsert({
    where: { id: "seed-sf-smith" },
    update: {},
    create: {
      id: "seed-sf-smith",
      soldierId: soldier.id,
      ratingPeriodStart: new Date("2024-06-01"),
      ratingPeriodEnd: new Date("2025-05-31"),
      dutyTitle: "Team Leader",
      dutyMosc: "11B2O",
      dailyDutiesScope:
        "4 Soldiers, individual weapons, NVGs, and crew-served weapon systems. Responsible for training, readiness, and welfare of Soldiers assigned.",
      areasOfEmphasis:
        "Air assault proficiency, ACFT performance above 500, combat patrol leadership, subordinate leader development.",
      soldierGoals:
        "Complete ALC, attend Ranger School, promote to SSG within 18 months. Develop SPC Williams as team second in command.",
      entries: {
        create: [
          {
            section: "CHARACTER",
            entryType: "ACCOMPLISHMENT",
            rawText:
              "Refused to falsify PT scores when pressured by peer NCO; reported to chain of command — preserved unit integrity and credibility with command.",
            tags: ["integrity", "values"],
            isHighlight: true,
            counseled: true,
            counseledDate: new Date("2024-09-10"),
          },
          {
            section: "CHARACTER",
            entryType: "ACCOMPLISHMENT",
            rawText:
              "Led by example across 180 days of combat operations; zero UCMJ incidents within team — set the standard for discipline in the platoon.",
            tags: ["discipline", "ucmj"],
            isHighlight: false,
            counseled: true,
            counseledDate: new Date("2025-03-12"),
          },
          {
            section: "PRESENCE",
            entryType: "ACCOMPLISHMENT",
            rawText:
              "Scored 572 on the ACFT (max 600); coached 2 Soldiers from failing scores to 480+ — improved squad average by 47 points over rating period.",
            tags: ["acft", "fitness"],
            isHighlight: true,
            counseled: true,
            counseledDate: new Date("2024-09-10"),
          },
          {
            section: "PRESENCE",
            entryType: "ACCOMPLISHMENT",
            rawText:
              "Maintained composure under direct fire contact during OBJ LION; calmly directed squad to covered positions and returned accurate fire — no casualties.",
            tags: ["combat", "presence"],
            isHighlight: false,
            counseled: false,
          },
          {
            section: "INTELLECT",
            entryType: "ACCOMPLISHMENT",
            rawText:
              "Graduated Army Basic Leader Course in top 10% of 42-student class; immediately applied lessons to restructure squad battle drills — adopted by platoon.",
            tags: ["blc", "leader-development"],
            isHighlight: true,
            counseled: true,
            counseledDate: new Date("2024-09-10"),
          },
          {
            section: "INTELLECT",
            entryType: "ACCOMPLISHMENT",
            rawText:
              "Self-studied conversational Pashto using DLIFLC resources; served as informal interpreter on 3 joint patrols — improved rapport with local security forces.",
            tags: ["language", "initiative"],
            isHighlight: false,
            counseled: false,
          },
          {
            section: "LEADS",
            entryType: "ACCOMPLISHMENT",
            rawText:
              "Led 4-Soldier element on 22 combat patrols covering 400km of terrain; zero Soldier casualties attributable to leader error across all operations.",
            tags: ["combat", "leadership"],
            isHighlight: true,
            counseled: true,
            counseledDate: new Date("2025-03-12"),
          },
          {
            section: "LEADS",
            entryType: "ACCOMPLISHMENT",
            rawText:
              "Mentored SPC Williams through promotion board preparation; Williams achieved Distinguished Honors and was promoted ahead of zone.",
            tags: ["mentorship", "development"],
            isHighlight: false,
            counseled: true,
            counseledDate: new Date("2024-12-09"),
          },
          {
            section: "DEVELOPS",
            entryType: "ACCOMPLISHMENT",
            rawText:
              "Established squad PT program with progressive periodization; sustained 100% ACFT pass rate and zero physical profile across all 4 Soldiers for 12 months.",
            tags: ["pt", "development"],
            isHighlight: false,
            counseled: true,
            counseledDate: new Date("2024-09-10"),
          },
          {
            section: "DEVELOPS",
            entryType: "ACCOMPLISHMENT",
            rawText:
              "Volunteered as platoon SHARP representative; conducted 4 training sessions and referred 1 Soldier to SARC — maintained a safe and professional environment.",
            tags: ["sharp", "volunteer"],
            isHighlight: false,
            counseled: false,
          },
          {
            section: "ACHIEVES",
            entryType: "ACCOMPLISHMENT",
            rawText:
              "Led air assault insertion onto OBJ LION; seized and held key terrain for 6 hours against 3 enemy probes — decisive action enabled company main effort.",
            tags: ["air-assault", "combat"],
            isHighlight: true,
            counseled: true,
            counseledDate: new Date("2025-03-12"),
          },
          {
            section: "ACHIEVES",
            entryType: "ACCOMPLISHMENT",
            rawText:
              "Maintained 98% equipment readiness across all assigned systems; zero deadline equipment reported to battalion during 12-month rating period.",
            tags: ["maintenance", "readiness"],
            isHighlight: false,
            counseled: false,
          },
          {
            section: "ACHIEVES",
            entryType: "ACCOMPLISHMENT",
            rawText:
              "Executed 3 sensitive site exploitation missions; collected intelligence directly contributing to 2 high-value target captures — acknowledged by brigade S2.",
            tags: ["intelligence", "combat"],
            isHighlight: true,
            counseled: true,
            counseledDate: new Date("2025-03-12"),
          },
        ],
      },
    },
  });

  // ── COMPLETE NCOER — SGT Smith (DA 2166-9-1) ─────────────────
  const smithEval = await prisma.evaluation.upsert({
    where: { id: "seed-eval-smith-complete" },
    update: {},
    create: {
      id: "seed-eval-smith-complete",
      ratingChainId: smithChain.id,
      supportFormId: smithSupportForm.id,
      formType: "NCOER_9_1",
      status: "COMPLETE",
      periodStart: new Date("2024-06-01"),
      periodEnd: new Date("2025-05-31"),
      ratedMonths: 12,
      nonRatedMonths: 0,
      reasonForSubmission: "Annual",
      statusCode: "00",
      numberOfEnclosures: 0,

      // Part III — Duty Description
      principalDutyTitle: "Team Leader",
      dutyMosc: "11B2O",
      dailyDutiesScope:
        "Leads, trains, and maintains a 4-Soldier infantry team equipped with M4/M249. Responsible for individual and collective readiness, weapons qualification, PT standards, and welfare of assigned personnel.",
      areasOfSpecialEmphasis:
        "Air assault operations, small unit tactics, ACFT performance, and subordinate leader development.",
      appointedDuties:
        "Squad SHARP representative; assistant armorer (secondary). Performed duties in good faith throughout rating period.",

      // Part V — Senior Rater succession
      successiveAssignment1: "Squad Leader, light infantry company",
      successiveAssignment2: "Advanced Leader Course attendance",
      broadeningAssignment: "Drill Sergeant, Initial Entry Training",

      seniorRaterRating: "HIGHLY_QUALIFIED",

      // ACFT data
      acftPassFail: "Pass",
      acftDate: new Date("2024-08-15"),
      heightInches: 70,
      weightLbs: 185,
      withinWeightStandard: true,
    },
  });

  // ── Evaluation Sections — SGT Smith ───────────────────────────
  const smithSections = [
    {
      section: "CHARACTER" as const,
      ratingBinary: "MET_STANDARD" as const,
      finalBullets: [
        "- Demonstrated uncompromising integrity; refused to falsify PT scores when pressured — preserved unit credibility and reported through chain of command",
        "- Led by example during 6-month combat deployment; zero UCMJ incidents within 4-Soldier team — set the standard for discipline in the platoon",
        "- Conducted weekly values counseling with junior Soldiers; 2 Soldiers selected for Audie Murphy Board — direct result of SGT Smith's mentorship",
      ],
      bulletSources: { "0": "AI_MODIFIED", "1": "HUMAN", "2": "HUMAN" },
    },
    {
      section: "PRESENCE" as const,
      ratingBinary: "MET_STANDARD" as const,
      finalBullets: [
        "- Scored 572 on the ACFT (max 600); maintained physical standard in combat environment — best score in squad for second consecutive year",
        "- Coached 2 Soldiers from failing ACFT scores to 480+; improved squad average by 47 points through individualized PT plans and accountability",
        "- Maintained bearing under direct fire contact during OBJ LION; calmly directed squad to covered positions and returned effective fire — zero casualties",
      ],
      bulletSources: { "0": "HUMAN", "1": "HUMAN", "2": "AI_MODIFIED" },
    },
    {
      section: "INTELLECT" as const,
      ratingBinary: "MET_STANDARD" as const,
      finalBullets: [
        "- Graduated Army BLC in top 10% of 42-student class; immediately applied lessons to squad battle drills — revised SOP adopted across platoon",
        "- Self-studied conversational Pashto via DLIFLC; served as informal interpreter on 3 joint patrols — improved rapport with host-nation security forces",
        "- Identified gap in squad 9-line MEDEVAC drill; wrote corrective TTP and rehearsed team to standard — no MEDEVAC delays during rating period",
      ],
      bulletSources: { "0": "HUMAN", "1": "HUMAN", "2": "AI_MODIFIED" },
    },
    {
      section: "LEADS" as const,
      ratingBinary: "MET_STANDARD" as const,
      finalBullets: [
        "- Led 4-Soldier element on 22 combat patrols covering 400km of terrain; zero Soldier casualties attributable to leader error across all operations",
        "- Mentored SPC Williams through promotion board preparation; Williams achieved Distinguished Honors and was promoted ahead of zone — SGT Smith's finest achievement",
        "- Coordinated with adjacent element to clear a 200-meter trench line; secured key terrain IAW commander's intent — enabled platoon freedom of maneuver",
      ],
      bulletSources: { "0": "HUMAN", "1": "HUMAN", "2": "HUMAN" },
    },
    {
      section: "DEVELOPS" as const,
      ratingBinary: "MET_STANDARD" as const,
      finalBullets: [
        "- Established progressive periodization PT program for squad; sustained 100% ACFT pass rate and zero physical profile across all 4 Soldiers for 12 months",
        "- Volunteered as platoon SHARP representative; conducted 4 training sessions and facilitated 1 SARC referral — maintained a safe and professional climate",
        "- Nominated SPC Williams for Audie Murphy Award; personally coached preparation — Williams accepted into AMC and distinguished program graduate",
      ],
      bulletSources: { "0": "AI_MODIFIED", "1": "HUMAN", "2": "HUMAN" },
    },
    {
      section: "ACHIEVES" as const,
      ratingBinary: "MET_STANDARD" as const,
      finalBullets: [
        "- Led air assault insertion onto OBJ LION; seized and held key terrain for 6 hours against 3 enemy probes — decisive action enabled company main effort to succeed",
        "- Maintained 98% equipment readiness across all assigned systems; zero deadline equipment during 12-month period — saved unit $4,200 in potential repair costs",
        "- Executed 3 sensitive site exploitation missions; collected intelligence contributing to 2 HVT captures — efforts acknowledged by brigade S2 section",
      ],
      bulletSources: { "0": "HUMAN", "1": "AI_MODIFIED", "2": "HUMAN" },
    },
    {
      section: "RATER_OVERALL" as const,
      ratingBinary: null,
      finalBullets: [
        "SGT Smith consistently exceeded the standard in every area of his performance throughout this rating period. His technical proficiency, personal courage, and genuine investment in his Soldiers make him one of the top performers in my formation. He has demonstrated the maturity and tactical competence of a staff sergeant and is ready for that responsibility now. Promote to SSG immediately and select for ALC without delay. I would proudly serve alongside SGT Smith in any assignment.",
      ],
      bulletSources: { "0": "HUMAN" },
    },
    {
      section: "SENIOR_RATER_OVERALL" as const,
      ratingBinary: null,
      finalBullets: [
        "SGT Smith is among the best junior NCOs I have rated in 14 years of service. His combat performance, leader development of subordinates, and relentless pursuit of self-improvement demonstrate the highest potential for continued success at the SSG level and beyond. I strongly recommend his immediate promotion, assignment to ALC, and subsequent attendance at the Ranger Course. He will be a future Platoon Sergeant and is a credit to the NCO Corps.",
      ],
      bulletSources: { "0": "HUMAN" },
    },
    {
      section: "SOLDIER_COMMENTS" as const,
      ratingBinary: null,
      finalBullets: [
        "I have been counseled on the contents of this evaluation and understand my ratings and the basis for them. I acknowledge receipt of this NCOER and will continue to pursue professional development and maintain the standards expected of an NCO in the United States Army.",
      ],
      bulletSources: { "0": "HUMAN" },
    },
  ];

  for (const s of smithSections) {
    await prisma.evalSection.upsert({
      where: {
        evaluationId_section: {
          evaluationId: smithEval.id,
          section: s.section,
        },
      },
      update: {},
      create: {
        evaluationId: smithEval.id,
        section: s.section,
        ratingBinary: s.ratingBinary,
        finalBullets: s.finalBullets,
        bulletSources: s.bulletSources,
        isComplete: true,
        completedAt: new Date("2025-06-02"),
      },
    });
  }

  // ── Signatures — SGT Smith eval ───────────────────────────────
  await prisma.signature.createMany({
    skipDuplicates: true,
    data: [
      {
        evaluationId: smithEval.id,
        userId: rater.id,
        role: "RATER",
        status: "SIGNED",
        signedAt: new Date("2025-06-02T10:14:00Z"),
      },
      {
        evaluationId: smithEval.id,
        userId: seniorRater.id,
        role: "SENIOR_RATER",
        status: "SIGNED",
        signedAt: new Date("2025-06-03T14:22:00Z"),
      },
      {
        evaluationId: smithEval.id,
        userId: soldier.id,
        role: "SOLDIER",
        status: "SIGNED",
        signedAt: new Date("2025-06-05T09:07:00Z"),
      },
    ],
  });

  // ── Senior Rater Profile ───────────────────────────────────────
  await prisma.seniorRaterProfile.upsert({
    where: { userId: seniorRater.id },
    update: {},
    create: {
      userId: seniorRater.id,
      profileData: {
        SGT: { MOST_QUALIFIED: 0, HIGHLY_QUALIFIED: 1, QUALIFIED: 2, NOT_QUALIFIED: 0 },
        SSG: { MOST_QUALIFIED: 1, HIGHLY_QUALIFIED: 2, QUALIFIED: 1, NOT_QUALIFIED: 0 },
      },
    },
  });

  // ── Support Form — SSG Jones ───────────────────────────────────
  const jonesSupportForm = await prisma.supportForm.upsert({
    where: { id: "seed-sf-jones" },
    update: {},
    create: {
      id: "seed-sf-jones",
      soldierId: rater.id,
      ratingPeriodStart: new Date("2024-06-01"),
      ratingPeriodEnd: new Date("2025-05-31"),
      dutyTitle: "Squad Leader",
      dutyMosc: "11B3O",
      dailyDutiesScope:
        "9 Soldiers, 3 crew-served weapon systems, and associated equipment. Responsible for collective readiness, training management, and welfare of assigned team leaders and their Soldiers.",
      entries: {
        create: [
          {
            section: "LEADS",
            entryType: "ACCOMPLISHMENT",
            rawText:
              "Planned and led 3-day live-fire exercise for 9-Soldier squad; achieved expert qualification for 100% of personnel — first squad to do so in the company.",
            tags: ["live-fire", "training"],
            isHighlight: true,
          },
          {
            section: "ACHIEVES",
            entryType: "ACCOMPLISHMENT",
            rawText:
              "Managed $180,000 in squad equipment with zero losses or FLIPL actions; maintained 97% readiness rate throughout 12-month period.",
            tags: ["equipment", "accountability"],
            isHighlight: true,
          },
          {
            section: "DEVELOPS",
            entryType: "ACCOMPLISHMENT",
            rawText:
              "Developed 2 team leaders (SGT Smith and SGT Harris) for promotion; both promoted within rating period — 100% success rate on promotion boards.",
            tags: ["development", "promotions"],
            isHighlight: false,
          },
        ],
      },
    },
  });

  // ── IN-PROGRESS NCOER — SSG Jones (DA 2166-9-2, pending SR) ──
  const jonesEval = await prisma.evaluation.upsert({
    where: { id: "seed-eval-jones-pending" },
    update: {},
    create: {
      id: "seed-eval-jones-pending",
      ratingChainId: jonesChain.id,
      supportFormId: jonesSupportForm.id,
      formType: "NCOER_9_2",
      status: "PENDING_SENIOR_RATER",
      periodStart: new Date("2024-06-01"),
      periodEnd: new Date("2025-05-31"),
      ratedMonths: 12,
      nonRatedMonths: 0,
      reasonForSubmission: "Annual",
      statusCode: "00",
      principalDutyTitle: "Squad Leader",
      dutyMosc: "11B3O",
      dailyDutiesScope:
        "Leads a 9-Soldier infantry squad with 3 crew-served weapon systems. Responsible for training, readiness, and welfare of 3 team leaders and their Soldiers.",
      acftPassFail: "Pass",
      acftDate: new Date("2024-08-15"),
      heightInches: 72,
      weightLbs: 210,
      withinWeightStandard: true,
    },
  });

  const jonesSections = [
    {
      section: "CHARACTER" as const,
      ratingFourLevel: "EXCEEDED_STANDARD" as const,
      finalBullets: [
        "- Embodied Army values in garrison and combat; refused to cut corners on weapons maintenance despite timeline pressure — equipment performed flawlessly in every operation",
        "- Championed unit's EO climate through personal example; zero EO complaints in squad during 12-month period — set benchmark for the company",
      ],
      isComplete: true,
    },
    {
      section: "PRESENCE" as const,
      ratingFourLevel: "EXCEEDED_STANDARD" as const,
      finalBullets: [
        "- Scored 549 on ACFT; set squad standard and drove 100% pass rate — highest squad average in the company for second consecutive year",
        "- Led from the front during 3 high-risk breaching operations; personal example drove squad performance under fire — 0 hesitation from any Soldier",
      ],
      isComplete: true,
    },
    {
      section: "INTELLECT" as const,
      ratingFourLevel: "EXCEEDED_STANDARD" as const,
      finalBullets: [
        "- Developed new range safety SOP adopted across the battalion; reduced range-related delays by 30% — saved 140 collective training hours over the year",
        "- Self-enrolled in online Operations Research course; applied probabilistic planning tools to squad rehearsals — recognized by company commander for innovation",
      ],
      isComplete: true,
    },
    {
      section: "LEADS" as const,
      ratingFourLevel: "FAR_EXCEEDED_STANDARD" as const,
      finalBullets: [
        "- Planned and led 3-day squad live-fire exercise; achieved expert qualification for 100% of 9 Soldiers — first squad in company history to do so",
        "- Developed 2 team leaders for promotion; SGT Smith and SGT Harris both promoted within period — 100% board success rate under SSG Jones's mentorship",
        "- Coordinated with adjacent platoon to execute a complex cordon-and-search; seized $2.1M in weapons cache — awarded Army Commendation Medal",
      ],
      isComplete: true,
    },
    {
      section: "DEVELOPS" as const,
      ratingFourLevel: "EXCEEDED_STANDARD" as const,
      finalBullets: [
        "- Created squad leader development program for his team leaders; 2 of 3 enrolled in ALC within rating period — highest rate in the platoon",
        "- Managed squad budget of $180,000 with zero FLIPL actions; maintained 97% equipment readiness — most fiscally responsible squad in the company",
      ],
      isComplete: true,
    },
    {
      section: "ACHIEVES" as const,
      ratingFourLevel: "FAR_EXCEEDED_STANDARD" as const,
      finalBullets: [
        "- Executed 28 combat patrols leading a 9-Soldier element; zero Soldier casualties from leader error — exemplary operational record over 6-month deployment",
        "- Maintained $180,000 in equipment at 97% readiness; zero deadline equipment or FLIPL actions — saved unit $12,000 in avoided repairs",
        "- Led cordon-and-search resulting in $2.1M weapons cache seizure; intelligence exploitation enabled 4 follow-on operations — recognized at brigade level",
      ],
      isComplete: true,
    },
    {
      section: "RATER_OVERALL" as const,
      ratingFourLevel: null,
      finalBullets: [
        "SSG Jones is an outstanding squad leader who consistently performs at the SFC level. His operational performance, leader development record, and genuine investment in his Soldiers make him one of the top two SSGs I have rated in my career. Promote to SFC immediately and select for the Senior Leaders Course. SSG Jones has the potential to be an exceptional Platoon Sergeant.",
      ],
      isComplete: true,
    },
  ];

  for (const s of jonesSections) {
    await prisma.evalSection.upsert({
      where: {
        evaluationId_section: {
          evaluationId: jonesEval.id,
          section: s.section,
        },
      },
      update: {},
      create: {
        evaluationId: jonesEval.id,
        section: s.section,
        ratingFourLevel: s.ratingFourLevel ?? undefined,
        finalBullets: s.finalBullets,
        bulletSources: Object.fromEntries(
          s.finalBullets.map((_, i) => [String(i), "HUMAN"]),
        ),
        isComplete: s.isComplete,
        completedAt: s.isComplete ? new Date("2025-06-01") : null,
      },
    });
  }

  // Rater signature only (PENDING_SENIOR_RATER = rater signed, SR hasn't yet)
  await prisma.signature.createMany({
    skipDuplicates: true,
    data: [
      {
        evaluationId: jonesEval.id,
        userId: seniorRater.id, // SFC Davis is the rater for SSG Jones in this demo
        role: "RATER",
        status: "SIGNED",
        signedAt: new Date("2025-06-01T16:45:00Z"),
      },
    ],
  });

  // ── Delta Phase-1 dev personas (matched to dev-login.ts DEV_PROFILES) ──
  const devUnit = await prisma.unit.upsert({
    where: { uic: "WB1AA0" },
    update: {},
    create: { id: "dev-unit-505", name: "B Co, 1-505 PIR, 82nd ABN", uic: "WB1AA0" },
  });

  const devPersonas = [
    {
      id: "dev-cpt-smith",
      supabaseId: "dev-cpt-smith",
      email: "peter.smith@army.mil",
      firstName: "Peter",
      lastName: "Smith",
      rank: "CPT" as const,
      mos: "11A",
      roles: ["SOLDIER", "RATER", "SENIOR_RATER", "COMMANDER"] as const,
    },
    {
      id: "dev-ssg-johnson",
      supabaseId: "dev-ssg-johnson",
      email: "marcus.johnson@army.mil",
      firstName: "Marcus",
      lastName: "Johnson",
      rank: "SSG" as const,
      mos: "11B",
      roles: ["SOLDIER", "RATER"] as const,
    },
    {
      id: "dev-sgt-davis",
      supabaseId: "dev-sgt-davis",
      email: "james.davis@army.mil",
      firstName: "James",
      lastName: "Davis",
      rank: "SGT" as const,
      mos: "11B",
      roles: ["SOLDIER"] as const,
    },
    {
      id: "dev-1lt-torres",
      supabaseId: "dev-1lt-torres",
      email: "maria.torres@army.mil",
      firstName: "Maria",
      lastName: "Torres",
      rank: "FIRST_LT" as const,
      mos: "11A",
      roles: ["SOLDIER", "RATER"] as const,
    },
    {
      id: "dev-sfc-williams",
      supabaseId: "dev-sfc-williams",
      email: "robert.williams@army.mil",
      firstName: "Robert",
      lastName: "Williams",
      rank: "SFC" as const,
      mos: "11B",
      roles: ["SOLDIER", "RATER", "SENIOR_RATER"] as const,
    },
  ];

  const devUsers: Record<string, { id: string }> = {};
  for (const p of devPersonas) {
    const u = await prisma.user.upsert({
      where: { email: p.email },
      update: { supabaseId: p.supabaseId, roles: [...p.roles] },
      create: { ...p, roles: [...p.roles], unitId: devUnit.id },
    });
    devUsers[p.id] = u;
  }

  // ── Dev Rating Chains — wire 5 personas into realistic formation ─
  // Chain 1: SGT Davis (rated) ← SSG Johnson (rater) ← SFC Williams (SR)
  await prisma.ratingChain.upsert({
    where: { id: "dev-chain-davis" },
    update: {},
    create: {
      id: "dev-chain-davis",
      ratedSoldierId: devUsers["dev-sgt-davis"]!.id,
      raterId: devUsers["dev-ssg-johnson"]!.id,
      seniorRaterId: devUsers["dev-sfc-williams"]!.id,
      effectiveDate: new Date("2025-06-01"),
    },
  });

  // Chain 2: SSG Johnson (rated) ← SFC Williams (rater) ← CPT Smith (SR)
  await prisma.ratingChain.upsert({
    where: { id: "dev-chain-johnson" },
    update: {},
    create: {
      id: "dev-chain-johnson",
      ratedSoldierId: devUsers["dev-ssg-johnson"]!.id,
      raterId: devUsers["dev-sfc-williams"]!.id,
      seniorRaterId: devUsers["dev-cpt-smith"]!.id,
      effectiveDate: new Date("2025-06-01"),
    },
  });

  // Chain 3: SFC Williams (rated) ← CPT Smith (rater + SR for demo)
  await prisma.ratingChain.upsert({
    where: { id: "dev-chain-williams" },
    update: {},
    create: {
      id: "dev-chain-williams",
      ratedSoldierId: devUsers["dev-sfc-williams"]!.id,
      raterId: devUsers["dev-cpt-smith"]!.id,
      seniorRaterId: devUsers["dev-cpt-smith"]!.id,
      effectiveDate: new Date("2025-06-01"),
    },
  });

  // Chain 4: 1LT Torres (rated, triggers supplementary review) ← CPT Smith (rater + SR)
  await prisma.ratingChain.upsert({
    where: { id: "dev-chain-torres" },
    update: {},
    create: {
      id: "dev-chain-torres",
      ratedSoldierId: devUsers["dev-1lt-torres"]!.id,
      raterId: devUsers["dev-cpt-smith"]!.id,
      seniorRaterId: devUsers["dev-cpt-smith"]!.id,
      effectiveDate: new Date("2025-06-01"),
    },
  });

  // Chain 5: CPT Smith (rated as soldier — has own OER)
  // Stub chain — rater/SR would be MAJ/LTC but we keep it self-referential for demo
  await prisma.ratingChain.upsert({
    where: { id: "dev-chain-smith" },
    update: {},
    create: {
      id: "dev-chain-smith",
      ratedSoldierId: devUsers["dev-cpt-smith"]!.id,
      raterId: devUsers["dev-cpt-smith"]!.id,       // stub — would be MAJ in real life
      seniorRaterId: devUsers["dev-cpt-smith"]!.id, // stub — would be LTC
      effectiveDate: new Date("2025-06-01"),
    },
  });

  // ── Dev Evaluation: SGT Davis — NCOER 9-1, RATER_IN_PROGRESS ──
  const davisEval = await prisma.evaluation.upsert({
    where: { id: "dev-eval-davis" },
    update: {},
    create: {
      id: "dev-eval-davis",
      ratingChainId: "dev-chain-davis",
      formType: "NCOER_9_1",
      status: "RATER_IN_PROGRESS",
      periodStart: new Date("2025-06-01"),
      periodEnd: new Date("2026-05-31"),
      ratedMonths: 12,
      nonRatedMonths: 0,
      reasonForSubmission: "Annual",
      principalDutyTitle: "Team Leader",
      dutyMosc: "11B2O",
      requiresSupplementaryReview: false,
    },
  });

  // 3 of 6 sections complete
  const davisSections = [
    { section: "CHARACTER" as const, ratingBinary: "MET_STANDARD" as const,
      finalBullets: ["- Maintained uncompromising integrity; zero UCMJ actions — set standard for squad"], isComplete: true },
    { section: "PRESENCE" as const, ratingBinary: "MET_STANDARD" as const,
      finalBullets: ["- Scored 521 ACFT; maintained physical readiness standard throughout rating period"], isComplete: true },
    { section: "INTELLECT" as const, ratingBinary: "MET_STANDARD" as const,
      finalBullets: ["- Completed 3 online military education modules; applied lessons to team battle drills"], isComplete: true },
    { section: "LEADS" as const, ratingBinary: null, finalBullets: [], isComplete: false },
    { section: "DEVELOPS" as const, ratingBinary: null, finalBullets: [], isComplete: false },
    { section: "ACHIEVES" as const, ratingBinary: null, finalBullets: [], isComplete: false },
  ];

  for (const s of davisSections) {
    await prisma.evalSection.upsert({
      where: { evaluationId_section: { evaluationId: davisEval.id, section: s.section } },
      update: {},
      create: {
        evaluationId: davisEval.id,
        section: s.section,
        ratingBinary: s.ratingBinary,
        finalBullets: s.finalBullets,
        bulletSources: Object.fromEntries(s.finalBullets.map((_, i) => [String(i), "HUMAN"])),
        isComplete: s.isComplete,
        completedAt: s.isComplete ? new Date("2026-06-01") : null,
      },
    });
  }

  // Milestones for Davis eval
  const { generateMilestones } = await import("../src/lib/milestones/generate");
  const davisMilestones = generateMilestones("dev-eval-davis", new Date("2025-06-01"), new Date("2026-05-31"));
  for (const m of davisMilestones) {
    await prisma.evalMilestone.upsert({
      where: { evaluationId_type: { evaluationId: m.evaluationId, type: m.type } },
      update: {},
      create: m,
    });
  }

  // ── Dev Evaluation: SSG Johnson — NCOER 9-2, DRAFT ───────────
  const johnsonEval = await prisma.evaluation.upsert({
    where: { id: "dev-eval-johnson" },
    update: {},
    create: {
      id: "dev-eval-johnson",
      ratingChainId: "dev-chain-johnson",
      formType: "NCOER_9_2",
      status: "DRAFT",
      periodStart: new Date("2025-06-01"),
      periodEnd: new Date("2026-05-31"),
      ratedMonths: 12,
      nonRatedMonths: 0,
      reasonForSubmission: "Annual",
      principalDutyTitle: "Squad Leader",
      dutyMosc: "11B3O",
      requiresSupplementaryReview: false,
    },
  });

  for (const sec of ["CHARACTER","PRESENCE","INTELLECT","LEADS","DEVELOPS","ACHIEVES"] as const) {
    await prisma.evalSection.upsert({
      where: { evaluationId_section: { evaluationId: johnsonEval.id, section: sec } },
      update: {},
      create: { evaluationId: johnsonEval.id, section: sec, finalBullets: [], bulletSources: {}, isComplete: false },
    });
  }

  const johnsonMilestones = generateMilestones("dev-eval-johnson", new Date("2025-06-01"), new Date("2026-05-31"));
  for (const m of johnsonMilestones) {
    await prisma.evalMilestone.upsert({
      where: { evaluationId_type: { evaluationId: m.evaluationId, type: m.type } },
      update: {},
      create: m,
    });
  }

  // eslint-disable-next-line no-console
  console.log("✅ Seed complete:");
  // eslint-disable-next-line no-console
  console.log(`   Unit:              ${unit.name} (${unit.uic})`);
  // eslint-disable-next-line no-console
  console.log(`   Users:             ${soldier.lastName}, ${rater.lastName}, ${seniorRater.lastName}, ${admin.lastName}`);
  // eslint-disable-next-line no-console
  console.log(`   COMPLETE eval:     ${smithEval.id} (SGT Smith — NCOER_9_1, all sections + signatures)`);
  // eslint-disable-next-line no-console
  console.log(`   IN-PROGRESS eval:  ${jonesEval.id} (SSG Jones — NCOER_9_2, PENDING_SENIOR_RATER)`);
  // eslint-disable-next-line no-console
  console.log(`   Dev personas:      ${devPersonas.map(p => p.email).join(", ")}`);
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
