import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const johnsonCurrentBullets: Record<string, string[]> = {
  CHARACTER: [
    "modeled disciplined leadership during platoon live-fire preparation and reinforced standards for 9 junior Soldiers",
    "maintained accountability of sensitive items across 6 field training events with zero losses or late reports",
  ],
  PRESENCE: [
    "scored 548 on the ACFT and led squad fitness sessions that improved team average by 37 points",
    "sustained calm, professional presence during battalion inspection and corrected deficiencies before the final walk-through",
  ],
  INTELLECT: [
    "built a squad training tracker that identified 14 certification gaps before deployment validation",
    "adapted battle-drill rehearsals after AAR feedback and reduced repeat deficiencies across 3 iterations",
  ],
  LEADS: [
    "led 12 squad-level rehearsals that improved platoon readiness and enabled on-time certification for the field exercise",
    "coached two team leaders through counseling packets, training plans, and promotion-board preparation",
  ],
  DEVELOPS: [
    "developed two SPCs into confident team-leader candidates through weekly hip-pocket training and written feedback",
    "created a peer-coaching rhythm that raised weapons qualification first-time-go rate from 76 percent to 91 percent",
  ],
  ACHIEVES: [
    "completed all assigned pre-deployment readiness tasks 11 days early while maintaining 100 percent squad accountability",
    "delivered 18 certified Soldiers for battalion validation and supported a no-notice equipment layout with zero shortages",
  ],
};

const davisCompleteBullets: Record<string, string[]> = {
  CHARACTER: [
    "upheld Army Values while leading a four-Soldier team through 8 field training days with zero accountability failures",
    "accepted corrective feedback during AARs and turned it into measurable improvement in squad battle-drill execution",
  ],
  PRESENCE: [
    "earned a 572 ACFT score and used personal fitness planning to raise two team members above 500",
    "maintained composure during high-tempo ranges and set the example for equipment discipline and field hygiene",
  ],
  INTELLECT: [
    "built a simple PCC/PCI checklist that reduced missed pre-combat checks during 4 consecutive rehearsals",
    "identified communications handoff friction during lanes and recommended a fix adopted by the squad leader",
  ],
  LEADS: [
    "led weekly battle-drill rehearsals for a four-Soldier team and improved inspection readiness before validation",
    "mentored a junior Soldier through promotion-board preparation, resulting in a successful recommendation packet",
  ],
  DEVELOPS: [
    "trained two Soldiers on weapons maintenance standards and reduced repeat deficiencies during arms-room inspection",
    "shared fieldcraft lessons after each exercise and improved team confidence before night operations",
  ],
  ACHIEVES: [
    "completed assigned team readiness tasks ahead of the platoon validation timeline with no missed suspenses",
    "supported company mission planning by preparing equipment, personnel, and rehearsals for 3 training events",
  ],
};

async function userId(email: string): Promise<string> {
  const user = await prisma.user.findUniqueOrThrow({ where: { email }, select: { id: true } });
  return user.id;
}

async function upsertSection(evaluationId: string, section: string, bullets: string[], completedById: string, binary: boolean) {
  await prisma.evalSection.upsert({
    where: { evaluationId_section: { evaluationId, section: section as never } },
    update: {
      ratingBinary: binary ? "MET_STANDARD" : null,
      ratingFourLevel: binary ? null : "EXCEEDED_STANDARD",
      finalBullets: bullets,
      isComplete: true,
      completedAt: new Date(),
      completedById,
    },
    create: {
      evaluationId,
      section: section as never,
      ratingBinary: binary ? "MET_STANDARD" : null,
      ratingFourLevel: binary ? null : "EXCEEDED_STANDARD",
      finalBullets: bullets,
      isComplete: true,
      completedAt: new Date(),
      completedById,
    },
  });
}

async function upsertComment(id: string, evaluationId: string, authorId: string, sectionKey: string, content: string) {
  await prisma.evalComment.upsert({
    where: { id },
    update: { evaluationId, authorId, createdByUserId: authorId, sectionKey: sectionKey as never, content, status: "OPEN" },
    create: { id, evaluationId, authorId, createdByUserId: authorId, sectionKey: sectionKey as never, content, status: "OPEN" },
  });
}

async function main() {
  const [smithId, johnsonId, leeId, williamsId] = await Promise.all([
    userId("peter.smith@army.mil"),
    userId("marcus.johnson@army.mil"),
    userId("jordan.lee@army.mil"),
    userId("robert.williams@army.mil"),
  ]);

  const johnsonEval = await prisma.evaluation.findUniqueOrThrow({ where: { id: "dashboard-eval-johnson-current" }, select: { id: true } });
  const davisEval = await prisma.evaluation.findUniqueOrThrow({ where: { id: "test-eval-davis-complete" }, select: { id: true } });

  await Promise.all(Object.entries(johnsonCurrentBullets).map(([section, bullets]) =>
    upsertSection(johnsonEval.id, section, bullets, smithId, false),
  ));
  await prisma.evaluation.update({ where: { id: johnsonEval.id }, data: { status: "RATER_IN_PROGRESS", seniorRaterRating: "HIGHLY_QUALIFIED" } });

  await Promise.all(Object.entries(davisCompleteBullets).map(([section, bullets]) =>
    upsertSection(davisEval.id, section, bullets, johnsonId, true),
  ));

  await Promise.all([
    upsertComment("dashboard-comment-johnson-rater-leads", johnsonEval.id, smithId, "LEADS", "Rater note: Johnson's squad rehearsals and coaching are the strongest evidence for Leads; keep the quantified readiness impact in the final narrative."),
    upsertComment("dashboard-comment-johnson-sr-overall", johnsonEval.id, leeId, "SENIOR_RATER_OVERALL", "Senior rater note: strong Exceeded Standard file; verify the rater bullets remain specific before signature."),
    upsertComment("dashboard-comment-davis-rater-leads", davisEval.id, johnsonId, "LEADS", "Rater note: Davis's battle-drill rehearsals and promotion-board mentorship are the strongest proof points for Leads."),
    upsertComment("dashboard-comment-davis-sr-overall", davisEval.id, williamsId, "SENIOR_RATER_OVERALL", "Senior rater note: Davis is ready for increased responsibility; retain the ACFT and readiness metrics in the final packet."),
  ]);

  console.log("Central NCOER demo content seeded for Smith, Johnson, and Davis.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
