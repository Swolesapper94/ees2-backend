import { PrismaClient, type Rank, type SoldierCategory } from "@prisma/client";

const prisma = new PrismaClient();
const day = 86_400_000;
const now = new Date();

function daysFromNow(offset: number): Date {
  return new Date(now.getTime() + offset * day);
}

interface FixtureUser {
  id: string;
  rank: Rank;
  category: SoldierCategory;
  email: string;
}

interface HistoryFixture {
  id: string;
  assignmentId: string;
  chainId: string;
  ratedSoldier: FixtureUser;
  rater: FixtureUser;
  seniorRater: FixtureUser;
  periodStart: Date;
  periodEnd: Date;
  status: "ACCEPTED" | "RETURNED";
  submittedAt: Date;
  acceptedAt?: Date;
  seniorRaterRating: "MOST_QUALIFIED" | "HIGHLY_QUALIFIED" | "QUALIFIED";
}

async function loadUser(email: string): Promise<FixtureUser> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { email },
    select: { id: true, rank: true, category: true, email: true },
  });
  if (!user.category) throw new Error(`User ${email} is missing SoldierCategory.`);
  return user as FixtureUser;
}

async function upsertHistoryEvaluation(fixture: HistoryFixture, unitId: string) {
  const chain = await prisma.ratingChain.upsert({
    where: { id: fixture.chainId },
    update: {
      ratedSoldierId: fixture.ratedSoldier.id,
      raterId: fixture.rater.id,
      seniorRaterId: fixture.seniorRater.id,
      reviewerId: null,
      effectiveDate: fixture.periodStart,
      endDate: fixture.periodEnd,
      isActive: false,
    },
    create: {
      id: fixture.chainId,
      ratedSoldierId: fixture.ratedSoldier.id,
      raterId: fixture.rater.id,
      seniorRaterId: fixture.seniorRater.id,
      effectiveDate: fixture.periodStart,
      endDate: fixture.periodEnd,
      isActive: false,
    },
  });

  const assignment = await prisma.ratingSchemeAssignment.upsert({
    where: { id: fixture.assignmentId },
    update: {
      ratedSoldierId: fixture.ratedSoldier.id,
      raterId: fixture.rater.id,
      seniorRaterId: fixture.seniorRater.id,
      unitId,
      formCategory: "NCOER",
      effectiveFrom: fixture.periodStart,
      effectiveTo: fixture.periodEnd,
      status: "PUBLISHED",
      requiresSupplementaryReview: false,
      approvedByUserId: fixture.rater.id,
      approvedAt: fixture.periodStart,
      publishedByUserId: fixture.rater.id,
      publishedAt: fixture.periodStart,
      createdByUserId: fixture.rater.id,
    },
    create: {
      id: fixture.assignmentId,
      ratedSoldierId: fixture.ratedSoldier.id,
      raterId: fixture.rater.id,
      seniorRaterId: fixture.seniorRater.id,
      unitId,
      formCategory: "NCOER",
      effectiveFrom: fixture.periodStart,
      effectiveTo: fixture.periodEnd,
      status: "PUBLISHED",
      requiresSupplementaryReview: false,
      approvedByUserId: fixture.rater.id,
      approvedAt: fixture.periodStart,
      publishedByUserId: fixture.rater.id,
      publishedAt: fixture.periodStart,
      createdByUserId: fixture.rater.id,
    },
  });

  const evaluation = await prisma.evaluation.upsert({
    where: { id: fixture.id },
    update: {
      ratingChainId: chain.id,
      formType: "NCOER_9_2",
      status: fixture.status,
      disposition: "ACTIVE",
      periodStart: fixture.periodStart,
      periodEnd: fixture.periodEnd,
      ratedMonths: 12,
      reasonForSubmission: "Annual",
      principalDutyTitle: "Squad Leader",
      dailyDutiesScope: "Leads and trains assigned Soldiers, manages readiness, and executes unit missions.",
      seniorRaterRating: fixture.seniorRaterRating,
      submittedAt: fixture.submittedAt,
      acceptedAt: fixture.acceptedAt ?? null,
      createdAt: new Date(fixture.submittedAt.getTime() - 30 * day),
    },
    create: {
      id: fixture.id,
      ratingChainId: chain.id,
      formType: "NCOER_9_2",
      status: fixture.status,
      disposition: "ACTIVE",
      periodStart: fixture.periodStart,
      periodEnd: fixture.periodEnd,
      ratedMonths: 12,
      reasonForSubmission: "Annual",
      principalDutyTitle: "Squad Leader",
      dailyDutiesScope: "Leads and trains assigned Soldiers, manages readiness, and executes unit missions.",
      seniorRaterRating: fixture.seniorRaterRating,
      submittedAt: fixture.submittedAt,
      acceptedAt: fixture.acceptedAt ?? null,
      createdAt: new Date(fixture.submittedAt.getTime() - 30 * day),
    },
  });

  await prisma.evaluationRatingSnapshot.upsert({
    where: { evaluationId: evaluation.id },
    update: {},
    create: {
      evaluationId: evaluation.id,
      ratingSchemeAssignmentId: assignment.id,
      ratedSoldierId: fixture.ratedSoldier.id,
      raterId: fixture.rater.id,
      seniorRaterId: fixture.seniorRater.id,
      ratedRank: fixture.ratedSoldier.rank,
      ratedCategory: fixture.ratedSoldier.category,
      raterRank: fixture.rater.rank,
      raterCategory: fixture.rater.category,
      seniorRaterRank: fixture.seniorRater.rank,
      seniorRaterCategory: fixture.seniorRater.category,
      formCategory: "NCOER",
      ratedGrade: fixture.ratedSoldier.rank,
    },
  });

  await prisma.evalSection.createMany({
    data: ["CHARACTER", "PRESENCE", "INTELLECT", "LEADS", "DEVELOPS", "ACHIEVES"].map((section) => ({
      evaluationId: evaluation.id,
      section: section as never,
      ratingFourLevel: section === "CHARACTER" ? null : "EXCEEDED_STANDARD",
      ratingBinary: section === "CHARACTER" ? "MET_STANDARD" : null,
      finalBullets: [`Demonstrated sustained ${section.toLowerCase()} performance with measurable mission impact.`],
      isComplete: true,
      completedAt: fixture.submittedAt,
      completedById: fixture.rater.id,
    })),
    skipDuplicates: true,
  });

  await prisma.signature.createMany({
    data: [
      { evaluationId: evaluation.id, userId: fixture.rater.id, role: "RATER", status: "SIGNED", signedAt: daysFromNow(-240) },
      { evaluationId: evaluation.id, userId: fixture.seniorRater.id, role: "SENIOR_RATER", status: "SIGNED", signedAt: daysFromNow(-238) },
      { evaluationId: evaluation.id, userId: fixture.ratedSoldier.id, role: "SOLDIER", status: "SIGNED", signedAt: daysFromNow(-235) },
    ],
    skipDuplicates: true,
  });

  await Promise.all([
    prisma.signature.update({
      where: { evaluationId_role: { evaluationId: evaluation.id, role: "RATER" } },
      data: { status: "SIGNED", signedAt: new Date(fixture.submittedAt.getTime() - 15 * day) },
    }),
    prisma.signature.update({
      where: { evaluationId_role: { evaluationId: evaluation.id, role: "SENIOR_RATER" } },
      data: { status: "SIGNED", signedAt: new Date(fixture.submittedAt.getTime() - 10 * day) },
    }),
    prisma.signature.update({
      where: { evaluationId_role: { evaluationId: evaluation.id, role: "SOLDIER" } },
      data: { status: "SIGNED", signedAt: new Date(fixture.submittedAt.getTime() - 7 * day) },
    }),
  ]);

  return evaluation;
}

