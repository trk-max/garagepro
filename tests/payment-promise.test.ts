/** Paiements partiels — pure rules of the next payment date (no database). */
import { describe, expect, it } from "vitest";
import { activePromise, checkPromise, daysPast, paymentFollowUp, promiseKept, promiseOverdue } from "@/lib/payment-promise";

const today = new Date("2026-10-22T00:00:00Z");
const day = (d: string, h = 12) => new Date(`${d}T${String(h).padStart(2, "0")}:00:00Z`);
const inv = (o: Partial<{ status: "ISSUED" | "PARTIAL" | "PAID" | "CREDITED"; totalTtc: number; paidAmount: number; dueDate: Date | null }> = {}) => ({
  status: "PARTIAL" as const,
  totalTtc: 300_000,
  paidAmount: 100_000,
  dueDate: day("2026-11-01"),
  issuedAt: day("2026-10-01"),
  ...o,
});

describe("promise kept / overdue", () => {
  const p = { promisedAt: day("2026-10-20"), amount: 50_000, createdAt: day("2026-10-10", 9) };
  it("a payment made since the promise, at least the promised amount, keeps it", () => {
    expect(promiseKept(p, [])).toBe(false);
    expect(promiseKept(p, [{ amount: 40_000, paidAt: day("2026-10-15") }])).toBe(false);
    expect(promiseKept(p, [{ amount: 40_000, paidAt: day("2026-10-15") }, { amount: 10_000, paidAt: day("2026-10-18") }])).toBe(true);
    // A payment BEFORE the promise was recorded does not count; a reversal counts negative.
    expect(promiseKept(p, [{ amount: 90_000, paidAt: day("2026-10-09") }])).toBe(false);
    expect(promiseKept(p, [{ amount: 50_000, paidAt: day("2026-10-15") }, { amount: -50_000, paidAt: day("2026-10-16") }])).toBe(false);
    // No amount promised: any payment since keeps it.
    expect(promiseKept({ ...p, amount: null }, [{ amount: 1_000, paidAt: day("2026-10-12") }])).toBe(true);
  });

  it("overdue = promised day before today and not kept", () => {
    expect(promiseOverdue(p, [], today)).toBe(true);
    expect(promiseOverdue({ ...p, promisedAt: day("2026-10-22") }, [], today)).toBe(false); // today is not late yet
    expect(promiseOverdue(p, [{ amount: 50_000, paidAt: day("2026-10-21") }], today)).toBe(false);
    expect(daysPast(p.promisedAt, today)).toBe(2);
    expect(activePromise({ ...p, promisedAt: day("2026-10-25") }, [], today)).not.toBeNull();
    expect(activePromise(p, [], today)).toBeNull();
  });
});

describe("one list per invoice (no duplicates)", () => {
  it("settled, credited or nothing due → nowhere", () => {
    expect(paymentFollowUp(inv({ status: "PAID", paidAmount: 300_000 }), null, [], today)).toBeNull();
    expect(paymentFollowUp(inv({ status: "CREDITED" }), null, [], today)).toBeNull();
    // Unpaid, not yet due, no promise: the customer still has time.
    expect(paymentFollowUp(inv({ status: "ISSUED", paidAmount: 0 }), null, [], today)).toBeNull();
  });

  it("partly paid, not due → partialPayments; past due without a promise → overdueInvoices", () => {
    expect(paymentFollowUp(inv(), null, [], today)).toBe("partialPayments");
    expect(paymentFollowUp(inv({ dueDate: day("2026-10-05") }), null, [], today)).toBe("overdueInvoices");
    expect(paymentFollowUp(inv({ status: "ISSUED", paidAmount: 0, dueDate: day("2026-10-05") }), null, [], today)).toBe("overdueInvoices");
  });

  it("a promised day to come puts a late invoice in partialPayments; once passed and not kept → paymentPromisesDue", () => {
    const future = { promisedAt: day("2026-10-30"), amount: null, createdAt: day("2026-10-21") };
    expect(paymentFollowUp(inv({ dueDate: day("2026-10-05") }), future, [], today)).toBe("partialPayments");
    expect(paymentFollowUp(inv({ status: "ISSUED", paidAmount: 0 }), future, [], today)).toBe("partialPayments");
    const missed = { promisedAt: day("2026-10-20"), amount: 50_000, createdAt: day("2026-10-10") };
    expect(paymentFollowUp(inv(), missed, [], today)).toBe("paymentPromisesDue");
    // Kept (paid since): the alert clears and the invoice waits for the next promise.
    expect(paymentFollowUp(inv(), missed, [{ amount: 50_000, paidAt: day("2026-10-19") }], today)).toBe("partialPayments");
    expect(paymentFollowUp(inv({ dueDate: day("2026-10-05") }), missed, [{ amount: 50_000, paidAt: day("2026-10-19") }], today)).toBe("overdueInvoices");
  });
});

describe("checks of a new promise", () => {
  it("date today or later (one year at most), amount > 0 and ≤ balance, nothing on a settled invoice", () => {
    expect(checkPromise({ day: "2026-10-22", amount: null }, "2026-10-22", 1000)).toBeNull();
    expect(checkPromise({ day: "2026-10-21", amount: null }, "2026-10-22", 1000)).toBe("promiseDate");
    expect(checkPromise({ day: "2027-12-01", amount: null }, "2026-10-22", 1000)).toBe("promiseDate");
    expect(checkPromise({ day: "22/10/2026", amount: null }, "2026-10-22", 1000)).toBe("promiseDate");
    expect(checkPromise({ day: "2026-10-30", amount: 1001 }, "2026-10-22", 1000)).toBe("promiseAmount");
    expect(checkPromise({ day: "2026-10-30", amount: 0 }, "2026-10-22", 1000)).toBe("promiseAmount");
    expect(checkPromise({ day: "2026-10-30", amount: 1000 }, "2026-10-22", 1000)).toBeNull();
    expect(checkPromise({ day: "2026-10-30", amount: null }, "2026-10-22", 0)).toBe("promiseSettled");
  });
});
