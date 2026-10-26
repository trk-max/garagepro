/**
 * staff-ux — manual reception ticket sent to the customer's phone / e-mail (npm run test:db).
 * Messages go through a fake sender (nothing leaves the PC).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@/lib/auth", () => ({ auth: async () => (session.userId ? { user: { id: session.userId } } : null) }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
}));

const q = await import("@/server/accueil");
const { deskManualTicketAction } = await import("@/actions/accueil");
const { makeUser, prisma } = await import("./helpers/db");
import type { Sender } from "@/server/reminders";
import type { StaffUser } from "@/lib/session";

let n = 0;
const uniq = () => `${Date.now().toString(36)}${(n++).toString(36)}`;

function fakeSender(channels: ("SMS" | "EMAIL")[] = ["SMS", "EMAIL"]) {
  const sms: { to: string; text: string }[] = [];
  const mails: { to: string; text: string }[] = [];
  const sender: Sender = {
    channels: () => channels,
    sms: async (to, text) => {
      sms.push({ to, text });
      return { ok: true };
    },
    email: async (msg) => {
      mails.push({ to: msg.to, text: msg.text });
      return { ok: true, id: "e1" };
    },
  };
  return { sender, sms, mails };
}

async function reason() {
  return prisma.queueReason.create({ data: { code: `M_${uniq()}`.toUpperCase().slice(0, 20), prefix: `M${String.fromCharCode(65 + (n++ % 26))}`, nameFr: "Motif", kind: "OTHER" } });
}

const form = (data: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(data)) f.set(k, v);
  return f;
};

beforeEach(() => {
  session.userId = null;
});

describe("manual ticket message", () => {
  it("is never sent without consent (phone dropped, no notification row)", async () => {
    const r = await reason();
    const actor = (await makeUser("RECEPTION")) as StaffUser;
    const { sender, sms } = fakeSender();
    const created = await q.createTicket({ reasonId: r.id, source: "DESK", actor, phone: "22123456", email: "a@b.tn", consent: false });
    expect(created.ticket.phone).toBeNull();
    expect(created.ticket.email).toBeNull();
    expect(created.ticket.notifyConsent).toBe(false);
    expect(await q.notifyTicketTaken(created.ticket.id, { sender })).toBe("NONE");
    expect(sms).toHaveLength(0);
    expect(await prisma.notification.count({ where: { dedupeKey: `queue:${created.ticket.id}:taken` } })).toBe(0);
  });

  it("with consent: the number and the public tracking link go to the phone and the e-mail, once", async () => {
    const r = await reason();
    const actor = (await makeUser("RECEPTION")) as StaffUser;
    const { sender, sms, mails } = fakeSender();
    const created = await q.createTicket({ reasonId: r.id, source: "DESK", actor, phone: "22123456", email: "Client@Mail.tn", consent: true, lang: "fr" });
    expect(created.ticket.email).toBe("client@mail.tn");
    expect(await q.notifyTicketTaken(created.ticket.id, { sender })).toBe("SENT");
    expect(sms).toHaveLength(1);
    expect(sms[0]!.text).toContain(created.label);
    expect(sms[0]!.text).toContain(`/accueil/t/${created.ticket.trackToken}`);
    expect(mails).toHaveLength(1);
    expect(mails[0]).toMatchObject({ to: "client@mail.tn" });
    // Deduplicated: a second call sends nothing more.
    await q.notifyTicketTaken(created.ticket.id, { sender });
    expect(sms).toHaveLength(1);
  });

  it("no channel configured: recorded as SKIPPED, never a fake « sent »", async () => {
    const r = await reason();
    const actor = (await makeUser("RECEPTION")) as StaffUser;
    const { sender, sms } = fakeSender([]);
    const created = await q.createTicket({ reasonId: r.id, source: "DESK", actor, phone: "22123457", consent: true });
    expect(await q.notifyTicketTaken(created.ticket.id, { sender })).toBe("SKIPPED");
    expect(sms).toHaveLength(0);
    const row = await prisma.notification.findFirstOrThrow({ where: { dedupeKey: `queue:${created.ticket.id}:taken` } });
    expect(row).toMatchObject({ channel: "NONE", status: "SKIPPED" });
  });

  it("an e-mail-only ticket also gets « c'est votre tour »", async () => {
    const r = await reason();
    const actor = (await makeUser("RECEPTION")) as StaffUser;
    const { sender, mails } = fakeSender(["EMAIL"]);
    const created = await q.createTicket({ reasonId: r.id, source: "DESK", actor, email: "only@mail.tn", consent: true });
    await prisma.queueTicket.update({ where: { id: created.ticket.id }, data: { status: "CALLED", callCount: 1 } });
    await q.notifyAfterCall([created.ticket.id], { sender });
    expect(mails.some((m) => m.to === "only@mail.tn" && m.text.includes(created.label))).toBe(true);
  });
});

describe("deskManualTicketAction", () => {
  it("refuses a phone without consent, and opens the ticket page otherwise", async () => {
    const r = await reason();
    const u = await makeUser("RECEPTION");
    session.userId = u.id;
    const refused = await deskManualTicketAction(form({ reasonId: r.id, phone: "22123458" }));
    expect(refused.ok).toBe(false);
    const ok = await deskManualTicketAction(form({ reasonId: r.id }));
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.data?.redirectTo).toMatch(/^\/garage\/accueil\/ticket\?t=/);
  });

  it("needs the reception permission", async () => {
    const r = await reason();
    const u = await makeUser("MECHANIC");
    session.userId = u.id;
    const res = await deskManualTicketAction(form({ reasonId: r.id }));
    expect(res.ok).toBe(false);
  });
});
