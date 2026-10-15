import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Concurrency of the limits (portal PIN, booking). The in-memory Prisma below
 * behaves like PostgreSQL where it matters: every query yields to the event
 * loop (so parallel requests really interleave), and pg_advisory_xact_lock
 * blocks other transactions on the same key until commit.
 */
const db = vi.hoisted(() => ({
  attempts: [] as { id: string; key: string; ok: boolean; createdAt: Date }[],
  lookups: 0,
  booked: 0,
  failBooking: false,
  locks: new Map<string, Promise<void>>(),
  seq: 0,
}));
const tick = () => new Promise((r) => setTimeout(r, 1));

vi.mock("@/lib/prisma", () => {
  type Where = { key?: string; createdAt?: { gte: Date }; ok?: boolean; id?: { in: string[] } };
  const match = (a: (typeof db.attempts)[number], w: Where) =>
    (w.key === undefined || a.key === w.key) &&
    (w.createdAt === undefined || a.createdAt >= w.createdAt.gte) &&
    (w.ok === undefined || a.ok === w.ok) &&
    (w.id === undefined || w.id.in.includes(a.id));
  const portalAttempt = {
    count: async ({ where }: { where: Where }) => (await tick(), db.attempts.filter((a) => match(a, where)).length),
    create: async ({ data }: { data: { key: string; ok: boolean } }) => {
      await tick();
      const row = { id: `a${++db.seq}`, ...data, createdAt: new Date() };
      db.attempts.push(row);
      return { id: row.id };
    },
    updateMany: async ({ where, data }: { where: Where; data: { ok: boolean } }) => {
      for (const a of db.attempts.filter((x) => match(x, where))) a.ok = data.ok;
      return { count: 1 };
    },
    deleteMany: async ({ where }: { where: Where }) => {
      db.attempts = db.attempts.filter((a) => !(where.id && match(a, where)));
      return { count: 0 };
    },
  };
  return {
    prisma: {
      portalAttempt,
      workOrder: {
        findFirst: async () => {
          db.lookups++;
          await tick();
          return null; // every guess is wrong
        },
      },
      $transaction: async <T,>(fn: (tx: unknown) => Promise<T>) => {
        const held: (() => void)[] = [];
        const tx = {
          portalAttempt,
          // Tagged template: values[0] is the lock key.
          $executeRaw: async (_s: TemplateStringsArray, key: string) => {
            const prev = db.locks.get(key) ?? Promise.resolve();
            let release!: () => void;
            const mine = new Promise<void>((r) => (release = r));
            db.locks.set(key, prev.then(() => mine));
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
      },
    },
  };
});
vi.mock("@/server/portal-session", () => ({
  clientIp: async () => "203.0.113.7",
  isTrackable: () => true,
  startPortalSession: async () => {},
  endPortalSession: async () => {},
  getPortalWorkOrderId: async () => null,
}));
vi.mock("@/server/settings", () => ({ getSettings: async () => ({}) }));
vi.mock("@/lib/i18n/server", async () => {
  const { fr } = await import("@/lib/i18n/fr");
  return { getI18n: async () => ({ t: fr, lang: "fr" }) };
});
vi.mock("@/server/booking", () => ({
  createAppointment: async () => {
    await tick();
    if (db.failBooking) throw new Error("slot taken");
    db.booked++;
    return { id: `ap${db.booked}`, reference: `RDV-${db.booked}` };
  },
  sendBookingConfirmation: async () => [],
  manageToken: () => "tok",
  cancelByCustomer: async () => {},
}));

const { portalLogin } = await import("@/server/portal");
const { createBookingAction } = await import("@/actions/portal");

function bookingForm() {
  const f = new FormData();
  for (const [k, v] of Object.entries({
    serviceId: "c1234567890abcdefghijklm",
    date: "2026-10-20",
    time: "09:00",
    firstName: "Test",
    lastName: "Client",
    phone: "+216 20 111 222",
    plate: "120TU3450",
  }))
    f.set(k, v);
  return f;
}

beforeEach(() => {
  db.attempts = [];
  db.lookups = 0;
  db.booked = 0;
  db.failBooking = false;
  db.locks.clear();
  vi.stubEnv("APP_URL", "https://garage.example");
});

describe("portal PIN limit under concurrent requests", () => {
  it("50 guesses fired at once: at most 5 PIN lookups, the rest are locked", async () => {
    const results = await Promise.all(Array.from({ length: 50 }, (_, i) => portalLogin("120TU3450", String(1000 + i))));
    expect(db.lookups).toBeLessThanOrEqual(5);
    expect(results.filter((r) => r === "invalid")).toHaveLength(5);
    expect(results.filter((r) => r === "locked")).toHaveLength(45);
  });
  it("sequential guesses: 5 tries, then locked", async () => {
    const out: string[] = [];
    for (let i = 0; i < 7; i++) out.push(await portalLogin("120TU3450", "0000"));
    expect(out).toEqual(["invalid", "invalid", "invalid", "invalid", "invalid", "locked", "locked"]);
  });
});

describe("booking limit (5 per IP per hour) under concurrent requests", () => {
  it("20 bookings fired at once: exactly 5 are created", async () => {
    const results = await Promise.all(Array.from({ length: 20 }, () => createBookingAction(bookingForm())));
    expect(db.booked).toBe(5);
    expect(results.filter((r) => r.ok)).toHaveLength(5);
  });
  it("a booking that fails (slot taken) does not use up the quota", async () => {
    db.failBooking = true;
    for (let i = 0; i < 6; i++) expect((await createBookingAction(bookingForm())).ok).toBe(false);
    db.failBooking = false;
    expect((await createBookingAction(bookingForm())).ok).toBe(true);
  });
  it("refuses to book in production without APP_URL (no link built from Host headers)", async () => {
    vi.stubEnv("APP_URL", "");
    vi.stubEnv("NODE_ENV", "production");
    const r = await createBookingAction(bookingForm());
    expect(r.ok).toBe(false);
    expect(db.booked).toBe(0);
    vi.unstubAllEnvs();
  });
});
