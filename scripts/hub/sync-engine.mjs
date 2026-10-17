/**
 * GaragePro — synchronisation between the garage PC's LOCAL database (the hub,
 * used by the team on the garage Wi-Fi, with or without internet) and the
 * ONLINE database (Supabase, used by the website and by staff away from the
 * garage).
 *
 * How it works
 * - Both databases keep a change log (_sync_log), filled by triggers
 *   (prisma/migrations/3_sync_log): one line per inserted/updated/deleted row.
 * - A sync round reads the new lines on each side since the last round, and
 *   copies the CURRENT version of each changed row to the other side (or
 *   deletes it there). Rows are written with `garagepro.sync = on`, so the
 *   copies are not logged again (no ping-pong).
 * - Same row changed on both sides since the last round: the most recent change
 *   wins ("last write wins"); on a tie, the garage wins.
 * - Parents are written before children and deletions go children first, using
 *   the foreign keys read from the database itself (no hard-coded table list).
 * - A row that cannot be written (e.g. the same plate created on both sides) is
 *   kept in the error list and retried at the next rounds.
 *
 * Plain Node + `pg`, so it runs on the garage PC without building anything.
 */

/** Never copied: the sync tables themselves, Prisma's history, per-server login counters. */
export const EXCLUDED = new Set(["_sync_log", "_sync_state", "_prisma_migrations", "PortalAttempt"]);
const MAX_RETRIES = 20;

const q = (name) => `"${String(name).replace(/"/g, '""')}"`;

// ── Schema discovery ──────────────────────────────────────────────────────────

export async function loadSchema(db) {
  const { rows: tables } = await db.query(`
    SELECT c.relname AS tbl, a.attname AS pk
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
    JOIN pg_index i ON i.indrelid = c.oid AND i.indisprimary AND i.indnatts = 1
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = i.indkey[0]
    WHERE c.relkind = 'r'`);
  const pk = new Map(tables.filter((t) => !EXCLUDED.has(t.tbl)).map((t) => [t.tbl, t.pk]));

  const { rows: fks } = await db.query(`
    SELECT DISTINCT cl.relname AS child, pr.relname AS parent
    FROM pg_constraint co
    JOIN pg_class cl ON cl.oid = co.conrelid
    JOIN pg_class pr ON pr.oid = co.confrelid
    JOIN pg_namespace n ON n.oid = cl.relnamespace AND n.nspname = 'public'
    WHERE co.contype = 'f'`);

  const { rows: cols } = await db.query(`
    SELECT table_name AS tbl, column_name AS col
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position`);
  const columns = new Map();
  for (const { tbl, col } of cols) {
    if (!pk.has(tbl)) continue;
    if (!columns.has(tbl)) columns.set(tbl, []);
    columns.get(tbl).push(col);
  }

  return { pk, columns, order: topoOrder([...pk.keys()], fks) };
}

/** Parents before children (Kahn's algorithm; a cycle, if any, is appended as is). */
export function topoOrder(tables, fks) {
  const parents = new Map(tables.map((t) => [t, new Set()]));
  for (const { child, parent } of fks) {
    if (child !== parent && parents.has(child) && parents.has(parent)) parents.get(child).add(parent);
  }
  const order = [];
  const done = new Set();
  let progress = true;
  while (progress) {
    progress = false;
    for (const t of [...tables].sort()) {
      if (done.has(t)) continue;
      if ([...parents.get(t)].every((p) => done.has(p))) {
        order.push(t);
        done.add(t);
        progress = true;
      }
    }
  }
  for (const t of tables) if (!done.has(t)) order.push(t);
  return order;
}

// ── Change log ────────────────────────────────────────────────────────────────

/**
 * Pending changes, oldest first (at most `limit` log lines per round), reduced
 * to the last change of each row. The log is a queue: the lines read are
 * deleted by id after the round (see `ack`), so a line committed late by a slow
 * transaction is never skipped — it is simply read at the next round.
 */
export async function readChanges(db, limit = 5000) {
  const { rows } = await db.query(`SELECT id::text AS id, tbl, row_id, op, at FROM "_sync_log" ORDER BY id LIMIT $1`, [limit]);
  const last = new Map();
  for (const r of rows) last.set(`${r.tbl}\u0000${r.row_id}`, { tbl: r.tbl, id: r.row_id, op: r.op, at: r.at });
  return { ids: rows.map((r) => r.id), changes: [...last.values()].filter((c) => !EXCLUDED.has(c.tbl)) };
}

/** Removes the log lines handled in this round. */
async function ack(db, ids) {
  if (ids.length) await db.query(`DELETE FROM "_sync_log" WHERE id = ANY($1::bigint[])`, [ids]);
}

