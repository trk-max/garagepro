/**
 * GaragePro backups (Prompt 2/5, step E) — shared by the scripts and the tests.
 *
 *   dump (pg_dump, custom format, frozen snapshot, schema "public")
 *   → SHA-256 → encrypt (AES-256-GCM, key file outside the project)
 *   → VERIFY: decrypt, check SHA-256, pg_restore into a THROW-AWAY database,
 *     compare every table's row count with the counts taken in the same snapshot
 *   → copy to a second place (checked by SHA-256) → keep the N newest.
 *
 * A backup is reported "verified" ONLY when the restore check passed: a file
 * that merely exists proves nothing. Nothing here ever writes to the source
 * database or to any database other than the throw-away "gp_restore_check_*".
 */
import { spawn } from "node:child_process";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { appendFile, copyFile, mkdir, readdir, readFile, rm, stat, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import pg from "pg";

export const MAGIC = Buffer.from("GPBK1");
const IV_LEN = 12;
const TAG_LEN = 16;
export const NAME_RE = /^garagepro-(\d{8})-(\d{6})\.gpbk$/;

// ── Names, retention ─────────────────────────────────────────────────────────

export function backupName(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `garagepro-${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}.gpbk`;
}

/** Backups to delete so that only the `keep` newest remain (only our own file names). */
export function selectForDeletion(names, keep) {
  return names
    .filter((n) => NAME_RE.test(n))
    .sort()
    .reverse()
    .slice(Math.max(1, keep));
}

// ── Key ──────────────────────────────────────────────────────────────────────

export function defaultKeyFile() {
  return path.join(os.homedir(), "GaragePro", "backup.key");
}

export async function createKeyFile(file) {
  if (existsSync(file)) throw new Error(`La clé existe déjà : ${file} (jamais écrasée : les anciennes sauvegardes en dépendent).`);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, randomBytes(32).toString("hex") + "\n", { mode: 0o600, flag: "wx" });
  return file;
}

export async function loadKey(file) {
  if (!file || !existsSync(file)) throw new Error(`Clé de chiffrement introuvable : ${file}. Créez-la avec « npm run backup:key ».`);
  const hex = (await readFile(file, "utf8")).trim();
  if (!/^[0-9a-f]{64}$/i.test(hex)) throw new Error(`Clé invalide dans ${file} (64 caractères hexadécimaux attendus).`);
  return Buffer.from(hex, "hex");
}

// ── Crypto (streaming, any size) ─────────────────────────────────────────────

export async function sha256File(file) {
  const h = createHash("sha256");
  await pipeline(createReadStream(file), h);
  return h.digest("hex");
}

/** File = "GPBK1" + IV(12) + ciphertext + GCM tag(16). */
export async function encryptFile(src, dest, key) {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  await writeFile(dest, Buffer.concat([MAGIC, iv]));
  await pipeline(createReadStream(src), cipher, createWriteStream(dest, { flags: "a" }));
  await appendFile(dest, cipher.getAuthTag());
}

/** Throws if the key is wrong or a single byte was changed (GCM authentication). */
export async function decryptFile(src, dest, key) {
  const { size } = await stat(src);
  if (size < MAGIC.length + IV_LEN + TAG_LEN) throw new Error("Fichier de sauvegarde trop court ou corrompu.");
  const fh = await import("node:fs/promises").then((m) => m.open(src, "r"));
  try {
    const head = Buffer.alloc(MAGIC.length + IV_LEN);
    await fh.read(head, 0, head.length, 0);
    if (!head.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error("Ce n'est pas une sauvegarde GaragePro.");
    const tag = Buffer.alloc(TAG_LEN);
    await fh.read(tag, 0, TAG_LEN, size - TAG_LEN);
    const decipher = createDecipheriv("aes-256-gcm", key, head.subarray(MAGIC.length));
    decipher.setAuthTag(tag);
    try {
      await pipeline(createReadStream(src, { start: head.length, end: size - TAG_LEN - 1 }), decipher, createWriteStream(dest));
    } catch {
      await rm(dest, { force: true });
      throw new Error("Déchiffrement refusé : mauvaise clé ou fichier modifié/corrompu.");
    }
  } finally {
    await fh.close();
  }
}

// ── PostgreSQL tools ─────────────────────────────────────────────────────────

export function findPgBin(tool, env = process.env) {
  const exe = process.platform === "win32" ? `${tool}.exe` : tool;
  const dirs = [env.PG_BIN, ...["17", "16", "15", "14"].map((v) => `C:\\Program Files\\PostgreSQL\\${v}\\bin`), "/usr/lib/postgresql/16/bin", "/usr/bin"].filter(Boolean);
  for (const d of dirs) if (existsSync(path.join(d, exe))) return path.join(d, exe);
  return exe; // on the PATH
}

/** URL without its password (given to the tools through PGPASSWORD, not on the command line). */
export function splitUrl(url) {
  const u = new URL(url);
  const password = decodeURIComponent(u.password);
  u.password = "";
  return { url: u.toString(), password, host: u.hostname, database: u.pathname.slice(1) };
}

function run(cmd, args, env) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { env: { ...process.env, ...env }, windowsHide: true });
    let err = "";
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", (e) => reject(new Error(`${path.basename(cmd)} introuvable (${e.message}). Installez PostgreSQL ou réglez PG_BIN.`)));
    p.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(`${path.basename(cmd)} a échoué (${code}) : ${err.trim().slice(0, 800)}`))));
  });
}

