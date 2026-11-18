import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type RGB } from "pdf-lib";
import QRCode from "qrcode";

export type CertificateData = {
  platformName: string;
  recipientName: string;
  courseTitle: string;
  issuedAt: Date;
  certificateNumber: string;
  verificationUrl: string;
  signatoryName: string;
  signatoryTitle: string;
  accentHex: string;
  sourceLine?: string | null;
};

/** Standard PDF fonts only cover WinAnsi; strip/transliterate anything else. */
function safe(text: string) {
  const latin1 = /^[\x20-\x7E\xA0-\xFF]$/;
  return Array.from(
    text
      .normalize("NFC")
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/[–—]/g, "-"),
  )
    .map((ch) =>
      latin1.test(ch)
        ? ch
        : // Outside Latin-1: try stripping diacritics (e.g. "ł" stays dropped, "ő" → "o").
          ch.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7E\xA0-\xFF]/g, ""),
    )
    .join("");
}

function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.replace("#", ""), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

function fitSize(font: PDFFont, text: string, maxWidth: number, start: number, min: number) {
  let size = start;
  while (size > min && font.widthOfTextAtSize(text, size) > maxWidth) size -= 1;
  return size;
}

function wrap(font: PDFFont, text: string, size: number, maxWidth: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(test, size) > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

export async function renderCertificatePdf(d: CertificateData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Certificate of Completion — ${safe(d.courseTitle)}`);
  pdf.setAuthor(safe(d.platformName));
  pdf.setSubject(`Certificate ${d.certificateNumber}`);
  pdf.setCreator(safe(d.platformName));

  const page = pdf.addPage([842, 595]); // A4 landscape
  const { width, height } = page.getSize();
  const accent = hexToRgb(d.accentHex);
  const ink = rgb(0.11, 0.12, 0.16);
  const muted = rgb(0.42, 0.44, 0.5);
  const hairline = rgb(0.86, 0.87, 0.9);

  const serif = await pdf.embedFont(StandardFonts.TimesRoman);
  const serifBold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const serifItalic = await pdf.embedFont(StandardFonts.TimesRomanItalic);
  const sans = await pdf.embedFont(StandardFonts.Helvetica);
  const sansBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  // Background & frame
  page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(1, 1, 1) });
  page.drawRectangle({ x: 0, y: height - 10, width, height: 10, color: accent });
  page.drawRectangle({ x: 28, y: 28, width: width - 56, height: height - 66, borderColor: hairline, borderWidth: 1 });
  page.drawRectangle({ x: 34, y: 34, width: width - 68, height: height - 78, borderColor: accent, borderWidth: 0.6, opacity: 0, borderOpacity: 0.5 });

  const center = (text: string, y: number, font: PDFFont, size: number, color = ink) => {
    const w = font.widthOfTextAtSize(text, size);
    page.drawText(text, { x: (width - w) / 2, y, size, font, color });
  };

  // Brand mark
  const platform = safe(d.platformName).toUpperCase();
  page.drawRectangle({ x: width / 2 - 13, y: height - 92, width: 26, height: 26, color: accent });
  // Layered "stack" glyph, matching the app logo.
  for (const [dy, op] of [[0, 1], [5, 0.75], [10, 0.5]] as const) {
    page.drawLine({ start: { x: width / 2 - 7, y: height - 72 - dy }, end: { x: width / 2, y: height - 75 - dy }, thickness: 1.4, color: rgb(1, 1, 1), opacity: op });
    page.drawLine({ start: { x: width / 2, y: height - 75 - dy }, end: { x: width / 2 + 7, y: height - 72 - dy }, thickness: 1.4, color: rgb(1, 1, 1), opacity: op });
  }
  center(platform, height - 118, sansBold, 11, accent);

  center("CERTIFICATE OF COMPLETION", height - 168, serifBold, 30);
  page.drawLine({ start: { x: width / 2 - 60, y: height - 184 }, end: { x: width / 2 + 60, y: height - 184 }, thickness: 1, color: accent });

  center("This is to certify that", height - 218, serifItalic, 14, muted);
  const name = safe(d.recipientName) || "Learner";
  center(name, height - 268, serifBold, fitSize(serifBold, name, width - 200, 40, 20));
  page.drawLine({ start: { x: width / 2 - 200, y: height - 282 }, end: { x: width / 2 + 200, y: height - 282 }, thickness: 0.6, color: hairline });

  center("has successfully completed the course", height - 312, serifItalic, 14, muted);
  const title = safe(d.courseTitle);
  const titleSize = fitSize(sansBold, title, (width - 220) * 2, 20, 13);
  const lines = wrap(sansBold, title, titleSize, width - 220).slice(0, 2);
  lines.forEach((l, i) => center(l, height - 345 - i * (titleSize + 6), sansBold, titleSize));
  if (d.sourceLine) center(safe(d.sourceLine).slice(0, 120), height - 345 - lines.length * (titleSize + 6) - 4, sans, 9, muted);

  // Footer: date | signature | QR
  const footerY = 92;
  const dateStr = d.issuedAt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  page.drawText(dateStr, { x: 80, y: footerY + 14, size: 13, font: serif, color: ink });
  page.drawLine({ start: { x: 80, y: footerY + 6 }, end: { x: 260, y: footerY + 6 }, thickness: 0.6, color: muted });
  page.drawText("Date of completion", { x: 80, y: footerY - 8, size: 9, font: sans, color: muted });

  const sigX = width / 2 - 100;
  page.drawText(safe(d.signatoryName), { x: sigX, y: footerY + 14, size: 15, font: serifItalic, color: ink });
  page.drawLine({ start: { x: sigX, y: footerY + 6 }, end: { x: sigX + 200, y: footerY + 6 }, thickness: 0.6, color: muted });
  page.drawText(safe(d.signatoryTitle), { x: sigX, y: footerY - 8, size: 9, font: sans, color: muted });

  const qrPng = await QRCode.toBuffer(d.verificationUrl, { margin: 0, width: 300, errorCorrectionLevel: "M" });
  const qr = await pdf.embedPng(qrPng);
  const qrSize = 74;
  const qrX = width - 80 - qrSize;
  page.drawImage(qr, { x: qrX, y: footerY - 10, width: qrSize, height: qrSize });
  page.drawText("Scan to verify", { x: qrX, y: footerY - 24, size: 8, font: sans, color: muted });

  // Certificate ID + verification URL
  page.drawText(`Certificate ID: ${d.certificateNumber}`, { x: 80, y: 50, size: 9, font: sansBold, color: ink });
  const vu = safe(d.verificationUrl);
  page.drawText(`Verify at ${vu}`, { x: 80, y: 38, size: 8, font: sans, color: muted, maxWidth: width - 260 });

  return pdf.save();
}
