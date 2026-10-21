import { describe, expect, it } from "vitest";
import { attendanceByDay } from "@/lib/attendance";
import { DEFAULT_OPENING_HOURS } from "@/lib/booking";
import { elapsedMinutes, minutesByUser, personMinutes, suggestedBilledX100 } from "@/lib/labor";
import { leaveBalance, leaveDaysInYear, spanDates, wholeDaysSpan, workingDays } from "@/lib/leaves";
import { ALLOWED_NEXT, ipAllowed, kioskCode, stateAfter, validNetworks, verifyKioskCode, windowAt } from "@/lib/timeclock";

const TZ = "Africa/Tunis";
const at = (s: string) => new Date(s);

describe("kiosk code (proof of presence)", () => {
  const secret = "s3cret";
  const now = at("2026-10-20T07:00:10Z");
  it("accepts the current and the previous code only", () => {
    const w = windowAt(now);
    expect(verifyKioskCode(secret, kioskCode(secret, w), now)).toBe(w);
    expect(verifyKioskCode(secret, kioskCode(secret, w - 1), now)).toBe(w - 1);
    expect(verifyKioskCode(secret, kioskCode(secret, w - 2), now)).toBeNull(); // > 60 s old
    expect(verifyKioskCode(secret, kioskCode(secret, w + 5), now)).toBeNull();
  });
  it("depends on the secret and rejects junk", () => {
    const w = windowAt(now);
    expect(verifyKioskCode("other", kioskCode(secret, w), now)).toBeNull();
    expect(verifyKioskCode(secret, "12", now)).toBeNull();
    expect(verifyKioskCode(secret, "abcdef", now)).toBeNull();
    expect(kioskCode(secret, w)).toMatch(/^\d{6}$/);
  });
});

describe("garage network", () => {
  it("checks IPv4 ranges and single addresses", () => {
    expect(ipAllowed("192.168.100.16", "192.168.100.0/24")).toBe(true);
    expect(ipAllowed("::ffff:192.168.100.16", "192.168.100.0/24")).toBe(true);
    expect(ipAllowed("192.168.101.16", "192.168.100.0/24")).toBe(false);
    expect(ipAllowed("41.226.10.5", "10.0.0.0/8, 41.226.10.5")).toBe(true);
    expect(ipAllowed("unknown", "0.0.0.0/0")).toBe(false);
    expect(ipAllowed("41.226.10.5", "")).toBe(false);
  });
  it("validates the settings list", () => {
    expect(validNetworks("192.168.1.0/24, 41.226.10.5")).toBe(true);
    expect(validNetworks("192.168.1.0/33")).toBe(false);
    expect(validNetworks("garage")).toBe(false);
  });
});

describe("punch sequence", () => {
  const now = at("2026-10-20T12:00:00Z");
  it("allows only the logical next punch", () => {
    expect(ALLOWED_NEXT[stateAfter(null, now)]).toEqual(["IN"]);
    expect(ALLOWED_NEXT[stateAfter({ kind: "IN", at: at("2026-10-20T07:00:00Z") }, now)]).toEqual(["BREAK_START", "OUT"]);
    expect(ALLOWED_NEXT[stateAfter({ kind: "BREAK_START", at: at("2026-10-20T11:30:00Z") }, now)]).toEqual(["BREAK_END", "OUT"]);
  });
  it("a punch forgotten since yesterday does not block today's arrival", () => {
    expect(stateAfter({ kind: "IN", at: at("2026-10-19T07:00:00Z") }, now)).toBe("OUT");
  });
});

describe("presence hours", () => {
  it("counts IN→OUT minus breaks, per local day", () => {
    const days = attendanceByDay(
      [
        { kind: "IN", at: at("2026-10-20T07:00:00Z") }, // 08:00 Tunis
        { kind: "BREAK_START", at: at("2026-10-20T11:00:00Z") },
        { kind: "BREAK_END", at: at("2026-10-20T12:00:00Z") },
        { kind: "OUT", at: at("2026-10-20T16:00:00Z") },
        { kind: "IN", at: at("2026-10-21T07:30:00Z") }, // forgot to clock out
      ],
      TZ,
    );
    expect(days[0]).toMatchObject({ date: "2026-10-20", presenceMinutes: 480, breakMinutes: 60, incomplete: false });
    expect(days[1]).toMatchObject({ date: "2026-10-21", presenceMinutes: 0, incomplete: true }); // never guessed
  });
});

describe("hours on a repair vs hours billed", () => {
  // Two mechanics work together from 09:00 to 11:00.
  const both = [
    { userId: "a", start: at("2026-10-20T08:00:00Z"), end: at("2026-10-20T10:00:00Z") },
    { userId: "b", start: at("2026-10-20T08:00:00Z"), end: at("2026-10-20T10:00:00Z") },
  ];
  it("employees' report: 2 h each = 4 person-hours", () => {
    expect(personMinutes(both)).toBe(240);
    expect(minutesByUser(both).get("a")).toBe(120);
  });
  it("billing basis 'elapsed': 2 h, not multiplied", () => {
    expect(elapsedMinutes(both)).toBe(120);
    expect(suggestedBilledX100(both, "ELAPSED")).toBe(200);
    expect(suggestedBilledX100(both, "PERSON")).toBe(400);
  });
  it("overlapping and separate intervals", () => {
    const iv = [
      { userId: "a", start: at("2026-10-20T08:00:00Z"), end: at("2026-10-20T09:00:00Z") },
      { userId: "b", start: at("2026-10-20T08:30:00Z"), end: at("2026-10-20T09:30:00Z") },
      { userId: "a", start: at("2026-10-20T13:00:00Z"), end: at("2026-10-20T13:10:00Z") },
    ];
    expect(elapsedMinutes(iv)).toBe(100);
    expect(suggestedBilledX100(iv, "ELAPSED")).toBe(175); // 1 h 40 → 1 h 45
  });
});

describe("leave days", () => {
  it("whole days in the garage time zone, closed days not counted", () => {
    const span = wholeDaysSpan("2026-10-23", "2026-10-26", TZ); // Fri → Mon (Sunday closed)
    expect(spanDates(span, TZ)).toEqual(["2026-10-23", "2026-10-24", "2026-10-25", "2026-10-26"]);
    expect(workingDays(span, TZ, DEFAULT_OPENING_HOURS)).toBe(3);
  });

  it("balance per calendar year: a leave across New Year counts in each year", () => {
    const span = wholeDaysSpan("2026-12-29", "2027-01-04", TZ); // Tue 29 → Mon 4 (Sundays 3 Jan closed)
    expect(leaveDaysInYear([span], 2026, TZ, DEFAULT_OPENING_HOURS)).toBe(3); // 29, 30, 31 Dec
    expect(leaveDaysInYear([span], 2027, TZ, DEFAULT_OPENING_HOURS)).toBe(3); // 1, 2, 4 Jan
    expect(leaveDaysInYear([span], 2025, TZ, DEFAULT_OPENING_HOURS)).toBe(0);
  });

  it("fixed days per year minus approved days, no carry-over; not set = no balance", () => {
    expect(leaveBalance(24, 10, 3, 2026)).toEqual({ year: 2026, allowance: 24, taken: 10, pending: 3, remaining: 14 });
    expect(leaveBalance(null, 10, 0, 2026).remaining).toBeNull();
    expect(leaveBalance(12, 15, 0, 2026).remaining).toBe(-3); // shown, never hidden
  });
});
