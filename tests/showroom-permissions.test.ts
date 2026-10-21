import { Role } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { can, rolesFor } from "@/lib/permissions";

/** V9 — showroom roles (vendeur, responsable showroom) and their rights. */
describe("showroom roles", () => {
  it("both new roles exist in the Prisma enum", () => {
    expect(Object.values(Role)).toEqual(expect.arrayContaining(["SELLER", "SHOWROOM_MANAGER"]));
  });

  it("admin and showroom manager manage every listing and every conversation", () => {
    expect(rolesFor("manageAllListings")).toEqual(["ADMIN", "SHOWROOM_MANAGER"]);
    expect(rolesFor("readAllShowroomMessages")).toEqual(["ADMIN", "SHOWROOM_MANAGER"]);
  });

  it("seller creates listings and uses the messaging, but only for their own (no 'all' right)", () => {
    expect(can("SELLER", "createListing")).toBe(true);
    expect(can("SELLER", "useShowroomMessages")).toBe(true);
    expect(can("SELLER", "manageAllListings")).toBe(false);
    expect(can("SELLER", "readAllShowroomMessages")).toBe(false);
  });

  it("reception and workshop manager can look at the inventory but not edit it or read buyers' messages", () => {
    for (const r of ["RECEPTION", "MANAGER"] as const) {
      expect(can(r, "viewShowroom"), r).toBe(true);
      expect(can(r, "createListing"), r).toBe(false);
      expect(can(r, "useShowroomMessages"), r).toBe(false);
    }
    for (const r of ["MECHANIC", "STOREKEEPER"] as const) expect(can(r, "viewShowroom"), r).toBe(false);
  });

  it("the new roles get no workshop, money or admin rights", () => {
    for (const r of ["SELLER", "SHOWROOM_MANAGER"] as const) {
      for (const p of ["viewWorkOrders", "viewCustomers", "viewFinance", "viewClientInvoices", "manageSettings", "viewProfit", "viewAuditLog", "manageStock", "manageTeam"] as const) {
        expect(can(r, p), `${r} ${p}`).toBe(false);
      }
    }
  });
});
