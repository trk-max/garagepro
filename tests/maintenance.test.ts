import { describe, expect, it } from "vitest";
import { maintenanceDedupeKey, nextDue, renderTemplate, retryDelayMs } from "@/lib/maintenance";

const now = new Date("2026-10-21T08:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

describe("échéances d'entretien", () => {
  it("by date: OK, SOON within the lead days, OVERDUE after", () => {
    const plan = { intervalDays: 180, intervalKm: null, lastDoneAt: daysAgo(100), lastDoneKm: null };
    expect(nextDue(plan, null, now, 7).status).toBe("OK");
    expect(nextDue({ ...plan, lastDoneAt: daysAgo(175) }, null, now, 7)).toMatchObject({ status: "SOON", by: "date" });
    expect(nextDue({ ...plan, lastDoneAt: daysAgo(181) }, null, now, 7)).toMatchObject({ status: "OVERDUE", by: "date" });
  });

  it("by km: compared with the last recorded mileage", () => {
    const plan = { intervalDays: null, intervalKm: 10_000, lastDoneAt: daysAgo(30), lastDoneKm: 50_000 };
    expect(nextDue(plan, 55_000, now, 7).status).toBe("OK");
    expect(nextDue(plan, 59_700, now, 7)).toMatchObject({ status: "SOON", by: "km", dueKm: 60_000 });
    expect(nextDue(plan, 61_000, now, 7)).toMatchObject({ status: "OVERDUE", by: "km" });
  });

  it("km unknown: never guessed — reported, and the date rule still works", () => {
    const kmOnly = { intervalDays: null, intervalKm: 10_000, lastDoneAt: daysAgo(30), lastDoneKm: 50_000 };
    expect(nextDue(kmOnly, null, now, 7)).toMatchObject({ status: "UNKNOWN", kmUnknown: true });
    const both = { intervalDays: 365, intervalKm: 10_000, lastDoneAt: daysAgo(400), lastDoneKm: null };
    expect(nextDue(both, 70_000, now, 7)).toMatchObject({ status: "OVERDUE", by: "date", kmUnknown: true });
  });

  it("whichever comes first wins", () => {
    const plan = { intervalDays: 365, intervalKm: 10_000, lastDoneAt: daysAgo(30), lastDoneKm: 50_000 };
    expect(nextDue(plan, 60_100, now, 7)).toMatchObject({ status: "OVERDUE", by: "km" });
  });

  it("never done: nothing can be computed", () => {
    expect(nextDue({ intervalDays: 180, intervalKm: 10_000, lastDoneAt: null, lastDoneKm: null }, 30_000, now, 7).status).toBe("UNKNOWN");
  });

  it("one reminder per occurrence: same key until the plan is done again", () => {
    const plan = { intervalDays: 180, intervalKm: null, lastDoneAt: daysAgo(175), lastDoneKm: null };
    const a = maintenanceDedupeKey("p1", nextDue(plan, null, now, 7));
    const b = maintenanceDedupeKey("p1", nextDue(plan, null, new Date(now.getTime() + 3_600_000), 7));
    const done = maintenanceDedupeKey("p1", nextDue({ ...plan, lastDoneAt: now }, null, now, 7));
    expect(a).toBe(b);
    expect(done).not.toBe(a);
  });

  it("templates: variables filled, unknown ones left visible", () => {
    expect(renderTemplate("{garage} : vidange de {plate} le {date} {x}", { garage: "Garage", plate: "123 TU 4567", date: "28/10" })).toBe("Garage : vidange de 123 TU 4567 le 28/10 {x}");
  });

  it("retry delays grow: 15, 30, 60 minutes", () => {
    expect([1, 2, 3].map((n) => retryDelayMs(n) / 60_000)).toEqual([15, 30, 60]);
  });
});
