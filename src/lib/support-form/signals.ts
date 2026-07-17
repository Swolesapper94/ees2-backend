import { differenceInDays } from "date-fns";
import { env } from "@/config/env";
import { prisma } from "@/lib/prisma";

const QUALIFYING_ARTIFACT_SECTIONS = new Set(["ACHIEVES", "INTELLECT", "LEADS", "DEVELOPS"]);

export type DocumentationSignals = {
  density: "LOW" | "MODERATE" | "HIGH" | null;
  counselingStatus: "ON_TIME" | "LATE" | "MISSED" | null;
  documentationEquityFlag: "LEADERSHIP_ENGAGEMENT" | "COMPENSATING_DOCUMENTATION" | null;
  raterContextNote: string | null;
  lateCluster: boolean | null;
  lowArtifactDensity: boolean | null;
};

export async function documentationSignalsForForm(formId: string): Promise<DocumentationSignals> {
  const form = await prisma.supportForm.findUnique({
    where: { id: formId },
    include: {
      entries: { include: { artifacts: true } },
      ratingChain: { include: { counselingSessions: true, evaluations: { select: { createdAt: true }, orderBy: { createdAt: "asc" }, take: 1 } } },
    },
  });
  if (!form) throw new Error("Support form not found");
  const referenceDate = form.ratingChain?.evaluations[0]?.createdAt ?? new Date();
  const daysElapsed = differenceInDays(referenceDate, form.initialCounselingDate ?? form.ratingPeriodStart);
  const accomplishments = form.entries.filter((entry) => entry.entryType === "ACCOMPLISHMENT");
  const monthsElapsed = Math.max(daysElapsed / 30.44, 1);
  const rate = accomplishments.length / monthsElapsed;
  const density = daysElapsed < 60 ? null : rate < env.documentationLowDensityPerMonth ? "LOW" : rate > env.documentationHighDensityPerMonth ? "HIGH" : "MODERATE";

  const initialCounseling = form.ratingChain?.counselingSessions.find((session) => session.type === "INITIAL");
  const initialDue = new Date(form.ratingPeriodStart.getTime() + 30 * 86_400_000);
  const counselingStatus = daysElapsed < 30 ? null : !initialCounseling ? "MISSED" : initialCounseling.sessionDate <= initialDue ? "ON_TIME" : "LATE";
  const documentationEquityFlag = density === "LOW" && (counselingStatus === "LATE" || counselingStatus === "MISSED")
    ? "LEADERSHIP_ENGAGEMENT"
    : (density === "MODERATE" || density === "HIGH") && (counselingStatus === "LATE" || counselingStatus === "MISSED")
      ? "COMPENSATING_DOCUMENTATION"
      : null;

  const lateWindowStart = new Date(referenceDate.getTime() - env.lateClusterDays * 86_400_000);
  const lateCluster = accomplishments.length < 4 ? null : accomplishments.filter((entry) => entry.entryDate >= lateWindowStart).length / accomplishments.length * 100 >= env.lateClusterPercent;
  const qualifyingEntries = accomplishments.filter((entry) => QUALIFYING_ARTIFACT_SECTIONS.has(entry.section));
  const artifactFreePercent = qualifyingEntries.length === 0 ? 0 : qualifyingEntries.filter((entry) => entry.artifacts.length === 0).length / qualifyingEntries.length * 100;
  const lowArtifactDensity = qualifyingEntries.length < 5 ? null : artifactFreePercent > env.lowArtifactDensityPercent;

  return { density, counselingStatus, documentationEquityFlag, raterContextNote: form.raterContextNote, lateCluster, lowArtifactDensity };
}