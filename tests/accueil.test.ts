/** V15 — file d'attente de l'accueil : règles pures (ordre de priorité, estimation, masquage, 3 appels). */
import { describe, expect, it } from "vitest";
import {
  asciiOnly,
  callOutcome,
  computeStats,
  escposTicket,
  estimateWait,
  maskPlate,
  numberFromCounter,
  onTimeAppointment,
  orderQueue,
  peopleAhead,
  priorityGroup,
  queueMessage,
  ticketLabel,
  ticketsCsv,
  validKioskPhone,
} from "@/lib/accueil";

const T0 = new Date("2026-10-22T08:00:00Z");
const at = (min: number) => new Date(T0.getTime() + min * 60_000);
const tk = (id: string, takenMin: number, extra: Partial<{ priority: number; apptAt: Date | null; reasonFast: boolean }> = {}) => ({
  id,
  takenAt: at(takenMin),
  priority: extra.priority ?? 0,
  apptAt: extra.apptAt ?? null,
  reasonFast: extra.reasonFast ?? false,
});
const rules = { apptWindowMin: 15, fastFirst: false };

describe("V15 order of service", () => {
  it("arrival order when nothing else applies", () => {
    expect(orderQueue([tk("c", 10), tk("a", 1), tk("b", 5)], at(20), rules).map((t) => t.id)).toEqual(["a", "b", "c"]);
  });

  it("an on-time appointment goes first; the earliest appointment before a later one", () => {
    const q = [tk("walk1", 0), tk("walk2", 2), tk("rdv930", 20, { apptAt: at(30) }), tk("rdv920", 18, { apptAt: at(20) })];
    expect(orderQueue(q, at(25), rules).map((t) => t.id)).toEqual(["rdv920", "rdv930", "walk1", "walk2"]);
    expect(priorityGroup(q[2]!, at(25), rules)).toBe("APPOINTMENT");
  });

  it("appointment window: too early → not yet prioritised; late beyond the window → arrival order", () => {
    const early = tk("early", 0, { apptAt: at(120) }); // 2 h before the appointment
    expect(onTimeAppointment(early, at(10), 15)).toBe(false);
    expect(onTimeAppointment(early, at(110), 15)).toBe(true); // window reached
    const late = tk("late", 50, { apptAt: at(30) }); // 20 min late, window 15
    expect(onTimeAppointment(late, at(50), 15)).toBe(false);
    expect(orderQueue([late, tk("walk", 40)], at(55), rules).map((t) => t.id)).toEqual(["walk", "late"]);
    const justLate = tk("justLate", 40, { apptAt: at(30) }); // 10 min late, inside the window
    expect(orderQueue([tk("walk", 0), justLate], at(41), rules)[0]!.id).toBe("justLate");
  });

  it("quick reasons (payment / pick-up) first only when the option is on, after appointments", () => {
    const q = [tk("drop", 0), tk("pay", 5, { reasonFast: true }), tk("rdv", 6, { apptAt: at(10) })];
    expect(orderQueue(q, at(8), rules).map((t) => t.id)).toEqual(["rdv", "drop", "pay"]);
    expect(orderQueue(q, at(8), { ...rules, fastFirst: true }).map((t) => t.id)).toEqual(["rdv", "pay", "drop"]);
  });

  it("manual priority beats everything; people ahead", () => {
    const q = orderQueue([tk("a", 0), tk("vip", 9, { priority: 1 }), tk("rdv", 1, { apptAt: at(5) })], at(6), rules);
    expect(q.map((t) => t.id)).toEqual(["vip", "rdv", "a"]);
    expect(peopleAhead(q, "a")).toBe(2);
    expect(peopleAhead(q, "zzz")).toBeNull();
  });
});

describe("V15 waiting time estimate (real average, « — » when not enough)", () => {
  const s = (taken: number, called: number | null) => ({ takenAt: at(taken), calledAt: called === null ? null : at(called) });

  it("mean of the last N called tickets of the window", () => {
    // most recent first by calledAt: waits 10, 20, 30 (window 2 → 10 and 20 → 15)
    const samples = [s(0, 30), s(40, 60), s(80, 90), s(100, null)];
    expect(estimateWait(samples, { window: 2, min: 2 })).toBe(15);
    expect(estimateWait(samples, { window: 3, min: 3 })).toBe(20);
  });

  it("not enough real tickets → null (shown « — »), uncalled tickets ignored", () => {
    expect(estimateWait([s(0, 10), s(5, null)], { window: 20, min: 3 })).toBeNull();
    expect(estimateWait([], { window: 20, min: 1 })).toBeNull();
  });
});

describe("V15 public screen privacy: masked plate", () => {
  it("hides the end of the plate", () => {
    expect(maskPlate("215TU1234")).toBe("215 TU 12**");
    expect(maskPlate("215 tu 1234")).toBe("215 TU 12**");
    expect(maskPlate("12RS345")).toBe("12 RS 3**");
    expect(maskPlate("AB12")).toBe("AB**");
    expect(maskPlate(null)).toBeNull();
    expect(maskPlate("")).toBeNull();
    const m = maskPlate("215TU1234")!;
    expect(m).not.toContain("1234");
  });
});

