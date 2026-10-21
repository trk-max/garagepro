import "server-only";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { certificateText, frDate, type CertificateSnapshot } from "@/lib/certificate";

/** Characters the standard PDF fonts (WinAnsi) can draw; others are replaced. */
const safe = (s: string) => s.replace(/[’‘]/g, "'").replace(/[“”«»]/g, '"').replace(/[^\x20-\x7E -ÿ€œŒ—–]/g, "?");

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

/**
 * A4 PDF of a certificate, rebuilt from its archived snapshot (always identical).
 * Standard French layout: company block, recipient and place/date on the right,
 * subject, centred title, body with the two statements, "Fait à", signature
 * block. Only an EMPTY frame for the signature and stamp: never generated.
 */
export async function certificatePdf(s: CertificateSnapshot): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Attestation de travail ${s.number}`);
  pdf.setAuthor(s.company.legalName);
  pdf.setCreator("GaragePro");
  const W = 595.28;
  const page = pdf.addPage([W, 841.89]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const measure = (t: string, size: number) => font.widthOfTextAtSize(t, size);
  const left = 60;
  const width = W - left * 2;
  const right = W / 2 + 20;
  const txt = rgb(0.1, 0.1, 0.15);
  const grey = rgb(0.4, 0.4, 0.45);
  const t = certificateText(s);
  let y = 790;

  page.drawText("Attestation de travail", { x: left, y, size: 16, font: bold, color: txt });
  y -= 30;

  // Company (sender).
  for (const line of [s.company.legalName, s.company.address, [s.company.phone, s.company.email].filter(Boolean).join(" · "), s.company.taxId ? `Matricule fiscal : ${s.company.taxId}` : ""].filter(Boolean)) {
    for (const l of wrap(safe(line), W / 2 - left, 10, measure)) {
      page.drawText(l, { x: left, y, size: 10, font, color: txt });
      y -= 13;
    }
  }

  // Recipient (optional) and place/date, on the right.
  let ry = y - 12;
  if (s.recipient?.name) {
    for (const line of [s.recipient.name, ...(s.recipient.address ? s.recipient.address.split(/\r?\n/) : [])]) {
      for (const l of wrap(safe(line), W - right - left, 10, measure)) {
        page.drawText(l, { x: right, y: ry, size: 10, font, color: txt });
        ry -= 13;
      }
    }
    ry -= 10;
  }
  page.drawText(safe(`${s.company.city}, le ${frDate(s.issuedAt)}`), { x: right, y: ry, size: 10, font, color: txt });
  y = Math.min(y, ry) - 34;

  page.drawText(safe(t.subject), { x: left, y, size: 10.5, font, color: txt });
  y -= 36;

  const title = "ATTESTATION DE TRAVAIL";
  const tw = bold.widthOfTextAtSize(title, 14);
  page.drawText(title, { x: (W - tw) / 2, y, size: 14, font: bold, color: txt });
  page.drawLine({ start: { x: (W - tw) / 2, y: y - 3 }, end: { x: (W + tw) / 2, y: y - 3 }, thickness: 0.8, color: txt });
  y -= 15;
  const ref = `N° ${s.number}`;
  page.drawText(ref, { x: (W - font.widthOfTextAtSize(ref, 8.5)) / 2, y, size: 8.5, font, color: grey });
  y -= 30;

  const para = (text: string, indent = 0) => {
    for (const line of wrap(safe(text), width - indent, 11, measure)) {
      page.drawText(line, { x: left + indent, y, size: 11, font, color: txt });
      y -= 15.5;
    }
  };
  para(t.intro);
  y -= 6;
  for (const b of t.bullets) {
    page.drawText("-", { x: left, y, size: 11, font, color: txt });
    para(b, 12);
    y -= 2;
  }
  y -= 6;
  para(t.closing);
  y -= 18;
  para(t.madeAt);

  // Signature block (right): name, title, empty frame.
  y -= 30;
  page.drawText(safe(s.company.repName), { x: right, y, size: 10.5, font: bold, color: txt });
  y -= 14;
  page.drawText(safe(s.company.repTitle), { x: right, y, size: 10, font, color: txt });
  y -= 14;
  page.drawText("Signature et cachet", { x: right, y, size: 9, font, color: grey });
  page.drawRectangle({ x: right, y: y - 95, width: W - right - left, height: 85, borderColor: rgb(0.75, 0.75, 0.78), borderWidth: 0.6 });

  page.drawText(safe(`Document généré par GaragePro le ${s.issuedAt.slice(0, 10)} — valable uniquement signé et cacheté par l'entreprise.`), { x: left, y: 36, size: 7.5, font, color: grey });
  return pdf.save();
}
