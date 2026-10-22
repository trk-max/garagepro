/**
 * V16 Lot 1 — pure rules of the workshop flow (server/workflow.ts): permission per move, mandatory
 * reasons, non-retroactivity, delivery check, customer steps, translations. No database.
 */
import type { Role, WorkOrderStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { ar } from "@/lib/i18n/ar";
import { en } from "@/lib/i18n/en";
import { fr } from "@/lib/i18n/fr";
import { PERMISSION_GROUPS, PERMISSIONS, can } from "@/lib/permissions";
import {
  ACTIVE_STATUSES,
  STATUS_ORDER,
  TRANSITIONS,
  availableTransitions,
  balanceDue,
  cleanReason,
  customerSteps,
  deliveryBlock,
  isFinal,
  reasonRequired,
  transitionPermission,
  workWithoutQuoteBlocked,
} from "@/server/workflow";

const ROLES: Role[] = ["ADMIN", "MANAGER", "RECEPTION", "MECHANIC", "STOREKEEPER", "HR", "ACCOUNTANT", "SELLER", "SHOWROOM_MANAGER"];
const NEW = { workflowV16: true, quoteApproved: false };
const OLD = { workflowV16: false, quoteApproved: false };
const ALL = Object.keys(TRANSITIONS) as WorkOrderStatus[];

describe("V16 — transitions (every existing move kept)", () => {
  it("keeps every V15 move", () => {
    const v15: Partial<Record<WorkOrderStatus, WorkOrderStatus[]>> = {
      RECEIVED: ["DIAGNOSIS", "QUOTE_SENT", "WAITING_INSURANCE", "IN_PROGRESS", "CANCELLED"],
      DIAGNOSIS: ["QUOTE_SENT", "WAITING_INSURANCE", "WAITING_PARTS", "IN_PROGRESS", "CANCELLED"],
      QUOTE_SENT: ["WAITING_INSURANCE", "WAITING_PARTS", "IN_PROGRESS", "CANCELLED"],
      WAITING_INSURANCE: ["QUOTE_SENT", "WAITING_PARTS", "IN_PROGRESS", "CANCELLED"],
      WAITING_PARTS: ["IN_PROGRESS", "CANCELLED"],
      IN_PROGRESS: ["QUALITY_CONTROL", "WAITING_PARTS", "WAITING_INSURANCE", "QUOTE_SENT", "CANCELLED"],
      QUALITY_CONTROL: ["WASHING", "READY", "IN_PROGRESS"],
      WASHING: ["READY", "QUALITY_CONTROL"],
      READY: ["IN_PROGRESS", "DELIVERED"],
    };
    for (const [from, tos] of Object.entries(v15)) for (const to of tos) expect(TRANSITIONS[from as WorkOrderStatus], `${from}→${to}`).toContain(to);
  });
  it("adds the quote branches, cancel from every non-final status, and delivered → closed", () => {
    expect(TRANSITIONS.QUOTE_SENT).toEqual(expect.arrayContaining(["WAITING_CUSTOMER", "QUOTE_REFUSED"]));
    expect(TRANSITIONS.WAITING_CUSTOMER).toEqual(["QUOTE_SENT", "QUOTE_REFUSED", "CANCELLED"]);
    expect(TRANSITIONS.QUOTE_REFUSED).toEqual(["READY", "CANCELLED"]);
    for (const s of ACTIVE_STATUSES) expect(TRANSITIONS[s], s).toContain("CANCELLED");
    expect(TRANSITIONS.DELIVERED).toEqual(["CLOSED"]);
    for (const s of ["CANCELLED", "CLOSED", "DELIVERED"] as const) expect(isFinal(s)).toBe(true);
    expect(STATUS_ORDER).toHaveLength(ALL.length);
  });
  it("only READY leads to DELIVERED, only DELIVERED to CLOSED", () => {
    for (const from of ALL) {
      if (from !== "READY") expect(TRANSITIONS[from], from).not.toContain("DELIVERED");
      if (from !== "DELIVERED") expect(TRANSITIONS[from], from).not.toContain("CLOSED");
    }
  });
});

describe("V16 — permission per move × role (audit n° 1)", () => {
  /** Every allowed move, per role, by default (no per-user override). */
  const allowed = (role: Role) => ALL.flatMap((from) => TRANSITIONS[from].filter((to) => can(role, transitionPermission(from, to))).map((to) => `${from}>${to}`));

  it("a mechanic cannot cancel, deliver, close nor decide on a quote", () => {
    const m = allowed("MECHANIC");
    expect(m.some((x) => x.endsWith(">CANCELLED"))).toBe(false);
    expect(m.some((x) => x.endsWith(">DELIVERED"))).toBe(false);
    expect(m.some((x) => x.endsWith(">CLOSED"))).toBe(false);
    for (const x of ["QUOTE_SENT>IN_PROGRESS", "QUOTE_SENT>QUOTE_REFUSED", "DIAGNOSIS>QUOTE_SENT", "QUOTE_REFUSED>READY", "WAITING_INSURANCE>IN_PROGRESS"]) expect(m, x).not.toContain(x);
    // …but keeps the technical steps.
    for (const x of ["RECEIVED>DIAGNOSIS", "IN_PROGRESS>QUALITY_CONTROL", "QUALITY_CONTROL>READY", "QUALITY_CONTROL>IN_PROGRESS", "WAITING_PARTS>IN_PROGRESS", "WASHING>READY"]) expect(m, x).toContain(x);
  });
  it("reception: quotes and delivery, no cancelling; manager and admin: everything", () => {
    const r = allowed("RECEPTION");
    expect(r).toContain("READY>DELIVERED");
    expect(r).toContain("QUOTE_SENT>QUOTE_REFUSED");
    expect(r).toContain("DELIVERED>CLOSED");
    expect(r.some((x) => x.endsWith(">CANCELLED"))).toBe(false);
    const every = ALL.flatMap((from) => TRANSITIONS[from].map((to) => `${from}>${to}`));
    expect(allowed("MANAGER")).toEqual(every);
    expect(allowed("ADMIN")).toEqual(every);
  });
  it("roles outside the workshop make no move at all", () => {
    for (const role of ["STOREKEEPER", "HR", "ACCOUNTANT", "SELLER", "SHOWROOM_MANAGER"] as const) expect(allowed(role), role).toEqual([]);
  });
  it("per-employee access applies (a mechanic granted cancelWorkOrder may cancel; a manager denied it may not)", () => {
    const mech = { role: "MECHANIC" as const, perms: { grant: ["cancelWorkOrder" as const], deny: [] } };
    expect(can(mech, transitionPermission("IN_PROGRESS", "CANCELLED"))).toBe(true);
    const mgr = { role: "MANAGER" as const, perms: { grant: [], deny: ["cancelWorkOrder" as const] } };
    expect(can(mgr, transitionPermission("IN_PROGRESS", "CANCELLED"))).toBe(false);
  });
  it("deliverWithBalance: admin and manager only; the new permissions are in the access editor", () => {
    expect(ROLES.filter((r) => can(r, "deliverWithBalance"))).toEqual(["ADMIN", "MANAGER"]);
    const grouped = Object.values(PERMISSION_GROUPS).flat();
    for (const p of ["manageQuotes", "cancelWorkOrder", "deliverWorkOrder", "deliverWithBalance", "closeWorkOrder"] as const) {
      expect(PERMISSIONS).toContain(p);
      expect(grouped.filter((g) => g === p)).toHaveLength(1);
    }
  });
});

describe("V16 — mandatory reason", () => {
  it("cancel, refused quote, back to the workshop after QC / ready", () => {
    for (const from of ACTIVE_STATUSES) expect(reasonRequired(from, "CANCELLED", OLD), from).toBe(true);
    expect(reasonRequired("QUOTE_SENT", "QUOTE_REFUSED", OLD)).toBe(true);
    expect(reasonRequired("WAITING_CUSTOMER", "QUOTE_REFUSED", OLD)).toBe(true);
    expect(reasonRequired("QUALITY_CONTROL", "IN_PROGRESS", OLD)).toBe(true);
    expect(reasonRequired("READY", "IN_PROGRESS", OLD)).toBe(true);
    expect(reasonRequired("IN_PROGRESS", "QUALITY_CONTROL", NEW)).toBe(false);
    expect(reasonRequired("READY", "DELIVERED", NEW)).toBe(false);
  });
  it("work started on a quote with no recorded agreement: reason for new orders only, until Lot 2", () => {
    expect(reasonRequired("QUOTE_SENT", "IN_PROGRESS", NEW)).toBe(true);
    expect(reasonRequired("QUOTE_SENT", "WAITING_PARTS", NEW)).toBe(true);
    expect(reasonRequired("WAITING_INSURANCE", "IN_PROGRESS", NEW)).toBe(true);
    expect(reasonRequired("QUOTE_SENT", "IN_PROGRESS", OLD)).toBe(false);
    expect(reasonRequired("QUOTE_SENT", "IN_PROGRESS", { workflowV16: true, quoteApproved: true })).toBe(false);
  });
  it("a reason is 3 to 500 characters, trimmed", () => {
    expect(cleanReason("  ")).toBeNull();
    expect(cleanReason("ok")).toBeNull();
    expect(cleanReason("  Client injoignable ")).toBe("Client injoignable");
    expect(cleanReason("x".repeat(800))).toHaveLength(500);
  });
});

describe("V16 — non-retroactive blocking rules", () => {
  it("work without a quote: blocked for new orders unless the setting allows it; old orders untouched", () => {
    expect(workWithoutQuoteBlocked("RECEIVED", "IN_PROGRESS", { workflowV16: true, allowWorkWithoutQuote: false })).toBe(true);
    expect(workWithoutQuoteBlocked("DIAGNOSIS", "IN_PROGRESS", { workflowV16: true, allowWorkWithoutQuote: false })).toBe(true);
    expect(workWithoutQuoteBlocked("DIAGNOSIS", "IN_PROGRESS", { workflowV16: true, allowWorkWithoutQuote: true })).toBe(false);
    expect(workWithoutQuoteBlocked("RECEIVED", "IN_PROGRESS", { workflowV16: false, allowWorkWithoutQuote: false })).toBe(false);
    expect(workWithoutQuoteBlocked("DIAGNOSIS", "WAITING_PARTS", { workflowV16: true, allowWorkWithoutQuote: false })).toBe(false);
  });
  it("delivery: invoice required and settled, deposit deducted; old orders and the setting off never blocked", () => {
    const base = { requirePaidBeforeDelivery: true, workflowV16: true, depositAmount: null };
    expect(deliveryBlock({ ...base, invoice: null })).toBe("noInvoice");
    expect(deliveryBlock({ ...base, invoice: { totalTtc: 100_000, paidAmount: 40_000 } })).toBe("balanceDue");
    expect(deliveryBlock({ ...base, invoice: { totalTtc: 100_000, paidAmount: 40_000 }, depositAmount: 60_000 })).toBeNull();
    expect(deliveryBlock({ ...base, invoice: { totalTtc: 100_000, paidAmount: 100_000 } })).toBeNull();
    expect(deliveryBlock({ ...base, workflowV16: false, invoice: null })).toBeNull();
    expect(deliveryBlock({ ...base, requirePaidBeforeDelivery: false, invoice: null })).toBeNull();
    expect(balanceDue({ totalTtc: 100_000, paidAmount: 0 }, 150_000)).toBe(0);
    expect(balanceDue(null, 0)).toBeNull();
  });
  it("the dialog offers a mechanic only technical moves, and nothing that is blocked", () => {
    const ctx = { ...NEW, allowWorkWithoutQuote: false, invoiced: false };
    expect(availableTransitions("RECEIVED", "MECHANIC", ctx).map((o) => o.to)).toEqual(["DIAGNOSIS"]);
    expect(availableTransitions("READY", "MECHANIC", ctx)).toEqual([{ to: "IN_PROGRESS", reason: true }]);
    expect(availableTransitions("READY", "MANAGER", { ...ctx, invoiced: true }).map((o) => o.to)).toEqual(["IN_PROGRESS", "DELIVERED"]);
    expect(availableTransitions("RECEIVED", "ADMIN", { ...ctx, allowWorkWithoutQuote: true }).map((o) => o.to)).toContain("IN_PROGRESS");
  });
});

describe("V16 — customer portal steps", () => {
  it("refused / waiting quote stay on « reception »; closed is shown as done", () => {
    for (const s of ["WAITING_CUSTOMER", "QUOTE_REFUSED"] as const) expect(customerSteps(s, false).steps.find((x) => x.state === "current")?.key, s).toBe("reception");
    expect(customerSteps("CLOSED", false).progress).toBe(100);
    expect(customerSteps("CLOSED", false).steps.every((x) => x.state === "done")).toBe(true);
  });
});

describe("V16 — translations (fr / ar / en)", () => {
  it("the 3 new statuses and the new errors exist in the 3 languages", () => {
    for (const d of [fr, ar, en]) {
      for (const s of ["QUOTE_REFUSED", "WAITING_CUSTOMER", "CLOSED"] as const) expect(d.status[s].length, s).toBeGreaterThan(2);
      for (const k of ["statusForbidden", "workWithoutQuote", "deliveryNoInvoice", "deliveryBalanceDue", "notSettled", "reasonRequired"] as const) expect(d.errors[k].length, k).toBeGreaterThan(5);
      expect(d.v16.status.reasonHint.length).toBeGreaterThan(5);
    }
    expect(ar.status.CLOSED).not.toBe(fr.status.CLOSED);
  });
});
