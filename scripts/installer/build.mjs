#!/usr/bin/env node
/**
 * Builds the Windows installer: dist/GaragePro-Setup-<version>.exe
 *   npm run installer
 * Packs ONLY the committed code (git archive HEAD): never .env, node_modules, .next,
 * backups or data. Needs Inno Setup 6 (winget install -e --id JRSoftware.InnoSetup).
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIST = path.join(ROOT, "dist");
const WORK = path.join(DIST, "installer-work");
const SRC = path.join(WORK, "app");
const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();

function findIscc() {
  const candidates = [
    process.env.ISCC,
    path.join(process.env.LOCALAPPDATA ?? "", "Programs", "Inno Setup 6", "ISCC.exe"),
    path.join(process.env["ProgramFiles(x86)"] ?? "", "Inno Setup 6", "ISCC.exe"),
    path.join(process.env.ProgramFiles ?? "", "Inno Setup 6", "ISCC.exe"),
  ];
  return candidates.find((p) => p && existsSync(p));
}

/** A .ico holding one PNG image (supported by Windows Vista and later). */
function pngToIco(png) {
  const w = png.readUInt32BE(16);
  const h = png.readUInt32BE(20);
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  header.writeUInt8(w >= 256 ? 0 : w, 6);
  header.writeUInt8(h >= 256 ? 0 : h, 7);
  header.writeUInt16LE(1, 10);
  header.writeUInt16LE(32, 12);
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(22, 18);
  return Buffer.concat([header, png]);
}

const iscc = findIscc();
if (!iscc) {
  console.error("\n  Inno Setup 6 introuvable. Installez-le : winget install -e --id JRSoftware.InnoSetup\n");
  process.exit(1);
}
if (git("status", "--porcelain", "--untracked-files=no")) {
  console.warn("\n  Attention : des modifications ne sont pas commitées. L'installateur contient la version commitée (HEAD).\n");
}

const date = git("log", "-1", "--format=%cd", "--date=format:%Y.%m.%d");
const hash = git("rev-parse", "--short", "HEAD");
const version = `${date}-${hash}`;

rmSync(WORK, { recursive: true, force: true });
mkdirSync(SRC, { recursive: true });
const zip = path.join(WORK, "app.zip");
git("archive", "--format=zip", "-o", zip, "HEAD");
// Windows' own tar (bsdtar): the GNU tar of Git Bash does not understand C:\ paths.
const tar = process.platform === "win32" ? path.join(process.env.SystemRoot ?? "C:\\Windows","System32", "tar.exe") : "tar";
execFileSync(tar, ["-xf", zip, "-C", SRC]);
rmSync(zip);
// Developer-only files: not needed in the garage.
for (const p of [".claude", ".agents", "skills-lock.json", "installer"]) rmSync(path.join(SRC, p), { recursive: true, force: true });
writeFileSync(path.join(SRC, "VERSION.txt"), `GaragePro ${version}\n`);
if (existsSync(path.join(SRC, ".env"))) throw new Error(".env ne doit jamais être dans l'installateur");

const ico = path.join(WORK, "garagepro.ico");
writeFileSync(ico, pngToIco(readFileSync(path.join(ROOT, "public", "icons", "icon-192.png"))));

const result = spawnSync(
  iscc,
  [`/DAppVersion=${version}`, `/DSourceDir=${SRC}`, `/DOutputDir=${DIST}`, `/DIconFile=${ico}`, "/Q", path.join(ROOT, "installer", "GaragePro.iss")],
  { stdio: "inherit" },
);
if (result.status !== 0) process.exit(result.status ?? 1);
rmSync(WORK, { recursive: true, force: true });
console.log(`\n  Installateur prêt : dist\\GaragePro-Setup-${version}.exe\n`);
