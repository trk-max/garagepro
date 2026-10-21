import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { ContractDoc, GarageSnap } from "@/lib/contract-document";

/** Characters the standard PDF fonts (WinAnsi) can draw; others are replaced (same rule as the certificates). */
const safe = (s: string) =>
  s
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[   ]/g, " ")
    .replace(/[^\x20-\x7E -ÿ€œŒ—–«»…]/g, "?");

function wrap(text: string, width: number, size: number, font: PDFFont): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > width && line) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
  }
  return lines;
}

const W = 595.28;
const H = 841.89;
const LEFT = 56;
const WIDTH = W - LEFT * 2;
const BOTTOM = 92;

/**
 * A4 PDF of a contract (V9.0): the garage's logo, title, number, the "to be validated by a lawyer"
 * line while the template version is not reviewed, parties, vehicles, repair detail (prices TTC in
 * dinars), clauses, then two EMPTY signature frames (hand signature and stamp — never generated).
 * Legal footer (who issued it) on every page, with the page number.
 */
export async function contractPdf(doc: ContractDoc, garage: GarageSnap | null, opts: { logo?: string | null; generatedDay: string }): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${doc.title} ${doc.number}`);
  pdf.setAuthor(garage?.legalName || garage?.name || "GaragePro");
  pdf.setCreator("GaragePro");
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const txt = rgb(0.1, 0.1, 0.15);
  const grey = rgb(0.4, 0.4, 0.45);
  const warn = rgb(0.62, 0.22, 0.05);

  let logo: Awaited<ReturnType<typeof pdf.embedPng>> | null = null;
  const m = opts.logo?.match(/^data:image\/(png|jpeg);base64,(.+)$/);
  if (m) {
    try {
      const bytes = Buffer.from(m[2]!, "base64");
      logo = m[1] === "png" ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
    } catch {
      logo = null; // unreadable image: the contract is still produced, without logo
    }
  }

  const pages: PDFPage[] = [];
  let page!: PDFPage;
  let y = 0;
  const newPage = () => {
    page = pdf.addPage([W, H]);
    pages.push(page);
    y = H - 56;
    if (pages.length > 1) {
      page.drawText(safe(`${doc.title} — ${doc.number}`), { x: LEFT, y, size: 8.5, font, color: grey });
      y -= 22;
    }
  };
  const ensure = (h: number) => {
    if (y - h < BOTTOM) newPage();
  };
  const text = (s: string, o: { size?: number; f?: PDFFont; color?: ReturnType<typeof rgb>; indent?: number; gap?: number } = {}) => {
    const size = o.size ?? 10;
    const f = o.f ?? font;
    for (const line of wrap(safe(s), WIDTH - (o.indent ?? 0), size, f)) {
      ensure(size + 4);
      if (line) page.drawText(line, { x: LEFT + (o.indent ?? 0), y, size, font: f, color: o.color ?? txt });
      y -= size + (o.gap ?? 4);
    }
  };

  newPage();
  if (logo) {
    const scale = Math.min(140 / logo.width, 48 / logo.height, 1);
    page.drawImage(logo, { x: W - LEFT - logo.width * scale, y: H - 44 - logo.height * scale, width: logo.width * scale, height: logo.height * scale });
  }
  text(doc.title.toUpperCase(), { size: 15, f: bold, gap: 6 });
  text(`N° ${doc.number}`, { size: 9, color: grey });
  text(doc.versionLine, { size: 8, color: grey });
  y -= 6;
  // The line the owner asked for, in plain sight, until a lawyer's review is recorded.
  text(doc.legalNotice, { size: 8.5, f: bold, color: warn });
  for (const u of doc.unverified) text(`Non vérifié : ${u}`, { size: 7.5, color: warn, indent: 8, gap: 2 });
  if (doc.renewalLine) text(doc.renewalLine, { size: 8.5, color: grey });
  y -= 10;

  text("ENTRE LES SOUSSIGNÉS", { size: 10, f: bold, gap: 8 });
  for (const p of doc.parties) {
    text(p.label, { size: 9.5, f: bold });
    for (const l of p.lines) text(l, { size: 9.5, indent: 10, gap: 3 });
    y -= 6;
  }

  if (doc.vehicles.length) {
    text(doc.vehicles.length > 1 ? "VÉHICULES" : "VÉHICULE", { size: 10, f: bold, gap: 6 });
    for (const v of doc.vehicles) text(`- ${v}`, { size: 9.5, indent: 4 });
    y -= 6;
  }

  if (doc.repair) {
    text("DÉTAIL DES TRAVAUX ET PIÈCES (prix TTC, en dinars)", { size: 10, f: bold, gap: 6 });
    const cols = [LEFT, LEFT + 290, LEFT + 340, LEFT + 415];
    const head = ["Désignation", "Qté", "P.U. TTC", "Total TTC"];
    ensure(16);
    head.forEach((h, i) => page.drawText(h, { x: cols[i]!, y, size: 8.5, font: bold, color: grey }));
    y -= 13;
    for (const row of doc.repair.rows) {
      const desc = wrap(safe(row[0]), 280, 9, font);
      ensure(desc.length * 12 + 2);
      desc.forEach((l, i) => page.drawText(l, { x: cols[0]!, y: y - i * 12, size: 9, font, color: txt }));
      for (let i = 1; i < 4; i++) page.drawText(safe(row[i]!), { x: cols[i]!, y, size: 9, font, color: txt });
      y -= desc.length * 12 + 2;
    }
    if (doc.repair.rows.length === 0) text("Aucune ligne pour le moment (devis à compléter).", { size: 9, color: grey });
    y -= 4;
    for (const [label, value] of doc.repair.totals) {
      ensure(13);
      page.drawText(safe(label), { x: cols[2]!, y, size: 9, font: label === "Total TTC" ? bold : font, color: txt });
      page.drawText(safe(value), { x: cols[3]!, y, size: 9, font: label === "Total TTC" ? bold : font, color: txt });
      y -= 13;
    }
    y -= 8;
  }

  text("IL A ÉTÉ CONVENU CE QUI SUIT", { size: 10, f: bold, gap: 8 });
  doc.clauses.forEach((c, i) => {
    ensure(30);
    text(`Article ${i + 1} — ${c.title}`, { size: 10, f: bold });
    text(c.text, { size: 9.5, gap: 3.5 });
    y -= 6;
  });

  // Signatures: names / roles only, EMPTY frames (signed and stamped by hand).
  ensure(150);
  y -= 6;
  text(`Fait en deux exemplaires originaux, à ${garage?.city || "……"}, le ……`, { size: 9.5 });
  y -= 8;
  const colW = (WIDTH - 20) / 2;
  doc.signatures.forEach((label, i) => {
    const x = LEFT + i * (colW + 20);
    wrap(safe(label), colW, 8.5, font).forEach((l, j) => page.drawText(l, { x, y: y - j * 11, size: 8.5, font, color: grey }));
    page.drawRectangle({ x, y: y - 120, width: colW, height: 92, borderColor: rgb(0.75, 0.75, 0.78), borderWidth: 0.6 });
  });

  // Footer on every page: issuer identity, the review state, page number.
  const legal = garage
    ? safe([garage.legalName || garage.name, garage.address?.replace(/\s*\n\s*/g, ", "), garage.phone, garage.email, garage.taxId ? `MF : ${garage.taxId}` : null, garage.registry].filter(Boolean).join(" · "))
    : "";
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: LEFT, y: 64 }, end: { x: W - LEFT, y: 64 }, thickness: 0.5, color: rgb(0.8, 0.8, 0.82) });
    wrap(legal, WIDTH, 7.5, font)
      .slice(0, 2)
      .forEach((l, j) => p.drawText(l, { x: LEFT, y: 54 - j * 10, size: 7.5, font, color: grey }));
    const foot = safe(`${doc.number} · ${doc.legalNotice.startsWith("Modèle à valider") ? "Modèle à valider par un juriste" : "Modèle relu par un juriste"} · généré par GaragePro le ${opts.generatedDay} · page ${i + 1}/${pages.length}`);
    p.drawText(foot, { x: LEFT, y: 30, size: 7, font, color: grey });
  });
  return pdf.save();
}
