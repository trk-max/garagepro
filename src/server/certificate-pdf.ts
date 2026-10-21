import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { certificateText, frDate, type CertificateSnapshot } from "@/lib/certificate";

/** Characters the standard PDF fonts (WinAnsi) can draw; others are replaced. */
const safe = (s: string) => s.replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/[^\x20-\x7E -ÿ€œŒ—–]/g, "?");

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

/** Justified paragraph (last line left-aligned), first line indented. Returns the new y. */
function paragraph(page: PDFPage, text: string, opts: { x: number; y: number; width: number; size: number; lead: number; font: PDFFont; indent?: number; color: ReturnType<typeof rgb> }) {
  const { x, width, size, lead, font, color } = opts;
  const indent = opts.indent ?? 0;
  let y = opts.y;
  const words = safe(text).split(/\s+/);
  let first = true;
  while (words.length) {
    const avail = width - (first ? indent : 0);
    const line: string[] = [];
    while (words.length && font.widthOfTextAtSize([...line, words[0]].join(" "), size) <= avail) line.push(words.shift()!);
    if (!line.length) line.push(words.shift()!);
    const start = x + (first ? indent : 0);
    if (words.length && line.length > 1) {
      const gap = (avail - font.widthOfTextAtSize(line.join(""), size)) / (line.length - 1);
      let cx = start;
      for (const w of line) {
        page.drawText(w, { x: cx, y, size, font, color });
        cx += font.widthOfTextAtSize(w, size) + gap;
      }
    } else page.drawText(line.join(" "), { x: start, y, size, font, color });
    y -= lead;
    first = false;
  }
  return y;
}

/**
 * A4 PDF of a certificate, rebuilt from its archived snapshot (always identical),
 * laid out like a classic Tunisian "attestation de travail": logo and company name
 * at the top, large centred title, spaced body, "Fait à … le …", representative and an
 * EMPTY "Cachet et signature" frame on the right (never generated), and the company's
 * legal identity centred at the bottom.
 */
export async function certificatePdf(s: CertificateSnapshot, opts: { logo?: string | null } = {}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Attestation de travail ${s.number}`);
  pdf.setAuthor(s.company.legalName);
  pdf.setCreator("GaragePro");
  const W = 595.28;
  const page = pdf.addPage([W, 841.89]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const measure = (t: string, size: number) => font.widthOfTextAtSize(t, size);
  const left = 64;
  const width = W - left * 2;
  const right = W / 2 + 40;
  const txt = rgb(0.1, 0.1, 0.15);
  const grey = rgb(0.4, 0.4, 0.45);
  const t = certificateText(s);
  const centred = (text: string, y: number, size: number, f: PDFFont, color = txt) => {
    const str = safe(text);
    page.drawText(str, { x: (W - f.widthOfTextAtSize(str, size)) / 2, y, size, font: f, color });
  };

  // ── Header: logo (Paramètres → Logo des documents; PNG/JPEG only in a PDF) + company name.
  const logo = opts.logo?.match(/^data:image\/(png|jpeg);base64,(.+)$/);
  if (logo) {
    try {
      const bytes = Buffer.from(logo[2]!, "base64");
      const img = logo[1] === "png" ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
      const scale = Math.min(90 / img.width, 70 / img.height, 1);
      page.drawImage(img, { x: left - 10, y: 800 - img.height * scale, width: img.width * scale, height: img.height * scale });
    } catch {
      /* unreadable image: the certificate is still produced, without logo */
    }
  }
  centred(s.company.legalName.toUpperCase(), 772, 17, bold);

  // Recipient (optional): on the right, under the header.
  let y = 700;
  if (s.recipient?.name) {
    let ry = 720;
    for (const line of [s.recipient.name, ...(s.recipient.address ? s.recipient.address.split(/\r?\n/) : [])]) {
      for (const l of wrap(safe(line), W - right - left, 10, measure)) {
        page.drawText(l, { x: right, y: ry, size: 10, font, color: txt });
        ry -= 13;
      }
    }
    y = Math.min(y, ry - 20);
  }

  // ── Title.
  const title = "Attestation de Travail";
  const tw = font.widthOfTextAtSize(title, 22);
  page.drawText(title, { x: (W - tw) / 2, y, size: 22, font, color: txt });
  page.drawLine({ start: { x: (W - tw) / 2, y: y - 4 }, end: { x: (W + tw) / 2, y: y - 4 }, thickness: 1, color: txt });
  centred(`N° ${s.number}`, y - 20, 8.5, font, grey);
  y -= 90;

  // ── Body, spaced like a typed letter.
  const body = { x: left, width, size: 11.5, lead: 21, font, color: txt };
  y = paragraph(page, t.intro, { ...body, y, indent: 36 });
  y -= 4;
  for (const b of t.bullets) {
    page.drawText("-", { x: left + 18, y, size: 11.5, font, color: txt });
    y = paragraph(page, b, { ...body, x: left + 30, width: width - 30, y });
  }
  y -= 6;
  y = paragraph(page, t.closing, { ...body, y, indent: 36 });

  // ── Place and date, then representative and the empty stamp/signature frame.
  y -= 44;
  page.drawText(safe(`Fait à ${s.company.city}, le ${frDate(s.issuedAt)}`), { x: left, y, size: 11, font: bold, color: txt });
  y -= 30;
  page.drawText(safe(s.company.repName), { x: right, y, size: 11, font, color: txt });
  y -= 14;
  page.drawText(safe(s.company.repTitle), { x: right, y, size: 9.5, font, color: grey });
  y -= 18;
  page.drawText("Cachet et Signature", { x: right, y, size: 10, font: bold, color: txt });
  page.drawRectangle({ x: right, y: Math.max(y - 100, 92), width: W - right - left, height: Math.min(90, y - 102), borderColor: rgb(0.75, 0.75, 0.78), borderWidth: 0.6 });

  // ── Footer: the company's legal identity, centred and bold, as on letterhead paper.
  const legal = [
    `${s.company.legalName}${s.company.capital ? ` au capital de ${s.company.capital}` : ""} : Siège social ${s.company.address.replace(/\s*\n\s*/g, ", ")}`,
    [s.company.registryNumber ? `${s.company.registryCity ? `RC ${s.company.registryCity}` : "RNE"} : ${s.company.registryNumber}` : null, s.company.taxId ? `MF : ${s.company.taxId}` : null].filter(Boolean).join(" --- "),
    [s.company.phone ? `Tél : ${s.company.phone}` : null, s.company.email ? `Email : ${s.company.email}` : null].filter(Boolean).join(" --- "),
  ].filter(Boolean);
  let fy = 66;
  for (const line of legal) {
    for (const l of wrap(safe(line), width, 8.5, (str, size) => bold.widthOfTextAtSize(str, size))) {
      centred(l, fy, 8.5, bold);
      fy -= 11;
    }
  }
  centred(`Document généré par GaragePro le ${s.issuedAt.slice(0, 10)} — valable uniquement signé et cacheté par l'entreprise.`, 18, 6.5, font, grey);
  return pdf.save();
}
