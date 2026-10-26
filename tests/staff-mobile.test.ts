import { describe, expect, it } from "vitest";
import type { Role } from "@prisma/client";
import { can } from "@/lib/permissions";
import { activePhoneTab, PHONE_TABS, phoneTabs } from "@/lib/staff-mobile";

describe("staff phone tab bar", () => {
  it("role tabs: mechanic, reception, manager / admin", () => {
    expect(phoneTabs({ role: "MECHANIC" })).toEqual(["home", "myCars", "timeClock", "todo"]);
    expect(phoneTabs({ role: "RECEPTION" })).toEqual(["home", "queue", "orders", "customers"]);
    expect(phoneTabs({ role: "MANAGER" })).toEqual(["home", "board", "todo", "invoices"]);
    expect(phoneTabs({ role: "ADMIN" })).toEqual(["home", "board", "todo", "invoices"]);
  });

  it("never a page the person may not open, always 4 tabs when possible", () => {
    for (const role of ["ADMIN", "MANAGER", "RECEPTION", "MECHANIC", "STOREKEEPER", "HR", "ACCOUNTANT", "SELLER", "SHOWROOM_MANAGER"] as Role[]) {
      const tabs = phoneTabs({ role });
      for (const k of tabs) if (PHONE_TABS[k].permission) expect(can(role, PHONE_TABS[k].permission!), `${role} ${k}`).toBe(true);
      expect(tabs[0]).toBe("home");
      expect(tabs.length).toBeLessThanOrEqual(4);
    }
    const denied = phoneTabs({ role: "RECEPTION", perms: { grant: [], deny: ["useReception"] } });
    expect(denied).not.toContain("queue");
    expect(denied).toHaveLength(4);
  });

  it("active tab: longest match, query ignored", () => {
    const tabs = phoneTabs({ role: "MECHANIC" });
    expect(activePhoneTab("/garage/app/ordre/x", tabs)).toBe("home");
    expect(activePhoneTab("/garage/atelier", tabs)).toBe("myCars");
    expect(activePhoneTab("/garage/a-traiter/missingParts", tabs)).toBe("todo");
    expect(activePhoneTab("/garage/customers", tabs)).toBeNull();
  });
});
