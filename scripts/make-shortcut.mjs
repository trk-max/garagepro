/**
 * Builds "GaragePro.cmd", a shortcut for ANOTHER PC (copy it to that PC, e.g. on its Desktop):
 *   npm run shortcut                      (on the garage PC: it knows its own name and address)
 *   npm run shortcut -- --online https://my-garage.vercel.app
 *
 * When opened, the shortcut:
 *   1. asks the garage PC (hub) on the Wi-Fi, by its name then by its address, whether it is a
 *      GaragePro hub (/api/hub/status answers 200 or 401 only on a real hub — another device that
 *      happens to have the same address is never opened by mistake);
 *   2. opens GaragePro in its own window (Edge app mode): the garage PC if it answered
 *      (fast, works even when internet is down), otherwise the online site.
 * Same data in both cases: the hub and the online site synchronise every 30 s.
 */
import { writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const port = process.env.PORT || "3000";
const online = (arg("online") || process.env.APP_URL || "https://garageprotest-beta.vercel.app").replace(/\/+$/, "");
if (!/^https:\/\//.test(online)) {
  console.error(`Adresse en ligne invalide : ${online} (https://… attendu)`);
  process.exit(2);
}

// Real network cards only (not VirtualBox/VMware/WSL virtual adapters).
const VIRTUAL = /virtualbox|vmware|vethernet|wsl|hyper-v|loopback|docker/i;
const addresses = Object.entries(os.networkInterfaces())
  .filter(([name]) => !VIRTUAL.test(name))
  .flatMap(([, list]) => list ?? [])
  .filter((a) => a.family === "IPv4" && !a.internal && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address) && !a.address.startsWith("192.168.56."))
  .map((a) => a.address);
const name = os.hostname();
const hubs = [`http://${name}:${port}`, ...addresses.map((a) => `http://${a}:${port}`)];

const cmd = `@echo off
rem GaragePro — raccourci pour un autre PC (créé le ${new Date().toISOString().slice(0, 10)} sur ${name}).
rem Au garage (même Wi-Fi) : ouvre le PC du garage. Ailleurs : ouvre le site en ligne. Mêmes données.
setlocal
set "ONLINE=${online}"
set "TARGET="
${hubs
  .map(
    (h) => `if not defined TARGET (
  for /f %%c in ('curl.exe -s -o NUL -w "%%{http_code}" --max-time 2 "${h}/api/hub/status" 2^>NUL') do (
    if "%%c"=="200" set "TARGET=${h}"
    if "%%c"=="401" set "TARGET=${h}"
  )
)`,
  )
  .join("\n")}
if not defined TARGET set "TARGET=%ONLINE%"
start "" msedge --app="%TARGET%/garage" 2>NUL || start "" "%TARGET%/garage"
endlocal
`;
const out = path.join(ROOT, "GaragePro.cmd");
writeFileSync(out, cmd.replace(/\n/g, "\r\n"));
console.log(`\n  ✔ Raccourci créé : ${out}`);
console.log(`    PC du garage essayé d'abord : ${hubs.join("  puis  ")}`);
console.log(`    Sinon : ${online}`);
console.log("\n  Copiez GaragePro.cmd sur l'autre PC (clé USB, e-mail…) et double-cliquez dessus.");
if (addresses.length) console.log(`  Conseil : réservez l'adresse ${addresses[0]} à ce PC dans la box (bail DHCP fixe), sinon recréez le raccourci si elle change.\n`);
