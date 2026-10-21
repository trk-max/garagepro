#!/usr/bin/env node
/**
 * Production mode for daily use in the garage (much faster than `npm run dev`):
 * builds only when the code changed since the last build, then serves on the
 * local network (phones on the same Wi-Fi can connect).
 *   npm run serve
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(ROOT);
const npx = process.platform === "win32" ? "npx.cmd" : "npx";

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

const buildId = ".next/BUILD_ID";
const built = existsSync(buildId) ? statSync(buildId).mtimeMs : 0;
const sources = Math.max(...["src", "prisma", "public", "package.json", "next.config.ts", ".env"].map(newestMtime));

if (sources > built) {
  console.log("\n  Code modifié depuis la dernière version : préparation de la version rapide (1 à 2 minutes)…\n");
  // Built on the side (.next-new) and switched in only when it succeeded: a failed build
  // (code changed in the middle of an edit, type error…) keeps the previous version running.
  rmSync(".next-new", { recursive: true, force: true });
  const result = spawnSync(npx, ["next", "build"], { stdio: "inherit", shell: process.platform === "win32", env: { ...process.env, NEXT_DIST_DIR: ".next-new" } });
  if (result.status === 0) {
    // Old version moved aside first and put back if the switch fails (file locked by antivirus…).
    rmSync(".next-old", { recursive: true, force: true });
    try {
      if (existsSync(".next")) renameSync(".next", ".next-old");
      renameSync(".next-new", ".next");
    } catch (error) {
      if (!existsSync(".next") && existsSync(".next-old")) renameSync(".next-old", ".next");
      console.error(`\n  !! Impossible d'installer la nouvelle version (${error.code ?? error.message}) : la version précédente reste en service.\n`);
    }
    try {
      rmSync(".next-old", { recursive: true, force: true, maxRetries: 3 });
    } catch {
      /* left for the next build to remove */
    }
    // next-env.d.ts was written for .next-new: point it back to .next (type checks use it).
    if (existsSync("next-env.d.ts")) writeFileSync("next-env.d.ts", readFileSync("next-env.d.ts", "utf8").replaceAll(".next-new/", ".next/"));
  } else if (existsSync(buildId)) {
    rmSync(".next-new", { recursive: true, force: true });
    console.error("\n  !! La nouvelle version n'a pas pu être préparée (message ci-dessus) : la version précédente reste en service.\n");
  } else {
    console.error("\n  La préparation a échoué. Lisez le message ci-dessus, ou utilisez le mode développement : npm run dev\n");
    process.exit(result.status ?? 1);
  }
} else {
  console.log("\n  Version rapide déjà prête (aucun changement de code).\n");
}
const port = process.env.PORT || "3000";
const server = spawn(npx, ["next", "start", "-H", "0.0.0.0", "-p", port], { stdio: "inherit", shell: process.platform === "win32" });
server.on("exit", (code) => process.exit(code ?? 0));

// Open the browser once the app really answers (not before).
if (!process.env.NO_BROWSER) {
  const url = `http://localhost:${port}`;
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const up = await fetch(url, { signal: AbortSignal.timeout(2000) }).then(() => true, () => false);
    if (up) {
      const opener = process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : process.platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
      spawn(opener[0], opener[1], { stdio: "ignore", detached: true }).on("error", () => {}).unref();
      console.log(`\n  GaragePro est prêt : ${url}\n`);
      break;
    }
  }
}
