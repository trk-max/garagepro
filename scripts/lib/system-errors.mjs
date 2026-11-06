import { createHash } from "node:crypto";

export async function recordSystemError(db, source, place, message) {
  const fingerprint = createHash("sha256").update(`${source}\u0000${place}\u0000${message}`).digest("hex");
  const now = new Date();
  try {
    await db.query(
      `INSERT INTO "SystemError"
        (id, fingerprint, source, place, message, count, "firstSeenAt", "lastSeenAt", "createdAt", "updatedAt")
       VALUES ($1, $1, $2, $3, $4, 1, $5, $5, $5, $5)
       ON CONFLICT (fingerprint) DO UPDATE SET
         count = "SystemError".count + 1,
         "lastSeenAt" = EXCLUDED."lastSeenAt",
         "updatedAt" = EXCLUDED."updatedAt"`,
      [fingerprint, source, place, message, now],
    );
  } catch {
    console.error("[monitoring] could not persist a system error");
    return;
  }
  try {
    await db.query(`DELETE FROM "SystemError" WHERE "lastSeenAt" < $1`, [new Date(now.getTime() - 30 * 86_400_000)]);
  } catch {
    console.error("[monitoring] could not prune expired system errors");
  }
}
