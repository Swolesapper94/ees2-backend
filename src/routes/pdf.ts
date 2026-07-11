import { Router } from "express";
import { prisma } from "@/lib/prisma";
import { asyncHandler, HttpError } from "@/middleware/error";
import { requireAuth } from "@/middleware/auth";
import { generateNCOERPDF } from "@/lib/pdf/generator";
import type { EvalPdfData } from "@/lib/pdf/NCOERTemplate";
import { requireEvalChainRole } from "@/lib/utils/chain-auth";

export const pdfRouter = Router();

// Workflow states that represent a genuinely finished evaluation (MVP audit
// 5.15) — anything else gets a watermarked "DRAFT" export instead of a
// clean, official-looking PDF.
const FINAL_STATUSES = new Set(["COMPLETE", "SUBMITTED", "ACCEPTED"]);

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
    if (!req.user) throw new HttpError(401, "Not authenticated");
    // Only members of this evaluation's rating chain (or an ADMIN) may
    // export its PDF — previously any authenticated user could download
    // any evaluation by ID (MVP audit 5.15).
    await requireEvalChainRole(req.params.id!, req.user, [
      "RATER",
      "SENIOR_RATER",
      "REVIEWER",
      "SOLDIER",
    ]);

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
    const isDraftPreview = !FINAL_STATUSES.has(evaluation.status);

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
      isDraftPreview,
    };

    const buffer = await generateNCOERPDF(data, evaluation.formType);

    // Audit the export (MVP audit 5.16 — previously PDF export was the one
    // major action with zero audit trail).
    await prisma.auditLog.create({
      data: {
        evaluationId: evaluation.id,
        actorId: req.user.id,
        action: "PDF_EXPORTED",
        entityType: "Evaluation",
        entityId: evaluation.id,
        metadata: { status: evaluation.status, isDraftPreview },
      },
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="NCOER_${soldier.lastName}_${fmt(evaluation.periodEnd)}.pdf"`,
    );
    res.send(buffer);
  }),
);
