/**
 * In-memory stand-in for the PortalAttempt table + PostgreSQL advisory locks,
 * enough to run the real reserveAttempt() under concurrency: every query yields
 * to the event loop (parallel requests interleave) and pg_advisory_xact_lock
 * blocks other transactions on the same key until commit.
 */
type Row = { id: string; key: string; ok: boolean; createdAt: Date };
type Where = { key?: string; createdAt?: { gte: Date }; ok?: boolean; id?: { in: string[] } };

export const attemptsDb = { rows: [] as Row[], locks: new Map<string, Promise<void>>(), seq: 0 };
export const tick = () => new Promise((r) => setTimeout(r, 1));

const match = (a: Row, w: Where) =>
  (w.key === undefined || a.key === w.key) &&
  (w.createdAt === undefined || a.createdAt >= w.createdAt.gte) &&
  (w.ok === undefined || a.ok === w.ok) &&
  (w.id === undefined || w.id.in.includes(a.id));

export const portalAttempt = {
  count: async ({ where }: { where: Where }) => (await tick(), attemptsDb.rows.filter((a) => match(a, where)).length),
  create: async ({ data }: { data: { key: string; ok: boolean } }) => {
    await tick();
    const row = { id: `a${++attemptsDb.seq}`, ...data, createdAt: new Date() };
    attemptsDb.rows.push(row);
    return { id: row.id };
  },
  createMany: async ({ data }: { data: { key: string; ok: boolean }[] }) => {
    for (const d of data) attemptsDb.rows.push({ id: `a${++attemptsDb.seq}`, ...d, createdAt: new Date() });
    return { count: data.length };
  },
  updateMany: async ({ where, data }: { where: Where; data: { ok: boolean } }) => {
    const hit = attemptsDb.rows.filter((x) => match(x, where));
    for (const a of hit) a.ok = data.ok;
    return { count: hit.length };
  },
  deleteMany: async ({ where }: { where: Where }) => {
    const before = attemptsDb.rows.length;
    attemptsDb.rows = attemptsDb.rows.filter((a) => !(where.id && match(a, where)));
    return { count: before - attemptsDb.rows.length };
  },
};

export async function fakeTransaction<T>(fn: (tx: unknown) => Promise<T>, extra: Record<string, unknown> = {}): Promise<T> {
  const held: (() => void)[] = [];
  const tx = {
    ...extra,
    portalAttempt,
    $executeRaw: async (_s: TemplateStringsArray, key: string) => {
      const prev = attemptsDb.locks.get(key) ?? Promise.resolve();
      let release!: () => void;
      const mine = new Promise<void>((r) => (release = r));
      attemptsDb.locks.set(key, prev.then(() => mine));
      await prev;
      held.push(release);
      return 1;
    },
  };
  try {
    return await fn(tx);
  } finally {
    held.forEach((r) => r());
  }
}

export function resetAttempts() {
  attemptsDb.rows = [];
  attemptsDb.locks.clear();
  attemptsDb.seq = 0;
}
