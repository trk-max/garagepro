import { describe, expect, it } from "vitest";
import { can, rolesFor } from "@/lib/permissions";
import { TRANSITIONS, customerSteps } from "@/server/workflow";

describe("permission matrix (server-side source of truth)", () => {
  it("only the admin can invoice, approve purchases, pay suppliers and change settings", () => {
    for (const p of ["createInvoice", "approvePurchase", "paySupplier", "manageSettings"] as const) {
      expect(rolesFor(p), p).toEqual(["ADMIN"]);
    }
  });
  it("mechanic: works on repairs but sees no money", () => {
    expect(can("MECHANIC", "viewWorkOrders")).toBe(true);
    expect(can("MECHANIC", "uploadMedia")).toBe(true);
    for (const p of ["viewFinance", "viewClientInvoices", "recordPayment", "createInvoice", "manageStock"] as const) {
      expect(can("MECHANIC", p), p).toBe(false);
    }
  });
  it("storekeeper: supplier area only", () => {
    expect(can("STOREKEEPER", "manageStock")).toBe(true);
    expect(can("STOREKEEPER", "requestPurchase")).toBe(true);
    for (const p of ["approvePurchase", "paySupplier", "viewWorkOrders", "viewCustomers", "viewClientInvoices"] as const) {
      expect(can("STOREKEEPER", p), p).toBe(false);
    }
  });
  it("reception: cashes in but cannot invoice", () => {
    expect(can("RECEPTION", "recordPayment")).toBe(true);
    expect(can("RECEPTION", "createInvoice")).toBe(false);
  });
  it("HR (V9): team, leave, certificates and contracts page — no money, no settings, no repairs", () => {
    for (const p of ["useTimeClock", "manageTeam", "issueCertificates", "showClockKiosk", "viewContracts"] as const) expect(can("HR", p), p).toBe(true);
    for (const p of ["manageSettings", "viewFinance", "viewClientInvoices", "viewWorkOrders", "viewCustomers", "viewSupplierInvoices", "readCashForecast", "viewProfit", "reviewContractTemplates", "viewAuditLog"] as const) {
      expect(can("HR", p), p).toBe(false);
    }
  });
  it("accountant (V9): invoices, supplier invoices, cash forecast READ — no settings, no team, no balance typing", () => {
    for (const p of ["viewFinance", "viewClientInvoices", "viewSupplierInvoices", "manageSupplierInvoices", "viewSuppliers", "readCashForecast", "viewContracts", "useTimeClock"] as const) {
      expect(can("ACCOUNTANT", p), p).toBe(true);
    }
    for (const p of ["manageSettings", "viewCashForecast", "createInvoice", "paySupplier", "manageTeam", "issueCertificates", "viewWorkOrders", "manageStock", "reviewContractTemplates"] as const) {
      expect(can("ACCOUNTANT", p), p).toBe(false);
    }
  });
  it("only the admin marks a contract template as reviewed by a lawyer", () => {
    expect(rolesFor("reviewContractTemplates")).toEqual(["ADMIN"]);
  });
  it("no role / unknown role = nothing", () => {
    expect(can(null, "viewWorkOrders")).toBe(false);
    expect(can(undefined, "viewStock")).toBe(false);
    // @ts-expect-error forged role from a tampered token
    expect(can("SUPERADMIN", "manageSettings")).toBe(false);
  });
});

describe("work-order status machine", () => {
  it("delivered and cancelled are final", () => {
    expect(TRANSITIONS.DELIVERED).toEqual([]);
    expect(TRANSITIONS.CANCELLED).toEqual([]);
  });
  it("a car cannot be delivered before it is ready", () => {
    for (const [from, to] of Object.entries(TRANSITIONS)) {
      if (from !== "READY") expect(to, from).not.toContain("DELIVERED");
    }
  });
  it("customer tracker shows the parts step only if the car waited for parts", () => {
    expect(customerSteps("IN_PROGRESS", false).steps.map((s) => s.key)).not.toContain("parts");
    expect(customerSteps("IN_PROGRESS", true).steps.map((s) => s.key)).toContain("parts");
    expect(customerSteps("READY", false).progress).toBe(100);
  });
});
