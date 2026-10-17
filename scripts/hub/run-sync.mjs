/**
 * Garage hub — synchronisation loop (every SYNC_INTERVAL_SECONDS, default 30).
 *   npm run hub:sync            → one round, then exit
 *   (started automatically by "npm run hub")
 * When internet is down nothing fails: the round is skipped, the garage keeps
 * working on its local database, and everything is sent at the next round.
 */
import { connectCloud, connectLocal } from "./connect.mjs";
import { syncMedia } from "./media-sync.mjs";
import { getState, setState, syncOnce } from "./sync-engine.mjs";

const INTERVAL = Math.max(10, Number(process.env.SYNC_INTERVAL_SECONDS ?? 30)) * 1000;
const time = () => new Date().toLocaleTimeString("fr-FR");

export async function round() {
  const local = await connectLocal();
  try {
    const previous = await getState(local, "status", {});
    let cloud;
    try {
      cloud = await connectCloud();
    } catch (error) {
      await setState(local, "status", { ...previous, online: false, lastError: `Internet / Supabase injoignable : ${error.message}` });
      console.log(`[${time()}] Hors ligne — le garage continue en local (${error.code ?? error.message}).`);
      return { online: false };
    }
    try {
      const report = await syncOnce(local, cloud);
      const media = await syncMedia(local);
      await setState(local, "status", {
        online: true,
        lastSyncAt: report.at,
        errors: report.errors.length,
        lastError: report.errors[0] ? `${report.errors[0].tbl} : ${report.errors[0].error}` : null,
        last: { ...report, errors: report.errors.slice(0, 20), media },
      });
      const parts = [`envoyés ${report.pushed}`, `reçus ${report.pulled}`];
      if (report.conflicts) parts.push(`conflits ${report.conflicts} (le plus récent gagne)`);
      if (!media.skipped && (media.uploaded || media.downloaded)) parts.push(`photos ↑${media.uploaded} ↓${media.downloaded}`);
      if (report.errors.length) parts.push(`À VÉRIFIER ${report.errors.length} : ${report.errors[0].tbl} — ${report.errors[0].error}`);
      console.log(`[${time()}] Synchronisé — ${parts.join(" · ")}`);
      return { online: true, report };
    } finally {
      await cloud.end().catch(() => {});
    }
  } finally {
    await local.end().catch(() => {});
  }
}

export async function loop() {
  console.log(`  Synchronisation avec Supabase toutes les ${INTERVAL / 1000} s.`);
  for (;;) {
    try {
      await round();
    } catch (error) {
      console.error(`[${time()}] Erreur de synchronisation : ${error.message}`);
    }
    await new Promise((r) => setTimeout(r, INTERVAL));
  }
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/hub/run-sync.mjs")) {
  if (process.argv.includes("--once")) {
    round()
      .then((r) => process.exit(r.online ? 0 : 2))
      .catch((e) => {
        console.error(e.message);
        process.exit(1);
      });
  } else {
    void loop();
  }
}
