import { Router } from "express";
import { prisma } from "@/lib/prisma";
import { asyncHandler, HttpError } from "@/middleware/error";
import { requireAuth } from "@/middleware/auth";
import { generateNCOERPDF } from "@/lib/pdf/generator";
import type { EvalPdfData } from "@/lib/pdf/NCOERTemplate";

export const pdfRouter = Router();

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

function ratingLabel(binary: string | null, fourLevel: string | null): string | null {
  return binary ?? fourLevel ?? null;
}

// GET /api/pdf/evaluations/:id — streams a generated NCOER PDF
pdfRouter.get(
  "/evaluations/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const evaluation = await prisma.evaluation.findUnique({
      where: { id: req.params.id },
      include: {
        sections: true,
        ratingChain: {
          include: { ratedSoldier: { include: { unit: true } }, rater: true, seniorRater: true },
        },
      },
    });
    if (!evaluation) throw new HttpError(404, "Evaluation not found");

    const soldier = evaluation.ratingChain.ratedSoldier;
    const rater = evaluation.ratingChain.rater;
    const sr = evaluation.ratingChain.seniorRater;

    const data: EvalPdfData = {
      formTitle: evaluation.formType,
      soldierName: `${soldier.lastName}, ${soldier.firstName}`,
      rank: soldier.rank,
      mos: soldier.mos,
      dutyTitle: evaluation.principalDutyTitle ?? "",
      unit: soldier.unit?.name ?? "",
      periodStart: fmt(evaluation.periodStart),
      periodEnd: fmt(evaluation.periodEnd),
      raterName: `${rater.rank} ${rater.lastName}`,
      seniorRaterName: `${sr.rank} ${sr.lastName}`,
      seniorRaterRating: evaluation.seniorRaterRating ?? null,
      sections: evaluation.sections.map((s) => ({
        section: s.section,
        rating: ratingLabel(s.ratingBinary, s.ratingFourLevel),
        bullets: s.finalBullets,
      })),
    };

    const buffer = await generateNCOERPDF(data, evaluation.formType);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="NCOER_${soldier.lastName}_${fmt(evaluation.periodEnd)}.pdf"`,
    );
    res.send(buffer);
  }),
);
