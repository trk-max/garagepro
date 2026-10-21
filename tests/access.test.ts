import { describe, expect, it } from "vitest";
import type { Role } from "@prisma/client";
import { allowed, NAV_GROUPS, pick, TOP_KEYS } from "@/components/shell/nav";
import { canContract, contractCategoriesFor } from "@/lib/contracts";
import { can, normaliseOverrides, overridesFrom, PERMISSION_GROUPS, PERMISSIONS, roleCan, type Permission } from "@/lib/permissions";

const user = (role: Role, grant: Permission[] = [], deny: Permission[] = []) => ({ role, perms: { grant, deny } });
const ROLES: Role[] = ["ADMIN", "MANAGER", "RECEPTION", "MECHANIC", "STOREKEEPER", "HR", "ACCOUNTANT", "SELLER", "SHOWROOM_MANAGER"];

describe("V10.3 — effective permission (DENY > GRANT > role)", () => {
  it("without overrides, a user gets exactly the role answer for every permission", () => {
    for (const role of ROLES) {
      for (const p of PERMISSIONS) {
        expect(can({ role }, p), `${role} ${p}`).toBe(roleCan(role, p));
        expect(can(user(role), p), `${role} ${p}`).toBe(roleCan(role, p));
        expect(can(role, p), `${role} ${p}`).toBe(roleCan(role, p));
      }
    }
  });
  it("GRANT opens what the role does not have (that permission only)", () => {
    expect(can("MECHANIC", "viewFinance")).toBe(false);
    expect(can(user("MECHANIC", ["viewFinance"]), "viewFinance")).toBe(true);
    expect(can(user("MECHANIC", ["viewFinance"]), "createInvoice")).toBe(false);
  });
  it("DENY closes what the role has, and wins over GRANT", () => {
    expect(can(user("MANAGER", [], ["viewFinance"]), "viewFinance")).toBe(false);
    expect(can(user("MANAGER", ["viewFinance"], ["viewFinance"]), "viewFinance")).toBe(false);
    expect(can(user("MANAGER", [], ["viewFinance"]), "viewWorkOrders")).toBe(true);
  });
  it("no subject = nothing", () => {
    expect(can(null, "viewWorkOrders")).toBe(false);
    expect(can(undefined, "viewWorkOrders")).toBe(false);
  });
  it("database rows → overrides (unknown names and effects ignored)", () => {
    expect(
      overridesFrom([
        { permission: "viewFinance", effect: "GRANT" },
        { permission: "manageStock", effect: "DENY" },
        { permission: "nope", effect: "GRANT" },
        { permission: "viewStock", effect: "MAYBE" },
      ]),
    ).toEqual({ grant: ["viewFinance"], deny: ["manageStock"] });
    expect(overridesFrom(undefined)).toEqual({ grant: [], deny: [] });
  });
  it("only real differences with the role are stored", () => {
    const out = normaliseOverrides("MECHANIC", { viewFinance: "GRANT", viewWorkOrders: "GRANT", manageStock: "DENY", uploadMedia: "DENY", printQuote: "ROLE", bogus: "GRANT" });
    expect(out).toHaveLength(2);
    expect(out).toContainEqual({ permission: "viewFinance", effect: "GRANT" });
    expect(out).toContainEqual({ permission: "uploadMedia", effect: "DENY" });
  });
  it("the Accès editor lists every permission exactly once", () => {
    const listed: string[] = Object.values(PERMISSION_GROUPS).flat();
    expect(new Set(listed).size).toBe(listed.length);
    expect([...listed].sort()).toEqual([...PERMISSIONS].sort());
  });
});

describe("V10.3 — overrides reach the menu and the contracts", () => {
  it("a mechanic granted the invoices sees the menu entry; a manager denied them does not", () => {
    const invoices = NAV_GROUPS.flatMap((g) => g.items).find((i) => i.key === "clientInvoices")!;
    expect(invoices.permission).toBe("viewClientInvoices");
    expect(allowed("MECHANIC", invoices)).toBe(false);
    expect(allowed(user("MECHANIC", ["viewClientInvoices"]), invoices)).toBe(true);
    expect(allowed("MANAGER", invoices)).toBe(true);
    expect(allowed(user("MANAGER", [], ["viewClientInvoices"]), invoices)).toBe(false);
    expect(pick(user("MECHANIC", ["viewClientInvoices"]), TOP_KEYS).map((i) => i.key)).toContain("clientInvoices");
    expect(pick("MECHANIC", TOP_KEYS).map((i) => i.key)).not.toContain("clientInvoices");
  });
  it("contracts: DENY viewContracts hides all; GRANT reads the non-employment categories only", () => {
    expect(contractCategoriesFor(user("ADMIN", [], ["viewContracts"]), "view")).toEqual([]);
    expect(contractCategoriesFor("MECHANIC", "view")).toEqual([]);
    const granted = user("MECHANIC", ["viewContracts"]);
    expect([...contractCategoriesFor(granted, "view")].sort()).toEqual(["BLANK", "FLEET", "REPAIR", "SUPPLIER"]);
    expect(canContract(granted, "REPAIR", "view")).toBe(true);
    expect(canContract(granted, "EMPLOYMENT", "view")).toBe(false);
    expect(canContract(granted, "REPAIR", "manage")).toBe(false);
    expect(canContract("HR", "EMPLOYMENT", "view")).toBe(true);
  });
});
