/**
 * Photos/videos of the garage hub. On the garage PC files are saved in
 * ./storage (works without internet); this copies them to the online bucket
 * when internet is back, and downloads to the PC the files added online.
 * Needs NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and
 * CLOUD_STORAGE_BUCKET (do NOT set SUPABASE_STORAGE_BUCKET on the garage PC,
 * or the app would try to upload directly and fail offline).
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getState, setState } from "./sync-engine.mjs";

const PER_ROUND = 20;

export function mediaConfig(env = process.env) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = env.CLOUD_STORAGE_BUCKET;
  return url && key && bucket ? { url, key, bucket } : null;
}

const safePath = (root, key) => {
  const full = path.join(root, key);
  if (!full.startsWith(root + path.sep)) throw new Error(`Invalid storage key: ${key}`);
  return full;
};

export async function syncMedia(local, { root = path.join(process.cwd(), "storage"), config = mediaConfig(), fetchImpl = fetch } = {}) {
  if (!config) return { skipped: true, uploaded: 0, downloaded: 0 };
  const done = new Set(await getState(local, "mediaSynced", []));
  // Repair photos/videos and showroom photos/documents (V9) share the same storage.
  const { rows } = await local.query(
    `SELECT key, type FROM (
       SELECT "storageKey" AS key, "contentType" AS type, "createdAt" FROM "WorkOrderMedia"
       UNION ALL SELECT "storageKey", "contentType", "createdAt" FROM "ListingMedia"
     ) m ORDER BY "createdAt" DESC`,
  );
  const headers = { Authorization: `Bearer ${config.key}`, apikey: config.key };
  let uploaded = 0;
  let downloaded = 0;
  const errors = [];
  for (const { key, type } of rows) {
    if (done.has(key) || uploaded + downloaded >= PER_ROUND) continue;
    try {
      const file = safePath(root, key);
      const objectUrl = `${config.url}/storage/v1/object/${config.bucket}/${key}`;
      if (existsSync(file)) {
        const res = await fetchImpl(objectUrl, { method: "POST", headers: { ...headers, "Content-Type": type, "x-upsert": "true" }, body: new Uint8Array(await readFile(file)) });
        if (!res.ok) throw new Error(`upload ${res.status}`);
        uploaded++;
      } else {
        const res = await fetchImpl(objectUrl.replace("/object/", "/object/authenticated/"), { headers });
        if (res.status === 404 || res.status === 400) continue; // not online either (yet)
        if (!res.ok) throw new Error(`download ${res.status}`);
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(file, Buffer.from(await res.arrayBuffer()));
        downloaded++;
      }
      done.add(key);
    } catch (error) {
      errors.push(`${key}: ${error.message}`);
    }
  }
  // Forget keys of media deleted meanwhile.
  const present = new Set(rows.map((r) => r.key));
  await setState(local, "mediaSynced", [...done].filter((k) => present.has(k)));
  return { skipped: false, uploaded, downloaded, errors };
}
