import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const testPeriodStart = new Date("2026-07-01T00:00:00.000Z");
const testPeriodEnd = new Date("2027-06-30T00:00:00.000Z");
const partIvSections = ["CHARACTER", "PRESENCE", "INTELLECT", "LEADS", "DEVELOPS", "ACHIEVES"] as const;

async function retainOneAvailableFixtureForm(prefix: string, preferredId: string) {
  const forms = await prisma.supportForm.findMany({
    where: {
      id: { startsWith: prefix },
      disposition: "ACTIVE",
      isActive: true,
      status: { notIn: ["CONSUMED", "ARCHIVED", "QUARANTINED"] },
      evaluations: { none: {} },
    },
    select: { id: true, ratingPeriodStart: true },
    orderBy: { ratingPeriodStart: "asc" },
  });
  if (forms.length < 2) return;
  const retained = forms.find((form) => form.id === preferredId) ?? forms[0]!;
  await prisma.supportForm.updateMany({
    where: { id: { in: forms.filter((form) => form.id !== retained.id).map((form) => form.id) } },
    data: { isActive: false },
  });
  console.log(`Deactivated redundant ${prefix} fixture forms; retained ${retained.id}.`);
}

async function main() {
  const unit = await prisma.unit.upsert({
    where: { uic: "DEV-505" },
    update: {},
    create: { name: "Dev Test Unit", uic: "DEV-505" },
  });

  const users = await Promise.all([
    prisma.user.upsert({
      where: { email: "avery.quinn@army.mil" },
      update: { category: "OFFICER", roles: ["SOLDIER", "ADMIN"], unitId: unit.id },
      create: { id: "dev-admin-quinn", supabaseId: "dev-admin-quinn", email: "avery.quinn@army.mil", firstName: "Avery", lastName: "Quinn", rank: "CPT", category: "OFFICER", mos: "42B", roles: ["SOLDIER", "ADMIN"], unitId: unit.id },
    }),
    prisma.user.upsert({
      where: { email: "morgan.reed@army.mil" },
      update: { category: "OFFICER", roles: ["SOLDIER", "REVIEWER", "COMMANDER"], unitId: unit.id },
      create: { id: "dev-reviewer-reed", supabaseId: "dev-reviewer-reed", email: "morgan.reed@army.mil", firstName: "Morgan", lastName: "Reed", rank: "LTC", category: "OFFICER", mos: "11A", roles: ["SOLDIER", "REVIEWER", "COMMANDER"], unitId: unit.id },
    }),
    prisma.user.update({ where: { email: "james.davis@army.mil" }, data: { category: "NCO" } }),
    prisma.user.update({ where: { email: "marcus.johnson@army.mil" }, data: { category: "NCO" } }),
    prisma.user.update({ where: { email: "robert.williams@army.mil" }, data: { category: "NCO" } }),
    prisma.user.update({ where: { email: "maria.torres@army.mil" }, data: { category: "OFFICER" } }),
    prisma.user.update({ where: { email: "peter.smith@army.mil" }, data: { category: "OFFICER" } }),
    prisma.user.update({ where: { email: "jordan.lee@army.mil" }, data: { category: "OFFICER" } }),
  ]);
  const [admin, reviewer, davis, johnson, williams, torres, smith, lee] = users;

  await prisma.battalionCommandAssignment.updateMany({
    where: { battalionId: unit.id, status: "ACTIVE", commanderUserId: { not: reviewer.id } },
    data: { status: "ENDED", effectiveTo: new Date() },
  });
  await prisma.battalionCommandAssignment.upsert({
    where: { id: "test-battalion-command-reed" },
    update: { battalionId: unit.id, commanderUserId: reviewer.id, status: "ACTIVE", effectiveFrom: testPeriodStart, effectiveTo: null },
    create: { id: "test-battalion-command-reed", battalionId: unit.id, commanderUserId: reviewer.id, status: "ACTIVE", effectiveFrom: testPeriodStart },
  });

  const [davisChain, torresChain] = await Promise.all([
    prisma.ratingChain.upsert({
      where: { id: "test-chain-davis-2026" },
      update: { ratedSoldierId: davis.id, raterId: johnson.id, seniorRaterId: williams.id, reviewerId: reviewer.id, effectiveDate: testPeriodStart, endDate: null, isActive: true },
      create: { id: "test-chain-davis-2026", ratedSoldierId: davis.id, raterId: johnson.id, seniorRaterId: williams.id, reviewerId: reviewer.id, effectiveDate: testPeriodStart },
    }),
    prisma.ratingChain.upsert({
      where: { id: "test-chain-torres-2026" },
      update: { ratedSoldierId: torres.id, raterId: smith.id, seniorRaterId: lee.id, reviewerId: null, effectiveDate: testPeriodStart, endDate: null, isActive: true },
      create: { id: "test-chain-torres-2026", ratedSoldierId: torres.id, raterId: smith.id, seniorRaterId: lee.id, effectiveDate: testPeriodStart },
    }),
  ]);

  const [davisAssignment, torresAssignment] = await Promise.all([
    prisma.ratingSchemeAssignment.upsert({
      where: { id: "test-assignment-davis-2026" },
      update: { ratedSoldierId: davis.id, raterId: johnson.id, seniorRaterId: williams.id, supplementaryReviewerId: reviewer.id, unitId: unit.id, formCategory: "NCOER", effectiveFrom: testPeriodStart, effectiveTo: null, status: "PUBLISHED", requiresSupplementaryReview: true, approvedByUserId: admin.id, approvedAt: testPeriodStart, publishedByUserId: admin.id, publishedAt: testPeriodStart, createdByUserId: admin.id },
      create: { id: "test-assignment-davis-2026", ratedSoldierId: davis.id, raterId: johnson.id, seniorRaterId: williams.id, supplementaryReviewerId: reviewer.id, unitId: unit.id, formCategory: "NCOER", effectiveFrom: testPeriodStart, status: "PUBLISHED", requiresSupplementaryReview: true, approvedByUserId: admin.id, approvedAt: testPeriodStart, publishedByUserId: admin.id, publishedAt: testPeriodStart, createdByUserId: admin.id },
    }),
    prisma.ratingSchemeAssignment.upsert({
      where: { id: "test-assignment-torres-2026" },
      update: { ratedSoldierId: torres.id, raterId: smith.id, seniorRaterId: lee.id, supplementaryReviewerId: null, unitId: unit.id, formCategory: "OER", effectiveFrom: testPeriodStart, effectiveTo: null, status: "PUBLISHED", requiresSupplementaryReview: false, approvedByUserId: admin.id, approvedAt: testPeriodStart, publishedByUserId: admin.id, publishedAt: testPeriodStart, createdByUserId: admin.id },
      create: { id: "test-assignment-torres-2026", ratedSoldierId: torres.id, raterId: smith.id, seniorRaterId: lee.id, unitId: unit.id, formCategory: "OER", effectiveFrom: testPeriodStart, status: "PUBLISHED", requiresSupplementaryReview: false, approvedByUserId: admin.id, approvedAt: testPeriodStart, publishedByUserId: admin.id, publishedAt: testPeriodStart, createdByUserId: admin.id },
    }),
  ]);

  await Promise.all([
    prisma.supportForm.upsert({
      where: { id: "test-sf-davis-2026" },
      update: {},
      create: { id: "test-sf-davis-2026", ratingChainId: davisChain.id, ratingSchemeAssignmentId: davisAssignment.id, soldierId: davis.id, evalCategory: "NCOER", ratingPeriodStart: testPeriodStart, ratingPeriodEnd: testPeriodEnd, dutyTitle: "Team Leader", dutyMosc: "11B2O", dailyDutiesScope: "Leads and trains a four-Soldier infantry team.", ssdNcoesMet: true, status: "FINALIZED", initiatedByUserId: davis.id, finalizedAt: testPeriodStart, completedAt: testPeriodStart, entries: { create: [{ section: "LEADS", entryType: "OBJECTIVE", rawText: "Improve team readiness through weekly battle-drill rehearsals.", tags: ["readiness"], createdByUserId: davis.id, authorRoleAtCreation: "RATED_SOLDIER" }, { section: "LEADS", entryType: "ACCOMPLISHMENT", rawText: "Led weekly battle-drill rehearsals for a four-Soldier team and improved inspection readiness.", tags: ["leadership"], createdByUserId: davis.id, authorRoleAtCreation: "RATED_SOLDIER" }] } },
    }),
    prisma.supportForm.upsert({
      where: { id: "test-sf-torres-2026" },
      update: {},
      create: { id: "test-sf-torres-2026", ratingChainId: torresChain.id, ratingSchemeAssignmentId: torresAssignment.id, soldierId: torres.id, evalCategory: "OER", ratingPeriodStart: testPeriodStart, ratingPeriodEnd: testPeriodEnd, dutyTitle: "Platoon Leader", dailyDutiesScope: "Leads a rifle platoon and manages training readiness.", status: "FINALIZED", initiatedByUserId: torres.id, finalizedAt: testPeriodStart, completedAt: testPeriodStart, entries: { create: [{ section: "LEADS", entryType: "OBJECTIVE", rawText: "Improve platoon collective training readiness before the next field exercise.", tags: ["readiness"], createdByUserId: torres.id, authorRoleAtCreation: "RATED_SOLDIER" }, { section: "LEADS", entryType: "ACCOMPLISHMENT", rawText: "Planned and executed platoon training that improved pre-deployment readiness.", tags: ["training"], createdByUserId: torres.id, authorRoleAtCreation: "RATED_SOLDIER" }] } },
    }),
  ]);

  await prisma.supportForm.updateMany({
    where: { id: "test-sf-torres-2026", consumedByEvaluationId: { not: null } },
    data: { isActive: false, status: "CONSUMED" },
  });

  const availableDavisForm = await prisma.supportForm.findFirst({
    where: {
      ratingSchemeAssignmentId: davisAssignment.id,
      disposition: "ACTIVE",
      isActive: true,
      status: { notIn: ["CONSUMED", "ARCHIVED", "QUARANTINED"] },
      evaluations: { none: {} },
    },
    select: { id: true },
  });
  if (!availableDavisForm) {
    const nextPeriodStart = new Date("2027-07-01T00:00:00.000Z");
    const nextPeriodEnd = new Date("2028-06-30T00:00:00.000Z");
    const supportForm = await prisma.supportForm.create({
      data: {
        id: `test-sf-davis-${Date.now()}`,
        ratingChainId: davisChain.id,
        ratingSchemeAssignmentId: davisAssignment.id,
        soldierId: davis.id,
        evalCategory: "NCOER",
        ratingPeriodStart: nextPeriodStart,
        ratingPeriodEnd: nextPeriodEnd,
        dutyTitle: "Team Leader",
        dutyMosc: "11B2O",
        dailyDutiesScope: "Leads and trains a four-Soldier infantry team.",
        ssdNcoesMet: true,
        status: "FINALIZED",
        initiatedByUserId: davis.id,
        finalizedAt: nextPeriodStart,
        completedAt: nextPeriodStart,
        entries: {
          create: [{
            section: "LEADS",
            entryType: "OBJECTIVE",
            rawText: "Improve team readiness through weekly battle-drill rehearsals.",
            tags: ["readiness"],
            createdByUserId: davis.id,
            authorRoleAtCreation: "RATED_SOLDIER",
          }],
        },
      },
      select: { id: true },
    });
    console.log(`Created fresh Davis support form for repeat testing: ${supportForm.id}`);
  }
  await retainOneAvailableFixtureForm("test-sf-davis-", "test-sf-davis-2026");
  const activeDavisForm = await prisma.supportForm.findFirstOrThrow({
    where: { ratingSchemeAssignmentId: davisAssignment.id, isActive: true, disposition: "ACTIVE", status: { notIn: ["CONSUMED", "ARCHIVED", "QUARANTINED"] }, evaluations: { none: {} } },
    orderBy: { createdAt: "desc" },
  });
  const activeDavisGoal = await prisma.goal.findFirst({ where: { supportFormId: activeDavisForm.id } });
  if (!activeDavisGoal) {
    await prisma.goal.create({
      data: {
        supportFormId: activeDavisForm.id,
        sectionKey: "LEADS",
        title: "Improve team readiness through weekly battle-drill rehearsals.",
        description: "Improve team readiness through weekly battle-drill rehearsals.",
        createdById: davis.id,
        createdByRole: "RATED_SOLDIER",
        approvalStatus: "APPROVED",
        approvedByRaterId: johnson.id,
        approvedAt: testPeriodStart,
      },
    });
  }

  const availableTorresForm = await prisma.supportForm.findFirst({
    where: {
      ratingSchemeAssignmentId: torresAssignment.id,
      disposition: "ACTIVE",
      isActive: true,
      status: { notIn: ["CONSUMED", "ARCHIVED", "QUARANTINED"] },
      evaluations: { none: {} },
    },
    select: { id: true },
  });
  if (!availableTorresForm) {
    const nextPeriodStart = new Date("2027-07-01T00:00:00.000Z");
    const nextPeriodEnd = new Date("2028-06-30T00:00:00.000Z");
    const supportForm = await prisma.supportForm.create({
      data: {
        id: `test-sf-torres-${Date.now()}`,
        ratingChainId: torresChain.id,
        ratingSchemeAssignmentId: torresAssignment.id,
        soldierId: torres.id,
        evalCategory: "OER",
        ratingPeriodStart: nextPeriodStart,
        ratingPeriodEnd: nextPeriodEnd,
        dutyTitle: "Platoon Leader",
        dailyDutiesScope: "Leads a rifle platoon and manages training readiness.",
        status: "FINALIZED",
        initiatedByUserId: torres.id,
        finalizedAt: nextPeriodStart,
        completedAt: nextPeriodStart,
        entries: {
          create: [{
            section: "LEADS",
            entryType: "OBJECTIVE",
            rawText: "Improve platoon collective training readiness before the next field exercise.",
            tags: ["readiness"],
            createdByUserId: torres.id,
            authorRoleAtCreation: "RATED_SOLDIER",
          }],
        },
      },
      select: { id: true },
    });
    console.log(`Created fresh Torres support form for repeat testing: ${supportForm.id}`);
  }
  await retainOneAvailableFixtureForm("test-sf-torres-", "test-sf-torres-2026");

  const completeDavisEvaluation = await prisma.evaluation.upsert({
    where: { id: "test-eval-davis-complete" },
    update: {
      ratingChainId: davisChain.id,
      supportFormId: null,
      formType: "NCOER_9_1",
      status: "COMPLETE",
      disposition: "ACTIVE",
      periodStart: testPeriodStart,
      periodEnd: testPeriodEnd,
      ratedMonths: 12,
      reasonForSubmission: "Annual",
      requiresSupplementaryReview: true,
      principalDutyTitle: "Team Leader",
      dutyMosc: "11B2O",
      dailyDutiesScope: "Leads and trains a four-Soldier infantry team.",
      seniorRaterRating: "HIGHLY_QUALIFIED",
    },
    create: {
      id: "test-eval-davis-complete",
      ratingChainId: davisChain.id,
      formType: "NCOER_9_1",
      status: "COMPLETE",
      periodStart: testPeriodStart,
      periodEnd: testPeriodEnd,
      ratedMonths: 12,
      reasonForSubmission: "Annual",
      requiresSupplementaryReview: true,
      principalDutyTitle: "Team Leader",
      dutyMosc: "11B2O",
      dailyDutiesScope: "Leads and trains a four-Soldier infantry team.",
      seniorRaterRating: "HIGHLY_QUALIFIED",
    },
  });
  await Promise.all(partIvSections.map((section) => prisma.evalSection.upsert({
    where: { evaluationId_section: { evaluationId: completeDavisEvaluation.id, section } },
    update: {
      ratingBinary: "MET_STANDARD",
      finalBullets: [`Maintained integrity and demonstrated documented ${section.toLowerCase()} performance.`],
      isComplete: true,
      completedAt: testPeriodEnd,
      completedById: johnson.id,
    },
    create: {
      evaluationId: completeDavisEvaluation.id,
      section,
      ratingBinary: "MET_STANDARD",
      finalBullets: [`Maintained integrity and demonstrated documented ${section.toLowerCase()} performance.`],
      isComplete: true,
      completedAt: testPeriodEnd,
      completedById: johnson.id,
    },
  })));
  await Promise.all([
    { role: "RATER" as const, userId: johnson.id },
    { role: "SENIOR_RATER" as const, userId: williams.id },
    { role: "SOLDIER" as const, userId: davis.id },
    { role: "REVIEWER" as const, userId: reviewer.id },
  ].map(({ role, userId }) => prisma.signature.upsert({
    where: { evaluationId_role: { evaluationId: completeDavisEvaluation.id, role } },
    update: { userId, status: "SIGNED", signedAt: testPeriodEnd, isStale: false },
    create: { evaluationId: completeDavisEvaluation.id, userId, role, status: "SIGNED", signedAt: testPeriodEnd },
  })));

  console.log("Workflow fixtures are ready: Davis NCOER with supplementary review and Torres OER with MAJ Lee as senior rater.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());