/**
 * pg_restore into an existing empty database. The dump re-creates schema "public",
 * which every new database already has: that single entry is left out of the
 * restore list; any other error still stops the restore (--exit-on-error).
 */
async function restoreDump(plainDump, targetUrl, pgRestore = findPgBin("pg_restore")) {
  const t = splitUrl(targetUrl);
  const list = (await run(pgRestore, ["--list", plainDump], {}))
    .split(/\r?\n/)
    .filter((line) => !/^\d+;\s+\d+\s+\d+\s+SCHEMA\s+-\s+public\s/.test(line))
    .join("\n");
  const listFile = `${plainDump}.list`;
  await writeFile(listFile, list);
  try {
    await run(pgRestore, ["--no-owner", "--no-privileges", "--exit-on-error", `--use-list=${listFile}`, `--dbname=${t.url}`, plainDump], { PGPASSWORD: t.password });
  } finally {
    await rm(listFile, { force: true });
  }
}

async function tableCounts(client) {
  const { rows } = await client.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`);
  const out = {};
  for (const { table_name } of rows) {
    const r = await client.query(`SELECT count(*)::bigint AS n FROM public."${table_name.replace(/"/g, '""')}"`);
    out[table_name] = Number(r.rows[0].n);
  }
  return out;
}

/**
 * pg_dump of the "public" schema inside a REPEATABLE READ snapshot, with the row
 * counts of that SAME snapshot (exact comparison later, even while the garage works).
 */
export async function dumpDatabase(sourceUrl, file, pgBin = findPgBin("pg_dump")) {
  const src = splitUrl(sourceUrl);
  const client = new pg.Client({ connectionString: sourceUrl });
  await client.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ, READ ONLY");
    const snap = (await client.query("SELECT pg_export_snapshot() AS s")).rows[0].s;
    const counts = await tableCounts(client);
    const version = (await client.query("SHOW server_version")).rows[0].server_version;
    await run(pgBin, ["--format=custom", "--no-owner", "--no-privileges", "--schema=public", `--snapshot=${snap}`, `--file=${file}`, `--dbname=${src.url}`], { PGPASSWORD: src.password });
    await client.query("COMMIT");
    return { counts, serverVersion: version };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    await client.end();
  }
}

/**
 * The real proof: restores the dump into a NEW throw-away database on the
 * test server, compares every table's row count, then drops that database.
 */
export async function restoreCheck(dumpFile, expectedCounts, adminUrl, pgRestore = findPgBin("pg_restore")) {
  const name = `gp_restore_check_${Date.now()}_${randomBytes(3).toString("hex")}`;
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE ${name}`);
    const target = new URL(adminUrl);
    target.pathname = `/${name}`;
    await restoreDump(dumpFile, target.toString(), pgRestore);
    const c = new pg.Client({ connectionString: target.toString() });
    await c.connect();
    let restored;
    try {
      restored = await tableCounts(c);
    } finally {
      await c.end();
    }
    const diffs = [];
    for (const [table, n] of Object.entries(expectedCounts)) if (restored[table] !== n) diffs.push(`${table}: attendu ${n}, restauré ${restored[table] ?? "absent"}`);
    if (diffs.length) throw new Error(`Restauration incomplète : ${diffs.slice(0, 10).join(" ; ")}`);
    return { tables: Object.keys(restored).length, rows: Object.values(restored).reduce((a, b) => a + b, 0) };
  } finally {
    await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`).catch(() => {});
    await admin.end();
  }
}

// ── Full run ─────────────────────────────────────────────────────────────────

