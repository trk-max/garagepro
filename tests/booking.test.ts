import { describe, expect, it } from "vitest";
import { type BookingRules, DEFAULT_OPENING_HOURS, freeSlots, peakOverlap, utcToZoned, zonedToUtc } from "@/lib/booking";
import { bookingSchema } from "@/lib/validators";

const TZ = "Africa/Tunis"; // UTC+1, no DST
const rules: BookingRules = {
  timeZone: TZ,
  openingHours: { ...DEFAULT_OPENING_HOURS, "3": { open: "08:00", close: "12:00" } }, // Wednesday
  slotMinutes: 60,
  capacity: 2,
  leadMinutes: 0,
  horizonDays: 30,
};
const WED = "2026-10-14"; // a Wednesday
const longAgo = new Date("2026-01-01T00:00:00Z");
const at = (time: string) => zonedToUtc(WED, time, TZ);
const busy = (from: string, to: string) => ({ startAt: at(from), endAt: at(to) });

describe("time zone", () => {
  it("09:00 in Tunis is 08:00 UTC", () => {
    expect(at("09:00").toISOString()).toBe("2026-10-14T08:00:00.000Z");
    expect(utcToZoned(new Date("2026-10-14T23:30:00Z"), TZ).date).toBe("2026-10-15"); // after midnight local
  });
});

describe("peakOverlap", () => {
  it("counts simultaneous appointments", () => {
    const b = [busy("08:00", "10:00"), busy("09:00", "11:00")];
    expect(peakOverlap(at("09:00").getTime(), at("09:30").getTime(), b)).toBe(2);
    expect(peakOverlap(at("10:00").getTime(), at("11:00").getTime(), b)).toBe(1);
  });
  it("back-to-back appointments do not overlap", () => {
    expect(peakOverlap(at("10:00").getTime(), at("11:00").getTime(), [busy("09:00", "10:00")])).toBe(0);
  });
});

describe("freeSlots", () => {
  it("lists every hour that fits before closing", () => {
    expect(freeSlots(WED, 60, rules, [], longAgo)).toEqual(["08:00", "09:00", "10:00", "11:00"]);
    expect(freeSlots(WED, 120, rules, [], longAgo)).toEqual(["08:00", "09:00", "10:00"]);
  });
  it("hides a slot once capacity is reached (no double booking)", () => {
    const full = [busy("09:00", "10:00"), busy("09:00", "10:00")];
    expect(freeSlots(WED, 60, rules, full, longAgo)).not.toContain("09:00");
    expect(freeSlots(WED, 60, rules, full.slice(1), longAgo)).toContain("09:00"); // 1 of 2 used
  });
  it("a long service is blocked if any part of it is full", () => {
    const full = [busy("10:00", "11:00"), busy("10:00", "11:00")];
    // 08-10 is free; 09-11 and 10-12 both cross the full 10:00 hour.
    expect(freeSlots(WED, 120, rules, full, longAgo)).toEqual(["08:00"]);
  });
  it("no slots in the past / inside lead time", () => {
    const now = at("09:30");
    expect(freeSlots(WED, 60, rules, [], now)).toEqual(["10:00", "11:00"]);
    expect(freeSlots(WED, 60, { ...rules, leadMinutes: 60 }, [], now)).toEqual(["11:00"]); // earliest 10:30
  });
  it("closed day = no slots", () => {
    const closed = { ...rules, openingHours: { ...rules.openingHours, "3": null } };
    expect(freeSlots(WED, 60, closed, [], longAgo)).toEqual([]);
  });
});

describe("booking form validation", () => {
  const ok = { serviceId: "c".repeat(25), date: WED, time: "09:00", firstName: "سامي", lastName: "Ben Ali", phone: "+216 20 111 222", plate: "123 TU 4567" };
  it("accepts Arabic names", () => expect(bookingSchema.safeParse(ok).success).toBe(true));
  it("rejects malformed date / time / phone", () => {
    for (const patch of [{ date: "14/10/2026" }, { date: "" }, { time: "25:00" }, { time: "9h" }, { phone: "abc" }, { phone: "1" }]) {
      expect(bookingSchema.safeParse({ ...ok, ...patch }).success, JSON.stringify(patch)).toBe(false);
    }
  });
  it("rejects bots that fill the honeypot", () => {
    expect(bookingSchema.safeParse({ ...ok, website: "http://spam" }).success).toBe(false);
  });
  it("rejects huge text", () => {
    expect(bookingSchema.safeParse({ ...ok, firstName: "x".repeat(5_000) }).success).toBe(false);
  });
});
