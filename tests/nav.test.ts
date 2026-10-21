/** V10.2 — every staff page sits in exactly one place: top bar, rail, "More" panel or account menu. */
import { describe, expect, it } from "vitest";
import { inMore, MENU_KEYS, NAV_GROUPS, pick, RAIL_KEYS, TOP_KEYS } from "@/components/shell/nav";
import type { Role } from "@prisma/client";

const ROLES: Role[] = ["ADMIN", "MANAGER", "RECEPTION", "MECHANIC", "STOREKEEPER", "SELLER", "SHOWROOM_MANAGER", "HR", "ACCOUNTANT"];

const ALL = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.key));

describe("V10.2 navigation", () => {
  it("no page twice, none forgotten", () => {
    const more = ALL.filter(inMore);
    const placed = [...TOP_KEYS, ...RAIL_KEYS, ...MENU_KEYS, ...more];
    expect(new Set(placed).size).toBe(placed.length);
    expect([...placed].sort()).toEqual([...ALL].sort());
    expect(more).not.toContain("settings");
  });

  it("finance on top, garage work on the left, vehicles next to customers", () => {
    expect(TOP_KEYS).toEqual(["dashboard", "parts", "clientInvoices", "cash", "profitability", "reports"]);
    expect(RAIL_KEYS).toEqual(["workOrders", "workshop", "appointments", "customers", "vehicles", "delays", "messages", "contracts"]);
    const client = NAV_GROUPS.find((g) => g.title === "clientSpace")!.items.map((i) => i.key);
    expect(client.indexOf("vehicles")).toBe(client.indexOf("customers") + 1);
  });

  it("a mechanic sees only the overview and the stock on top", () => {
    expect(pick("MECHANIC", TOP_KEYS).map((i) => i.key)).toEqual(["dashboard", "parts"]);
    for (const role of ROLES) expect(pick(role, TOP_KEYS)[0]?.key).toBe("dashboard");
  });
});
