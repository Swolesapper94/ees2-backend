import { generateOfficialNCOERPDF } from "./officialFormGenerator";
import type { EvalPdfData } from "./NCOERTemplate";

const FORM_TITLES: Record<string, string> = {
  NCOER_9_1: "DA FORM 2166-9-1 — NCO EVALUATION REPORT (SGT)",
  NCOER_9_2: "DA FORM 2166-9-2 — NCO EVALUATION REPORT (SSG–1SG/MSG)",
  NCOER_9_3: "DA FORM 2166-9-3 — NCO EVALUATION REPORT (CSM/SGM)",
};

export async function generateNCOERPDF(
  data: EvalPdfData,
  formType: string,
): Promise<Buffer> {
  const withTitle: EvalPdfData = {
    ...data,
    formTitle: FORM_TITLES[formType] ?? data.formTitle,
  };
  // Use the official form generator with pdf-lib
  return generateOfficialNCOERPDF(withTitle, formType);
}