async function fetchRows(db, schema, changes) {
  const byTable = new Map();
  for (const c of changes) {
    if (c.op !== "U" || !schema.pk.has(c.tbl)) continue;
    if (!byTable.has(c.tbl)) byTable.set(c.tbl, []);
    byTable.get(c.tbl).push(c.id);
  }
  const rows = new Map();
  for (const [tbl, ids] of byTable) {
    const pk = schema.pk.get(tbl);
    const { rows: found } = await db.query(`SELECT row_to_json(t) AS r FROM ${q(tbl)} t WHERE t.${q(pk)}::text = ANY($1::text[])`, [ids]);
    for (const { r } of found) rows.set(`${tbl}\u0000${r[pk]}`, r);
  }
  return rows;
}

// ── Writing ───────────────────────────────────────────────────────────────────

function upsertSql(schema, tbl, sourceRow) {
  const pk = schema.pk.get(tbl);
  const cols = (schema.columns.get(tbl) ?? []).filter((c) => Object.hasOwn(sourceRow, c));
  const list = cols.map(q).join(", ");
  const updates = cols.filter((c) => c !== pk).map((c) => `${q(c)} = EXCLUDED.${q(c)}`);
  return (
    `INSERT INTO ${q(tbl)} (${list}) SELECT ${list} FROM json_populate_record(NULL::${q(tbl)}, $1::json) ` +
    `ON CONFLICT (${q(pk)}) DO ${updates.length ? `UPDATE SET ${updates.join(", ")}` : "NOTHING"}`
  );
}

/**
 * Applies operations [{ tbl, id, op: "U"|"D", row }] in one transaction, with
 * the sync flag on (not re-logged). Each row in its own savepoint: one bad row
 * never blocks the others. Returns the failed operations.
 */
export async function applyOps(db, schema, ops) {
  const rank = new Map(schema.order.map((t, i) => [t, i]));
  const upserts = ops.filter((o) => o.op === "U" && o.row).sort((a, b) => rank.get(a.tbl) - rank.get(b.tbl));
  const deletes = ops.filter((o) => o.op === "D").sort((a, b) => rank.get(b.tbl) - rank.get(a.tbl));
  const failed = [];
  if (!upserts.length && !deletes.length) return failed;

  await db.query("BEGIN");
  try {
    await db.query("SET LOCAL garagepro.sync = 'on'");
    for (const o of [...upserts, ...deletes]) {
      await db.query("SAVEPOINT row_op");
      try {
        if (o.op === "U") await db.query(upsertSql(schema, o.tbl, o.row), [JSON.stringify(o.row)]);
        else await db.query(`DELETE FROM ${q(o.tbl)} WHERE ${q(schema.pk.get(o.tbl))}::text = $1`, [o.id]);
        await db.query("RELEASE SAVEPOINT row_op");
      } catch (error) {
        await db.query("ROLLBACK TO SAVEPOINT row_op");
        failed.push({ ...o, error: error.message });
      }
    }
    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK").catch(() => {});
    throw error;
  }
  return failed;
}

// ── State (kept in the LOCAL database) ────────────────────────────────────────

export async function getState(db, key, fallback) {
  const { rows } = await db.query(`SELECT value FROM "_sync_state" WHERE key = $1`, [key]);
  return rows[0]?.value ?? fallback;
}

export async function setState(db, key, value) {
  await db.query(
    `INSERT INTO "_sync_state" (key, value, "updatedAt") VALUES ($1, $2::jsonb, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, "updatedAt" = now()`,
    [key, JSON.stringify(value)],
  );
}

/** Puts failed rows back in the source log so the next round tries them again. */
async function relog(db, ops) {
  for (const o of ops) await db.query(`INSERT INTO "_sync_log" (tbl, row_id, op) VALUES ($1, $2, $3)`, [o.tbl, o.id, o.op]);
}

// ── One round ─────────────────────────────────────────────────────────────────

/**
 * One synchronisation round between `local` (garage hub) and `cloud` (online).
 * Both are connected `pg` clients. Returns a report.
 */
