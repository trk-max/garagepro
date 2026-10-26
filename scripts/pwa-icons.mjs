#!/usr/bin/env node
/**
 * App icons of the two installable apps (client app « /app » and team app « /equipe »), drawn
 * from the GP monogram (public/site/brand/gp-monogramme.svg = the vector version of the garage's
 * monogram artwork: white lines, red accent). sharp comes with Next.js (no extra dependency).
 *   node scripts/pwa-icons.mjs
 * Writes public/icons/app-*.png (client) and public/icons/team-*.png (team): 192, 512,
 * maskable 512 (content inside the safe zone) and apple-touch 180 (no transparency).
 * The older icons (icon-192, icon-512, maskable-512, apple-180) are left as they are.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const svg = readFileSync(path.join(ROOT, "public/site/brand/gp-monogramme.svg"), "utf8");
const viewBox = /viewBox="([^"]+)"/.exec(svg)[1].split(/\s+/).map(Number);
const paths = svg.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
const [vx, vy, vw, vh] = viewBox;

const BG = "#0b0b0c";
const ORANGE_FROM = "#f58a4f";
const ORANGE_TO = "#e2603a";

/** The monogram centred at (cx, cy), `size` px wide. */
function mono(cx, cy, size) {
  const s = size / vw;
  const h = vh * s;
  return `<g transform="translate(${cx - size / 2} ${cy - h / 2}) scale(${s}) translate(${-vx} ${-vy})">${paths}</g>`;
}

/** Lucide "wrench" (24×24, stroke) centred at (cx, cy). */
function wrench(cx, cy, size) {
  const s = size / 24;
  return `<g transform="translate(${cx - size / 2} ${cy - size / 2}) scale(${s})" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></g>`;
}

/**
 * kind "app": monogram on black. kind "team": same, with an orange round badge (wrench) at the
 * bottom-right, so the two apps are told apart on the home screen.
 * `safe`: fraction of the canvas the drawing may use (maskable icons: ~0.6 to survive any mask).
 */
function icon(kind, px, safe) {
  const c = px / 2;
  const area = px * safe;
  const monoSize = area * (kind === "team" ? 0.78 : 0.82);
  const monoCy = kind === "team" ? c - area * 0.04 : c;
  const badgeR = area * 0.17;
  const bx = c + area * 0.34;
  const by = c + area * 0.32;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${px} ${px}">
  <defs><linearGradient id="o" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${ORANGE_FROM}"/><stop offset="1" stop-color="${ORANGE_TO}"/></linearGradient></defs>
  <rect width="${px}" height="${px}" fill="${BG}"/>
  ${mono(c, monoCy, monoSize)}
  ${kind === "team" ? `<circle cx="${bx}" cy="${by}" r="${badgeR + px * 0.012}" fill="${BG}"/><circle cx="${bx}" cy="${by}" r="${badgeR}" fill="url(#o)"/>${wrench(bx, by, badgeR * 1.15)}` : ""}
</svg>`;
}

const out = [];
for (const kind of ["app", "team"]) {
  const jobs = [
    [`${kind}-192.png`, 192, 0.8],
    [`${kind}-512.png`, 512, 0.8],
    [`${kind}-maskable-512.png`, 512, 0.62],
    [`${kind}-apple-180.png`, 180, 0.74],
  ];
  for (const [name, px, safe] of jobs) {
    const file = path.join(ROOT, "public/icons", name);
    await sharp(Buffer.from(icon(kind, px, safe))).flatten({ background: BG }).png({ compressionLevel: 9 }).toFile(file);
    out.push(name);
  }
}
console.log(`Icônes écrites dans public/icons : ${out.join(", ")}`);