describe("V15 call rule (3 calls without answer → ABSENT)", () => {
  const r = { maxCalls: 3, callTimeoutSec: 60 };
  it("too soon, recall allowed, then absent after the 3rd call's delay", () => {
    const now = at(0);
    expect(callOutcome({ status: "CALLED", callCount: 1, calledAt: new Date(now.getTime() - 30_000) }, now, r)).toBe("WAIT");
    expect(callOutcome({ status: "CALLED", callCount: 1, calledAt: new Date(now.getTime() - 61_000) }, now, r)).toBe("RECALL");
    expect(callOutcome({ status: "CALLED", callCount: 2, calledAt: new Date(now.getTime() - 61_000) }, now, r)).toBe("RECALL");
    expect(callOutcome({ status: "CALLED", callCount: 3, calledAt: new Date(now.getTime() - 30_000) }, now, r)).toBe("WAIT");
    expect(callOutcome({ status: "CALLED", callCount: 3, calledAt: new Date(now.getTime() - 61_000) }, now, r)).toBe("ABSENT");
    expect(callOutcome({ status: "WAITING", callCount: 0, calledAt: null }, now, r)).toBe("NONE");
    expect(callOutcome({ status: "CALLED", callCount: 2, calledAt: new Date(now.getTime() - 61_000) }, now, { ...r, maxCalls: 2 })).toBe("ABSENT");
  });
});

describe("V15 numbering, stats, messages, printer", () => {
  it("daily number; with a hub the garage takes odd numbers, online even ones", () => {
    expect([1, 2, 3].map((n) => numberFromCounter(n, "single"))).toEqual([1, 2, 3]);
    expect([1, 2, 3].map((n) => numberFromCounter(n, "odd"))).toEqual([1, 3, 5]);
    expect([1, 2, 3].map((n) => numberFromCounter(n, "even"))).toEqual([2, 4, 6]);
    expect(ticketLabel("A", 12)).toBe("A-12");
  });

  it("statistics by reason / hour / day, absent rate, peak hours", () => {
    const rows = [
      { reasonId: "r1", status: "DONE", takenAt: new Date("2026-10-22T07:00:00Z"), calledAt: new Date("2026-10-22T07:10:00Z") },
      { reasonId: "r1", status: "DONE", takenAt: new Date("2026-10-22T07:20:00Z"), calledAt: new Date("2026-10-22T07:50:00Z") },
      { reasonId: "r2", status: "ABSENT", takenAt: new Date("2026-10-22T07:30:00Z"), calledAt: new Date("2026-10-22T07:35:00Z") },
      { reasonId: "r2", status: "WAITING", takenAt: new Date("2026-10-22T09:00:00Z"), calledAt: null },
    ];
    const s = computeStats(rows, "Africa/Tunis");
    expect(s.total.count).toBe(4);
    expect(s.byReason.get("r1")).toMatchObject({ count: 2, avgWait: 20, maxWait: 30 });
    expect(s.byReason.get("r2")).toMatchObject({ count: 2, absent: 1, avgWait: 5 });
    expect(s.absentRate).toBe(25);
    expect(s.byHour.map((h) => h.hour)).toEqual([8, 10]); // Tunis = UTC+1
    expect(s.peakHours[0]).toBe(8);
    expect(s.byDay).toHaveLength(1);
  });

  it("messages fr / ar; CSV without phone or name", () => {
    expect(queueMessage("fr", "called", { garage: "Garage X", ticket: "A-12", counter: "Guichet 1" })).toBe("Garage X : c'est votre tour ! Ticket A-12, Guichet 1.");
    expect(queueMessage("ar", "ahead", { garage: "G", ticket: "B-3", n: 2, url: null })).toContain("B-3");
    expect(queueMessage("fr", "ahead", { garage: "G", ticket: "B-3", n: 2, url: "http://x/accueil/t/abc" })).toContain("Suivi : http://x/accueil/t/abc");
    const csv = ticketsCsv([{ day: "2026-10-22", label: "A-1", reason: "Dépôt", status: "DONE", takenAt: T0, calledAt: at(12), doneAt: at(20), callCount: 1, counter: "Guichet 1" }], "Africa/Tunis");
    expect(csv.split("\r\n")[0]).toContain("Jour;Ticket;Motif");
    expect(csv).toContain("A-1;Dépôt;DONE;09:00;09:12;09:20;12;1;Guichet 1");
  });

  it("ESC/POS ticket: ASCII only, big number, cut", () => {
    const bytes = escposTicket({ garage: "Garage Élan", label: "A-12", reason: "Dépôt", time: "09:00", wait: null });
    const text = String.fromCharCode(...bytes);
    expect(text).toContain("Garage Elan");
    expect(text).toContain("A-12");
    expect(bytes.at(-3)).toBe(0x56);
    expect(asciiOnly("إيداع")).toBe("");
  });

  it("kiosk phone: 8 Tunisian digits", () => {
    expect(validKioskPhone("20 111 222")).toBe("20111222");
    expect(validKioskPhone("+216 20111222")).toBe("20111222");
    expect(validKioskPhone("0021698765432")).toBe("98765432");
    expect(validKioskPhone("1234")).toBeNull();
    expect(validKioskPhone("01234567")).toBeNull();
  });
});
