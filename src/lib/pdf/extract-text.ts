type PdfParse = (buffer: Buffer) => Promise<{ text: string }>;

// pdf-parse v1 runs its package test harness when dynamically imported by
// tsx. CommonJS require loads it as a dependency and avoids that side effect.
const pdfParse = require("pdf-parse") as PdfParse;

export function sanitizeTextForStorage(text: string): string {
  return text
    .replace(/\u0000/g, "")
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim();
}

export async function extractPdfText(buffer: Buffer): Promise<string> {
  const result = await pdfParse(buffer);
  const text = sanitizeTextForStorage(result.text ?? "");
  if (!text) {
    throw new Error("The PDF contains no extractable text. Upload an image or use a text-based PDF.");
  }
  return text;
}