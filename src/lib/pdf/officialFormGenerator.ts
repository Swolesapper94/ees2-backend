import { PDFDocument, PDFPage, rgb, StandardFonts } from "pdf-lib";
import type { EvalPdfData } from "./NCOERTemplate";

/**
 * Generate an official DA Form 2166-9-2 (NCO Evaluation Report) PDF
 * using pdf-lib for programmatic form generation.
 *
 * This creates the official form layout matching the DA Form 2166-9-2 structure
 * without relying on external template files.
 */
export async function generateOfficialNCOERPDF(
  data: EvalPdfData,
  _formType: string,
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]); // US Letter: 8.5" x 11"
  const { height } = page.getSize();

  // Fonts
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let y = height - 40;
  const leftMargin = 30;
  const rightMargin = 580;
  const lineHeight = 14;
  const sectionSpacing = 20;
  const fontSize = 10;
  const titleFontSize = 12;

  // Helper to draw text
  const drawText = (text: string, xPos: number, yPos: number, fSize = fontSize, bold = false) => {
    page.drawText(text, {
      x: xPos,
      y: yPos,
      size: fSize,
      font: bold ? helveticaBold : helvetica,
      color: rgb(0, 0, 0),
    });
  };

  // Helper to draw horizontal line
  const drawLine = (yPos: number) => {
    page.drawLine({
      start: { x: leftMargin, y: yPos },
      end: { x: rightMargin, y: yPos },
      thickness: 1,
      color: rgb(0, 0, 0),
    });
  };

  // HEADER
  drawText("HODA#", leftMargin, y, 9);
  drawText("DA FORM 2166-9-2, NOV 2015", 300, y, 9);
  drawText("Attachments Menu", rightMargin - 100, y, 9);
  y -= sectionSpacing;

  // FORM TITLE
  drawText("NCO EVALUATION REPORT (SSG-1SG/MSG)", leftMargin, y, titleFontSize, true);
  drawText("SEE PRIVACY ACT STATEMENT", rightMargin - 180, y, 9);
  y -= lineHeight;
  drawText("For use of this form, see AR 623-3; the proponent agency is DCS, G-1.", leftMargin, y, 9);
  drawText("IN AR 623-3", rightMargin - 100, y, 9);
  y -= sectionSpacing;

  // PART I: ADMINISTRATIVE DATA
  drawLine(y);
  y -= 2;
  drawText("PART I - ADMINISTRATIVE DATA", leftMargin, y, titleFontSize, true);
  y -= sectionSpacing;

  // Row 1: Soldier Name, SSN, Rank, Date of Rank, PMOSC
  drawText("a. NAME (Last, First, Middle Initial)", leftMargin, y, 9, true);
  drawText(data.soldierName, leftMargin + 150, y, 10);
  drawText("b. SSN or DOD ID No.", leftMargin + 350, y, 9, true);
  drawText("c. RANK", leftMargin + 450, y, 9, true);
  drawText(data.rank, leftMargin + 490, y, 10);
  drawText("e. PMOSC", rightMargin - 60, y, 9, true);
  y -= lineHeight;

  // Row 2: Unit, Status Code, UIC, Reason
  drawText("f. UNIT, ORG, STATION, ZIP CODE OR APO, MAJOR COMMAND", leftMargin, y, 9, true);
  drawText(data.unit, leftMargin + 200, y, 10);
  drawText("g. STATUS CODE", leftMargin + 380, y, 9, true);
  drawText("h. UIC", leftMargin + 450, y, 9, true);
  drawText("i. REASON FOR SUBMISSION", rightMargin - 100, y, 9, true);
  y -= sectionSpacing;

  // Period Covered & Months
  drawText("j. PERIOD COVERED", leftMargin, y, 9, true);
  drawText("FROM", leftMargin + 20, y - lineHeight, 9, true);
  drawText("THRU", leftMargin + 120, y - lineHeight, 9, true);
  drawText("k. RATED MONTHS", leftMargin + 200, y, 9, true);
  drawText(String(data.ratedMonths ?? 12), leftMargin + 220, y - lineHeight, 10);
  drawText("l. NONRATED CODES", leftMargin + 280, y, 9, true);
  drawText("m. NO OF ENCLOSURES", leftMargin + 400, y, 9, true);

  const [startMonth, startDay, startYear] = data.periodStart.split("-");
  const [endMonth, endDay, endYear] = data.periodEnd.split("-");
  drawText(`${startMonth}/${startDay}/${startYear}`, leftMargin + 20, y - lineHeight, 10);
  drawText(`${endMonth}/${endDay}/${endYear}`, leftMargin + 120, y - lineHeight, 10);

  drawText("n. RATED NCO'S EMAIL ADDRESS (.gov or .mil)", leftMargin, y - (lineHeight * 2), 9, true);
  y -= sectionSpacing + lineHeight;

  // PART II: AUTHENTICATION
  drawLine(y);
  y -= 2;
  drawText("PART II - AUTHENTICATION", leftMargin, y, titleFontSize, true);
  y -= sectionSpacing;

  drawText("a1. NAME OF RATER (Last, First, Middle Initial)", leftMargin, y, 9, true);
  drawText(data.raterName, leftMargin + 180, y, 10);
  drawText("a2. SSN (or DOD ID No.)", leftMargin + 380, y, 9, true);
  drawText("a3. RATER'S SIGNATURE", leftMargin + 480, y, 9, true);
  drawText("a4. DATE (YYYYMMDD)", rightMargin - 100, y, 9, true);
  y -= lineHeight;

  drawText("a5. RANK", leftMargin, y, 9, true);
  drawText("PMOSC/BRANCH", leftMargin + 80, y, 9, true);
  drawText("ORGANIZATION", leftMargin + 210, y, 9, true);
  drawText("DUTY ASSIGNMENT", leftMargin + 350, y, 9, true);
  drawText("a6. RATER'S EMAIL ADDRESS (.gov or .mil)", rightMargin - 150, y, 9, true);
  y -= sectionSpacing;

  drawText("b1. NAME OF SENIOR RATER (Last, First, Middle Initial)", leftMargin, y, 9, true);
  drawText(data.seniorRaterName, leftMargin + 210, y, 10);
  drawText("b2. SSN (or DOD ID No.)", leftMargin + 380, y, 9, true);
  drawText("b3. SENIOR RATER'S SIGNATURE", leftMargin + 480, y, 9, true);
  drawText("b4. DATE (YYYYMMDD)", rightMargin - 100, y, 9, true);
  y -= sectionSpacing;

  // PART III: DUTY DESCRIPTION
  drawLine(y);
  y -= 2;
  drawText("PART III - DUTY DESCRIPTION (Rater)", leftMargin, y, titleFontSize, true);
  y -= sectionSpacing;

  drawText("a. PRINCIPAL DUTY TITLE", leftMargin, y, 9, true);
  drawText(data.dutyTitle, leftMargin + 140, y, 10);
  drawText("b. DUTY MOSC", rightMargin - 100, y, 9, true);
  drawText(data.mos, rightMargin - 70, y, 10);
  y -= sectionSpacing;

  drawText("c. DAILY DUTIES AND SCOPE", leftMargin, y, 9, true);
  y -= lineHeight;
  // Multi-line duty description area
  const dutyDescription = data.dutyDescription || "(To include, as appropriate, people, equipment, facilities, and dollars)";
  const maxWidth = rightMargin - leftMargin - 20;
  const wrappedDuty = wrapText(dutyDescription, maxWidth);
  for (const line of wrappedDuty) {
    drawText(line, leftMargin + 20, y, fontSize);
    y -= lineHeight;
  }
  y -= sectionSpacing;

  // PART IV: PERFORMANCE EVALUATION
  drawLine(y);
  y -= 2;
  drawText("PART IV - PERFORMANCE EVALUATION, PROFESSIONALISM, ATTRIBUTES, AND COMPETENCIES (Rater)", leftMargin, y, titleFontSize, true);
  y -= sectionSpacing;

  // APFT Section
  drawText("a. APFT Pass/Fail/Profile:", leftMargin, y, 9, true);
  drawText("Date:", leftMargin + 150, y, 9);
  drawText("Height:", leftMargin + 200, y, 9);
  drawText("Weight:", leftMargin + 280, y, 9);
  drawText("Within Standard?", leftMargin + 380, y, 9);
  y -= sectionSpacing;

  // Evaluation sections
  const sections = [
    { key: "CHARACTER", label: "c. CHARACTER" },
    { key: "PRESENCE", label: "d. PRESENCE" },
    { key: "INTELLECT", label: "e. INTELLECT" },
    { key: "LEADS", label: "f. LEADS" },
    { key: "DEVELOPS", label: "g. DEVELOPS" },
    { key: "ACHIEVES", label: "h. ACHIEVES" },
  ];

  for (const section of sections) {
    drawText(section.label, leftMargin, y, 9, true);
    y -= lineHeight;

    const sectionData = data.sections.find((s) => s.section === section.key);
    if (sectionData) {
      drawText(`Rating: ${sectionData.rating || ""}`, leftMargin + 20, y, 9);
      y -= lineHeight;
      for (const bullet of sectionData.bullets.slice(0, 2)) {
        const wrappedBullet = wrapText(`• ${bullet}`, maxWidth - 20);
        for (const line of wrappedBullet) {
          drawText(line, leftMargin + 40, y, fontSize);
          y -= lineHeight;
        }
      }
    }
    y -= lineHeight;
  }

  // Overall Performance
  drawText("RATER OVERALL PERFORMANCE", leftMargin, y, 9, true);
  y -= lineHeight;
  drawText("Rating:", leftMargin + 20, y, 9);
  y -= sectionSpacing;

  // PART V: SENIOR RATER OVERALL POTENTIAL
  drawLine(y);
  y -= 2;
  drawText("PART V - SENIOR RATER OVERALL POTENTIAL", leftMargin, y, titleFontSize, true);
  y -= sectionSpacing;

  drawText("a. Senior Rater Overall Potential:", leftMargin, y, 9, true);
  drawText(`Rating: ${data.seniorRaterRating || ""}`, leftMargin + 200, y, 9);
  y -= sectionSpacing;

  // Footer
  drawText("DA FORM 2166-9-2, NOV 2015", leftMargin, 20, 9);
  drawText("Page 1 of 2", rightMargin - 60, 20, 9);

  // Draft watermark (simplified - pdf-lib doesn't support angle on text)
  if (data.isDraftPreview) {
    page.drawText("DRAFT", {
      x: 180,
      y: height / 2 - 30,
      size: 72,
      font: helveticaBold,
      color: rgb(0.8, 0.8, 0.8),
      opacity: 0.3,
    });
  }

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

/**
 * Simple text wrapping utility for multi-line content
 */
function wrapText(text: string, maxWidth: number, charsPerLine = 80): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    if ((currentLine + word).length > charsPerLine) {
      if (currentLine) lines.push(currentLine.trim());
      currentLine = word;
    } else {
      currentLine += (currentLine ? " " : "") + word;
    }
  }
  if (currentLine) lines.push(currentLine.trim());
  return lines;
}