/**
 * @param {{ sourceUrl: string, dir: string, copyDir?: string, keyFile: string, keep?: number, restoreAdminUrl?: string, now?: Date }} o
 */
export async function runBackup(o) {
  const key = await loadKey(o.keyFile);
  await mkdir(o.dir, { recursive: true });
  const name = backupName(o.now ?? new Date());
  const tmp = await import("node:fs/promises").then((m) => m.mkdtemp(path.join(os.tmpdir(), "gp-backup-")));
  const plain = path.join(tmp, "dump.pgc");
  const encrypted = path.join(o.dir, name);
  try {
    const { counts, serverVersion } = await dumpDatabase(o.sourceUrl, plain);
    const sha256Plain = await sha256File(plain);
    const sizePlain = (await stat(plain)).size;
    await encryptFile(plain, encrypted, key);
    await rm(plain, { force: true });

    // Verify the ENCRYPTED file, exactly as it would be used on the day of a restore.
    const verified = await verifyBackup(encrypted, key, { expectedSha256: sha256Plain, counts, restoreAdminUrl: o.restoreAdminUrl });

    const manifest = {
      file: name,
      createdAt: (o.now ?? new Date()).toISOString(),
      source: { host: splitUrl(o.sourceUrl).host, database: splitUrl(o.sourceUrl).database, serverVersion },
      sizePlain,
      sha256Plain,
      sizeEncrypted: (await stat(encrypted)).size,
      sha256Encrypted: await sha256File(encrypted),
      tables: Object.keys(counts).length,
      rows: Object.values(counts).reduce((a, b) => a + b, 0),
      counts,
      verification: verified.level, // "restore" (proven) or "integrity" (decrypt + checksum + catalogue only)
      copies: [],
    };
    await writeFile(`${encrypted}.json`, JSON.stringify(manifest, null, 2));

    if (o.copyDir) {
      await mkdir(o.copyDir, { recursive: true });
      const copy = path.join(o.copyDir, name);
      await copyFile(encrypted, copy);
      await copyFile(`${encrypted}.json`, `${copy}.json`);
      if ((await sha256File(copy)) !== manifest.sha256Encrypted) throw new Error(`Copie altérée dans ${o.copyDir}`);
      manifest.copies.push(o.copyDir);
      await writeFile(`${encrypted}.json`, JSON.stringify(manifest, null, 2));
      await writeFile(`${copy}.json`, JSON.stringify(manifest, null, 2));
      await prune(o.copyDir, o.keep ?? 14);
    }
    await prune(o.dir, o.keep ?? 14);
    return manifest;
  } catch (e) {
    await rm(encrypted, { force: true }).catch(() => {});
    throw e;
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

/** Decrypt + checksum + catalogue; and, when a test server is given, a full restore check. */
export async function verifyBackup(encrypted, key, { expectedSha256, counts, restoreAdminUrl } = {}) {
  const tmp = await import("node:fs/promises").then((m) => m.mkdtemp(path.join(os.tmpdir(), "gp-verify-")));
  const plain = path.join(tmp, "dump.pgc");
  try {
    await decryptFile(encrypted, plain, key);
    if (expectedSha256 && (await sha256File(plain)) !== expectedSha256) throw new Error("Empreinte SHA-256 différente après déchiffrement.");
    await run(findPgBin("pg_restore"), ["--list", plain], {});
    if (restoreAdminUrl && counts) {
      const r = await restoreCheck(plain, counts, restoreAdminUrl);
      return { level: "restore", ...r };
    }
    return { level: "integrity" };
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

async function prune(dir, keep) {
  const names = await readdir(dir);
  for (const n of selectForDeletion(names, keep)) {
    await unlink(path.join(dir, n)).catch(() => {});
    await unlink(path.join(dir, `${n}.json`)).catch(() => {});
  }
}

/** Restore a backup into a NEW, EMPTY database (never over an existing one). */
export async function restoreInto(encrypted, key, targetUrl) {
  const t = splitUrl(targetUrl);
  const client = new pg.Client({ connectionString: targetUrl });
  await client.connect();
  try {
    const { rows } = await client.query(`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'`);
    if (rows[0].n > 0) throw new Error(`La base « ${t.database} » n'est pas vide : la restauration se fait toujours dans une base NOUVELLE et vide.`);
  } finally {
    await client.end();
  }
  const tmp = await import("node:fs/promises").then((m) => m.mkdtemp(path.join(os.tmpdir(), "gp-restore-")));
  const plain = path.join(tmp, "dump.pgc");
  try {
    await decryptFile(encrypted, plain, key);
    await restoreDump(plain, targetUrl);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}