export async function syncOnce(local, cloud, { now = () => new Date() } = {}) {
  const schema = await loadSchema(local);
  const retries = await getState(local, "retries", {});

  const [fromLocal, fromCloud] = await Promise.all([readChanges(local), readChanges(cloud)]);

  // Same row changed on both sides: the most recent change wins (tie → garage).
  const key = (c) => `${c.tbl}\u0000${c.id}`;
  const cloudByKey = new Map(fromCloud.changes.map((c) => [key(c), c]));
  const conflicts = [];
  const push = [];
  for (const c of fromLocal.changes) {
    const other = cloudByKey.get(key(c));
    if (other) {
      conflicts.push({ tbl: c.tbl, id: c.id, winner: new Date(c.at) >= new Date(other.at) ? "garage" : "online" });
      if (new Date(c.at) >= new Date(other.at)) cloudByKey.delete(key(c));
      else continue;
    }
    push.push(c);
  }
  const pull = [...cloudByKey.values()];

  // Current version of each changed row (a row gone since then becomes a deletion).
  const [localRows, cloudRows] = await Promise.all([fetchRows(local, schema, push), fetchRows(cloud, schema, pull)]);
  const toOps = (changes, rows) =>
    changes
      .filter((c) => schema.pk.has(c.tbl))
      .map((c) => {
        const row = c.op === "U" ? rows.get(key(c)) : undefined;
        return row ? { tbl: c.tbl, id: c.id, op: "U", row } : { tbl: c.tbl, id: c.id, op: "D" };
      });

  const pushOps = toOps(push, localRows);
  const pullOps = toOps(pull, cloudRows);
  const pushFailed = await applyOps(cloud, schema, pushOps);
  const pullFailed = await applyOps(local, schema, pullOps);

  // Done with these log lines; the failures are queued again (limited retries).
  await ack(local, fromLocal.ids);
  await ack(cloud, fromCloud.ids);
  const nextRetries = {};
  const requeue = async (db, failedOps, side) => {
    const again = [];
    for (const f of failedOps) {
      const k = `${side}:${f.tbl}:${f.id}`;
      nextRetries[k] = (retries[k] ?? 0) + 1;
      if (nextRetries[k] <= MAX_RETRIES) again.push(f);
    }
    await relog(db, again);
  };
  await requeue(local, pushFailed, "push");
  await requeue(cloud, pullFailed, "pull");
  await setState(local, "retries", nextRetries);

  const report = {
    at: now().toISOString(),
    pushed: pushOps.length - pushFailed.length,
    pulled: pullOps.length - pullFailed.length,
    conflicts: conflicts.length,
    errors: [...pushFailed.map((f) => ({ side: "online", tbl: f.tbl, id: f.id, error: f.error })), ...pullFailed.map((f) => ({ side: "garage", tbl: f.tbl, id: f.id, error: f.error }))],
  };
  return report;
}

// ── First installation ────────────────────────────────────────────────────────

/** Copies every row of `from` into `to` (parents first), without logging. Returns rows copied per table. */
export async function copyAll(from, to, { batch = 500 } = {}) {
  const schema = await loadSchema(to);
  const copied = {};
  for (const tbl of schema.order) {
    const pk = schema.pk.get(tbl);
    let last = null;
    copied[tbl] = 0;
    for (;;) {
      const { rows } = await from.query(
        `SELECT row_to_json(t) AS r FROM ${q(tbl)} t ${last === null ? "" : `WHERE t.${q(pk)}::text > $2`} ORDER BY t.${q(pk)}::text LIMIT $1`,
        last === null ? [batch] : [batch, last],
      );
      if (!rows.length) break;
      const failed = await applyOps(
        to,
        schema,
        rows.map(({ r }) => ({ tbl, id: String(r[pk]), op: "U", row: r })),
      );
      if (failed.length) throw new Error(`Copie impossible (${tbl} ${failed[0].id}) : ${failed[0].error}`);
      copied[tbl] += rows.length;
      last = String(rows.at(-1).r[pk]);
    }
  }
  return copied;
}

/**
 * Numbers shown to people (work order "OR-0042", complaint "REC-0012") come from
 * PostgreSQL sequences. To never get the same number on both sides while they
 * are disconnected, the garage uses ODD numbers and the online site EVEN ones.
 */
export async function splitSequences(db, parity) {
  const { rows } = await db.query(`
    SELECT c.table_name AS tbl, c.column_name AS col, pg_get_serial_sequence(format('%I', c.table_name), c.column_name) AS seq
    FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.column_default LIKE 'nextval(%'`);
  const done = [];
  for (const { tbl, col, seq } of rows) {
    if (!seq || EXCLUDED.has(tbl)) continue;
    const { rows: m } = await db.query(`SELECT coalesce(max(${q(col)}), 0)::bigint AS max FROM ${q(tbl)}`);
    let next = BigInt(m[0].max) + 1n;
    const want = parity === "odd" ? 1n : 0n;
    if (next % 2n !== want) next += 1n;
    await db.query(`ALTER SEQUENCE ${seq} INCREMENT BY 2`);
    await db.query(`SELECT setval($1, $2, false)`, [seq, next.toString()]);
    done.push(`${tbl}.${col} → ${next} (+2)`);
  }
  return done;
}
