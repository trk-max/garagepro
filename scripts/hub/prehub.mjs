/**
 * Runs before "npm run hub" (package.json "prehub"): prepares the database client,
 * unless the hub is already running on this PC — Windows then locks the engine file
 * and "prisma generate" would fail and stop the start before scripts/hub/start.mjs can
 * simply open the running app.
 */
import { spawnSync } from "node:child_process";
import net from "node:net";

const port = Number(process.env.PORT || 3000);
const busy = await new Promise((resolve) => {
  const probe = net.createServer().once("error", (e) => resolve(e.code === "EADDRINUSE")).once("listening", () => probe.close(() => resolve(false)));
  probe.listen(port, "0.0.0.0");
});
if (busy) process.exit(0);

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(npx, ["prisma", "generate"], { stdio: "inherit", shell: process.platform === "win32" });
process.exit(result.status ?? 1);
