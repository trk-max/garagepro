/**
 * V15 — generates the call sound of the waiting-room screen (public/sounds/accueil-appel.wav):
 * a two-tone "ding-dong" chime synthesised here (sine waves + soft harmonics, exponential decay).
 * Made by this script, so it is free of any rights. Run again: node scripts/make-accueil-sound.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RATE = 22050;
const notes = [
  { freq: 880, start: 0, length: 0.9 },
  { freq: 659.25, start: 0.45, length: 1.1 },
];
const total = Math.ceil(RATE * 1.6);
const samples = new Float32Array(total);
for (const n of notes) {
  const from = Math.floor(n.start * RATE);
  const len = Math.floor(n.length * RATE);
  for (let i = 0; i < len && from + i < total; i++) {
    const t = i / RATE;
    const attack = Math.min(1, t / 0.01);
    const env = attack * Math.exp(-3.2 * t);
    const v = Math.sin(2 * Math.PI * n.freq * t) + 0.35 * Math.sin(2 * Math.PI * n.freq * 2 * t) + 0.12 * Math.sin(2 * Math.PI * n.freq * 3 * t);
    samples[from + i] += 0.42 * env * v;
  }
}
const data = Buffer.alloc(total * 2);
for (let i = 0; i < total; i++) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), i * 2);
const header = Buffer.alloc(44);
header.write("RIFF", 0);
header.writeUInt32LE(36 + data.length, 4);
header.write("WAVE", 8);
header.write("fmt ", 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20); // PCM
header.writeUInt16LE(1, 22); // mono
header.writeUInt32LE(RATE, 24);
header.writeUInt32LE(RATE * 2, 28);
header.writeUInt16LE(2, 32);
header.writeUInt16LE(16, 34);
header.write("data", 36);
header.writeUInt32LE(data.length, 40);
const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public/sounds/accueil-appel.wav");
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, Buffer.concat([header, data]));
console.log(`${out} (${header.length + data.length} octets)`);