async function main() {
  const [smith, johnson, davis, lee, unit] = await Promise.all([
    loadUser("peter.smith@army.mil"),
    loadUser("marcus.johnson@army.mil"),
    loadUser("james.davis@army.mil"),
    loadUser("jordan.lee@army.mil"),
    prisma.unit.findUniqueOrThrow({ where: { uic: "W8A0AA" }, select: { id: true } }),
  ]);

  // Three accepted reports where CPT Smith is rater populate HRC trend,
  // processing time, velocity, returns denominator, and due-date analytics.
  const smithRaterFixtures: HistoryFixture[] = [
    {
      id: "dashboard-eval-johnson-accepted-1",
      assignmentId: "dashboard-assignment-johnson-history-1",
      chainId: "dashboard-chain-johnson-history-1",
      ratedSoldier: johnson,
      rater: smith,
      seniorRater: lee,
      periodStart: daysFromNow(-1070),
      periodEnd: daysFromNow(-800),
      status: "ACCEPTED",
      submittedAt: daysFromNow(-210),
      acceptedAt: daysFromNow(-198),
      seniorRaterRating: "HIGHLY_QUALIFIED",
    },
    {
      id: "dashboard-eval-johnson-accepted-2",
      assignmentId: "dashboard-assignment-johnson-history-2",
      chainId: "dashboard-chain-johnson-history-2",
      ratedSoldier: johnson,
      rater: smith,
      seniorRater: lee,
      periodStart: daysFromNow(-799),
      periodEnd: daysFromNow(-570),
      status: "ACCEPTED",
      submittedAt: daysFromNow(-130),
      acceptedAt: daysFromNow(-115),
      seniorRaterRating: "MOST_QUALIFIED",
    },
    {
      id: "dashboard-eval-johnson-accepted-3",
      assignmentId: "dashboard-assignment-johnson-history-3",
      chainId: "dashboard-chain-johnson-history-3",
      ratedSoldier: johnson,
      rater: smith,
      seniorRater: lee,
      periodStart: daysFromNow(-569),
      periodEnd: daysFromNow(-341),
      status: "ACCEPTED",
      submittedAt: daysFromNow(-45),
      acceptedAt: daysFromNow(-31),
      seniorRaterRating: "HIGHLY_QUALIFIED",
    },
    {
      id: "dashboard-eval-johnson-returned",
      assignmentId: "dashboard-assignment-johnson-history-4",
      chainId: "dashboard-chain-johnson-history-4",
      ratedSoldier: johnson,
      rater: smith,
      seniorRater: lee,
      periodStart: daysFromNow(-1430),
      periodEnd: daysFromNow(-1071),
      status: "RETURNED",
      submittedAt: daysFromNow(-95),
      seniorRaterRating: "QUALIFIED",
    },
  ];

  const smithSeniorRaterFixtures: HistoryFixture[] = [
    {
      id: "dashboard-eval-davis-sr-1",
      assignmentId: "dashboard-assignment-davis-sr-history-1",
      chainId: "dashboard-chain-davis-sr-history-1",
      ratedSoldier: davis,
      rater: johnson,
      seniorRater: smith,
      periodStart: daysFromNow(-1120),
      periodEnd: daysFromNow(-790),
      status: "ACCEPTED",
      submittedAt: daysFromNow(-205),
      acceptedAt: daysFromNow(-191),
      seniorRaterRating: "MOST_QUALIFIED",
    },
    {
      id: "dashboard-eval-davis-sr-2",
      assignmentId: "dashboard-assignment-davis-sr-history-2",
      chainId: "dashboard-chain-davis-sr-history-2",
      ratedSoldier: davis,
      rater: johnson,
      seniorRater: smith,
      periodStart: daysFromNow(-789),
      periodEnd: daysFromNow(-450),
      status: "ACCEPTED",
      submittedAt: daysFromNow(-125),
      acceptedAt: daysFromNow(-110),
      seniorRaterRating: "HIGHLY_QUALIFIED",
    },
  ];

  const historicalEvaluations = [];
  for (const fixture of [...smithRaterFixtures, ...smithSeniorRaterFixtures]) {
    historicalEvaluations.push(await upsertHistoryEvaluation(fixture, unit.id));
  }

  const returned = historicalEvaluations.find((evaluation) => evaluation.id === "dashboard-eval-johnson-returned")!;
  const existingReturn = await prisma.evaluationReturn.findFirst({ where: { evaluationId: returned.id } });
  if (!existingReturn) {
    await prisma.evaluationReturn.create({
      data: {
        evaluationId: returned.id,
        returnReason: "ADMIN_ERROR",
        notes: "Dashboard fixture: administrative data correction required.",
      },
    });
  }

  // Current active chain is intentionally due within 30 days and has a
  // partially complete counseling history so the dashboard has active work.
  const currentStart = daysFromNow(-90);
  const currentEnd = daysFromNow(25);
  const currentChain = await prisma.ratingChain.upsert({
    where: { id: "dashboard-chain-johnson-current" },
    update: {
      ratedSoldierId: johnson.id,
      raterId: smith.id,
      seniorRaterId: lee.id,
      effectiveDate: currentStart,
      endDate: null,
      isActive: true,
    },
    create: {
      id: "dashboard-chain-johnson-current",
      ratedSoldierId: johnson.id,
      raterId: smith.id,
      seniorRaterId: lee.id,
      effectiveDate: currentStart,
    },
  });

  const currentAssignment = await prisma.ratingSchemeAssignment.upsert({
    where: { id: "dashboard-assignment-johnson-current" },
    update: {
      ratedSoldierId: johnson.id,
      raterId: smith.id,
      seniorRaterId: lee.id,
      unitId: unit.id,
      formCategory: "NCOER",
      effectiveFrom: currentStart,
      effectiveTo: null,
      status: "PUBLISHED",
      requiresSupplementaryReview: false,
      approvedByUserId: smith.id,
      approvedAt: currentStart,
      publishedByUserId: smith.id,
      publishedAt: currentStart,
      createdByUserId: smith.id,
    },
    create: {
      id: "dashboard-assignment-johnson-current",
      ratedSoldierId: johnson.id,
      raterId: smith.id,
      seniorRaterId: lee.id,
      unitId: unit.id,
      formCategory: "NCOER",
      effectiveFrom: currentStart,
      status: "PUBLISHED",
      requiresSupplementaryReview: false,
      approvedByUserId: smith.id,
      approvedAt: currentStart,
      publishedByUserId: smith.id,
      publishedAt: currentStart,
      createdByUserId: smith.id,
    },
  });

  const currentEvaluation = await prisma.evaluation.upsert({
    where: { id: "dashboard-eval-johnson-current" },
    update: {
      ratingChainId: currentChain.id,
      status: "RATER_IN_PROGRESS",
      disposition: "ACTIVE",
      periodStart: currentStart,
      periodEnd: currentEnd,
      ratedMonths: 12,
      reasonForSubmission: "Annual",
      principalDutyTitle: "Squad Leader",
      dailyDutiesScope: "Leads and trains a squad, maintains readiness, and executes company missions.",
      createdAt: currentStart,
    },
    create: {
      id: "dashboard-eval-johnson-current",
      ratingChainId: currentChain.id,
      formType: "NCOER_9_2",
      status: "RATER_IN_PROGRESS",
      disposition: "ACTIVE",
      periodStart: currentStart,
      periodEnd: currentEnd,
      ratedMonths: 12,
      reasonForSubmission: "Annual",
      principalDutyTitle: "Squad Leader",
      dailyDutiesScope: "Leads and trains a squad, maintains readiness, and executes company missions.",
      createdAt: currentStart,
    },
  });

  await prisma.evaluationRatingSnapshot.upsert({
    where: { evaluationId: currentEvaluation.id },
    update: {},
    create: {
      evaluationId: currentEvaluation.id,
      ratingSchemeAssignmentId: currentAssignment.id,
      ratedSoldierId: johnson.id,
      raterId: smith.id,
      seniorRaterId: lee.id,
      ratedRank: johnson.rank,
      ratedCategory: johnson.category,
      raterRank: smith.rank,
      raterCategory: smith.category,
      seniorRaterRank: lee.rank,
      seniorRaterCategory: lee.category,
      formCategory: "NCOER",
      ratedGrade: johnson.rank,
    },
  });

  await prisma.evalSection.createMany({
    data: ["CHARACTER", "PRESENCE", "INTELLECT", "LEADS", "DEVELOPS", "ACHIEVES"].map((section, index) => ({
      evaluationId: currentEvaluation.id,
      section: section as never,
      ratingBinary: section === "CHARACTER" ? "MET_STANDARD" : null,
      ratingFourLevel: section === "CHARACTER" ? null : "EXCEEDED_STANDARD",
      finalBullets: index < 3 ? [`Completed current-period ${section.toLowerCase()} objective with documented impact.`] : [],
      isComplete: index < 3,
      completedAt: index < 3 ? daysFromNow(-15) : null,
      completedById: index < 3 ? smith.id : null,
    })),
    skipDuplicates: true,
  });

  await prisma.evalMilestone.createMany({
    data: [
      { evaluationId: currentEvaluation.id, type: "INITIAL_COUNSELING_DUE", status: "COMPLETE", dueDate: daysFromNow(-310), completedAt: daysFromNow(-312) },
      { evaluationId: currentEvaluation.id, type: "QUARTERLY_COUNSELING_1", status: "COMPLETE", dueDate: daysFromNow(-250), completedAt: daysFromNow(-251) },
      { evaluationId: currentEvaluation.id, type: "QUARTERLY_COUNSELING_2", status: "COMPLETE", dueDate: daysFromNow(-160), completedAt: daysFromNow(-158) },
      { evaluationId: currentEvaluation.id, type: "QUARTERLY_COUNSELING_3", status: "OVERDUE", dueDate: daysFromNow(-70) },
      { evaluationId: currentEvaluation.id, type: "RATER_SECTION_DUE", status: "UPCOMING", dueDate: daysFromNow(11) },
      { evaluationId: currentEvaluation.id, type: "SENIOR_RATER_DUE", status: "UPCOMING", dueDate: daysFromNow(18) },
      { evaluationId: currentEvaluation.id, type: "SOLDIER_ACK_DUE", status: "UPCOMING", dueDate: daysFromNow(22) },
      { evaluationId: currentEvaluation.id, type: "EVAL_SUBMISSION_DUE", status: "UPCOMING", dueDate: currentEnd },
    ],
    skipDuplicates: true,
  });

  console.log("Dashboard analytics fixture ready for CPT Smith: accepted history, a returned report, senior-rater profile history, a due-soon current report, and counseling milestones.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
