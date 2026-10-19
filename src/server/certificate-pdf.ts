import "server-only";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { certificateParagraphs, type CertificateSnapshot } from "@/lib/certificate";

/** Characters the standard PDF fonts (WinAnsi) can draw; others are replaced. */
const safe = (s: string) => s.replace(/[’‘]/g, "'").replace(/[“”«»]/g, '"').replace(/[^\x20-\x7E -ÿ€œŒ]/g, "?");

function wrap(text: string, width: number, size: number, measure: (t: string, s: number) => number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (measure(next, size) > width && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** A4 PDF of a certificate, rebuilt from its archived snapshot (always identical). */
export async function certificatePdf(s: CertificateSnapshot): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Attestation de travail ${s.number}`);
  pdf.setAuthor(s.company.legalName);
  pdf.setCreator("GaragePro");
  const page = pdf.addPage([595.28, 841.89]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const measure = (t: string, size: number) => font.widthOfTextAtSize(t, size);
  const left = 64;
  const width = 595.28 - left * 2;
  let y = 780;

  // Letterhead (text only: the company's real details, no logo or stamp).
  page.drawText(safe(s.company.legalName), { x: left, y, size: 14, font: bold });
  y -= 16;
  for (const line of [s.company.address, [s.company.phone, s.company.email].filter(Boolean).join(" · "), s.company.taxId ? `MF : ${s.company.taxId}` : ""].filter(Boolean)) {
    page.drawText(safe(line), { x: left, y, size: 9, font, color: rgb(0.3, 0.3, 0.3) });
    y -= 12;
  }
  y -= 50;
  const title = "ATTESTATION DE TRAVAIL";
  page.drawText(title, { x: (595.28 - bold.widthOfTextAtSize(title, 18)) / 2, y, size: 18, font: bold });
  y -= 18;
  const ref = `N° ${s.number}`;
  page.drawText(ref, { x: (595.28 - font.widthOfTextAtSize(ref, 9)) / 2, y, size: 9, font, color: rgb(0.4, 0.4, 0.4) });
  y -= 50;

  for (const paragraph of certificateParagraphs(s)) {
    for (const line of wrap(safe(paragraph), width, 11.5, measure)) {
      page.drawText(line, { x: left, y, size: 11.5, font, lineHeight: 16 });
      y -= 17;
    }
    y -= 12;
  }

  y -= 20;
  const sig = `${s.company.repName} — ${s.company.repTitle}`;
  page.drawText(safe(sig), { x: 595.28 - left - font.widthOfTextAtSize(safe(sig), 10), y, size: 10, font });
  y -= 14;
  const label = "Signature et cachet";
  page.drawText(label, { x: 595.28 - left - font.widthOfTextAtSize(label, 9), y, size: 9, font, color: rgb(0.4, 0.4, 0.4) });
  // Empty frame for the handwritten signature and the stamp (never generated).
  page.drawRectangle({ x: 595.28 - left - 200, y: y - 100, width: 200, height: 90, borderColor: rgb(0.75, 0.75, 0.75), borderWidth: 0.6 });

  page.drawText(safe(`Document généré par GaragePro le ${s.issuedAt.slice(0, 10)} — valable uniquement signé et cacheté.`), { x: left, y: 40, size: 7.5, font, color: rgb(0.5, 0.5, 0.5) });
  return pdf.save();
}
