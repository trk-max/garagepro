#!/usr/bin/env node
/**
 * Production mode for daily use in the garage (much faster than `npm run dev`),
 * served on the local network (phones on the same Wi-Fi can connect).
 *   npm run serve
 *
 * V10.4 — no downtime while a new version is prepared:
 * - a previous version exists (.next/BUILD_ID): it is served AT ONCE; if the code changed,
 *   the new version is built on the side (.next-new) while the old one keeps answering;
 *   when the build succeeds the server is stopped, the folders are switched
 *   (.next → .next-old, .next-new → .next) and the server starts again (a few seconds);
 *   if the build fails, the old version simply keeps running;
 * - first install (no version yet): build, then start (as before).
 * Windows keeps the files of a running server locked, hence: build elsewhere, stop, switch
 * (with retries on EBUSY / EPERM), start; if the switch still fails, the old version comes back.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(ROOT);
const NEXT_BIN = path.join(ROOT, "node_modules", "next", "dist", "bin", "next");
const port = process.env.PORT || "3000";
const win = process.platform === "win32";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (msg) => console.log(`\n  ${msg}\n`);
const env = { ...process.env };
delete env.NEXT_DIST_DIR;

function newestMtime(target) {
  if (!existsSync(target)) return 0;
  const st = statSync(target);
  if (!st.isDirectory()) return st.mtimeMs;
  let newest = 0;
  for (const name of readdirSync(target)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    newest = Math.max(newest, newestMtime(path.join(target, name)));
  }
  return newest;
}

const BUILD_ID = ".next/BUILD_ID";
const builtAt = existsSync(BUILD_ID) ? statSync(BUILD_ID).mtimeMs : 0;
const sources = Math.max(...["src", "prisma", "public", "package.json", "next.config.ts", ".env"].map(newestMtime));

// ── Build on the side ────────────────────────────────────────────────────────

/** `next build` into .next-new (never touches the running version). Resolves true on success. */
function buildNew() {
  rmSync(".next-new", { recursive: true, force: true, maxRetries: 3 });
  return new Promise((resolve) => {
    const b = spawn(process.execPath, [NEXT_BIN, "build"], { stdio: "inherit", env: { ...env, NEXT_DIST_DIR: ".next-new" } });
    b.on("error", () => resolve(false));
    b.on("exit", (code) => resolve(code === 0 && existsSync(".next-new/BUILD_ID")));
  });
}

/** rename with retries: on Windows a just-stopped server or the antivirus can hold the folder a moment. */
async function renameRetry(from, to, tries = 20) {
  for (let i = 0; ; i++) {
    try {
      return renameSync(from, to);
    } catch (error) {
      if (i >= tries || !["EBUSY", "EPERM", "EACCES", "ENOTEMPTY"].includes(error.code)) throw error;
      await sleep(500);
    }
  }
}

function removeOld() {
  try {
    rmSync(".next-old", { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
  } catch {
    /* still locked: removed at the next update */
  }
  return !existsSync(".next-old");
}

/** .next-new → .next, keeping the previous one aside until the switch succeeded. */
async function switchIn() {
  try {
    if (existsSync(".next")) await renameRetry(".next", ".next-old");
    await renameRetry(".next-new", ".next");
  } catch (error) {
    if (!existsSync(".next") && existsSync(".next-old")) await renameRetry(".next-old", ".next").catch(() => {});
    console.error(`\n  !! Impossible d'installer la nouvelle version (${error.code ?? error.message}) : la version précédente reste en service.\n`);
    return false;
  }
  // next-env.d.ts was written for .next-new: point it back to .next (type checks use it).
  if (existsSync("next-env.d.ts")) writeFileSync("next-env.d.ts", readFileSync("next-env.d.ts", "utf8").replaceAll(".next-new/", ".next/"));
  return true;
}

// ── Server ───────────────────────────────────────────────────────────────────

let server = null;
let restarting = false;

function startServer() {
  const child = spawn(process.execPath, [NEXT_BIN, "start", "-H", "0.0.0.0", "-p", port], { stdio: "inherit", env });
  child.on("exit", (code) => {
    // Stopped on purpose to switch versions: not the end of the app.
    if (!restarting && child === server) process.exit(code ?? 0);
  });
  server = child;
  return child;
}

function stopServer(child) {
  return new Promise((resolve) => {
    if (!child || child.exitCode !== null || child.signalCode !== null) return resolve();
    child.once("exit", () => resolve());
    if (win) spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    else child.kill("SIGTERM");
    setTimeout(() => child.kill("SIGKILL"), 10_000).unref();
  });
}

async function waitUntilUp(seconds = 60) {
  for (let i = 0; i < seconds * 4; i++) {
    const up = await fetch(`http://127.0.0.1:${port}/login`, { signal: AbortSignal.timeout(2000) }).then((r) => r.status < 500, () => false);
    if (up) return true;
    await sleep(250);
  }
  return false;
}

for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(sig, async () => {
    restarting = true;
    await stopServer(server);
    process.exit(0);
  });
}

function openBrowser() {
  if (process.env.NO_BROWSER) return;
  const url = `http://localhost:${port}`;
  const opener = win ? ["cmd", ["/c", "start", "", url]] : process.platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
  spawn(opener[0], opener[1], { stdio: "ignore", detached: true }).on("error", () => {}).unref();
}

// ── Start ────────────────────────────────────────────────────────────────────

if (!existsSync(BUILD_ID)) {
  // First install: nothing to serve yet, so build first (1 to 2 minutes).
  say("Première préparation de la version rapide (1 à 2 minutes)…");
  if (!(await buildNew()) || !(await switchIn())) {
    console.error("\n  La préparation a échoué. Lisez le message ci-dessus, ou utilisez le mode développement : npm run dev\n");
    process.exit(1);
  }
  startServer();
  if (await waitUntilUp()) {
    say(`GaragePro est prêt : http://localhost:${port}`);
    openBrowser();
  }
} else {
  // A version exists: serve it now, phones and other PCs never wait for a build.
  startServer();
  const update = sources > builtAt;
  if (await waitUntilUp()) {
    say(`GaragePro est prêt : http://localhost:${port}${update ? " (version précédente, la nouvelle se prépare)" : ""}`);
    openBrowser();
  }
  if (!update) {
    say("Version rapide déjà prête (aucun changement de code).");
  } else {
    say("Code modifié : la nouvelle version se prépare en arrière-plan (1 à 2 minutes). L'application reste utilisable pendant ce temps.");
    if (!(await buildNew())) {
      rmSync(".next-new", { recursive: true, force: true, maxRetries: 3 });
      console.error("\n  !! La nouvelle version n'a pas pu être préparée (message ci-dessus) : la version précédente reste en service.\n");
    } else if (!removeOld()) {
      console.error("\n  !! Ancien dossier .next-old verrouillé : la nouvelle version sera installée au prochain démarrage.\n");
    } else {
      say("Nouvelle version prête : redémarrage rapide (quelques secondes)…");
      const t0 = Date.now();
      restarting = true;
      await stopServer(server);
      await switchIn(); // on failure the previous version is back in .next and simply restarts
      restarting = false;
      startServer();
      const up = await waitUntilUp();
      say(up ? `Nouvelle version en service (interruption : ${((Date.now() - t0) / 1000).toFixed(1)} s).` : "!! Le serveur tarde à répondre : vérifiez les messages ci-dessus.");
      setTimeout(removeOld, 30_000).unref();
    }
  }
}
