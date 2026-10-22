import { describe, expect, it } from "vitest";
import { allowedBlocks, blockSpans, DASHBOARD_BLOCKS, layoutSchema, layoutToStore, mergeLayout, packRows, parseSavedLayout, type BlockId, type LayoutEntry } from "@/lib/dashboard-layout";

describe("V10.3 — personal dashboard layout", () => {
  it("no saved layout = every allowed block, default order, visible", () => {
    const allowed = allowedBlocks("ADMIN");
    expect(allowed).toEqual([...DASHBOARD_BLOCKS]);
    expect(mergeLayout([], allowed)).toEqual(allowed.map((id) => ({ id, visible: true })));
  });
  it("keeps the saved order and visibility, drops blocks not allowed, appends new ones visible", () => {
    const saved: LayoutEntry[] = [
      { id: "lowStock", visible: true },
      { id: "revenueChart", visible: true }, // not allowed below
      { id: "kpis", visible: false },
    ];
    const allowed: BlockId[] = ["kpis", "lowStock", "recentOrders"];
    expect(mergeLayout(saved, allowed)).toEqual([
      { id: "lowStock", visible: true },
      { id: "kpis", visible: false },
      { id: "recentOrders", visible: true },
    ]);
  });
  it("blocks follow effective permissions (overrides included)", () => {
    expect(allowedBlocks("MECHANIC")).not.toContain("revenueChart");
    expect(allowedBlocks({ role: "MECHANIC", perms: { grant: ["viewFinance"], deny: [] } })).toContain("revenueChart");
    expect(allowedBlocks({ role: "MANAGER", perms: { grant: [], deny: ["viewFinance"] } })).not.toContain("recentInvoices");
    expect(allowedBlocks("STOREKEEPER")).toEqual(["kpis", "lowStock", "watchTiles"]);
  });
  it("stored layouts are read leniently", () => {
    expect(parseSavedLayout(null)).toEqual([]);
    expect(parseSavedLayout("x")).toEqual([]);
    expect(parseSavedLayout([{ id: "kpis", visible: false }, { id: "kpis", visible: true }, { id: "ghost" }, 3, { id: "alerts" }])).toEqual([
      { id: "kpis", visible: false },
      { id: "alerts", visible: true },
    ]);
  });
  it("the save schema refuses unknown ids and duplicates", () => {
    expect(layoutSchema.safeParse([{ id: "kpis", visible: true }]).success).toBe(true);
    expect(layoutSchema.safeParse([{ id: "ghost", visible: true }]).success).toBe(false);
    expect(layoutSchema.safeParse([{ id: "kpis", visible: true }, { id: "kpis", visible: false }]).success).toBe(false);
    expect(layoutSchema.safeParse([{ id: "kpis", visible: "yes" }]).success).toBe(false);
  });
  it("saving keeps the place of blocks the user could not see at the time", () => {
    expect(layoutToStore([{ id: "kpis", visible: true }], [{ id: "revenueChart", visible: false }, { id: "kpis", visible: false }])).toEqual([
      { id: "kpis", visible: true },
      { id: "revenueChart", visible: false },
    ]);
  });
  it("rows are packed without holes", () => {
    const widths: Partial<Record<BlockId, number>> = { alerts: 4, kpis: 4, watchTiles: 12, activity: 6 };
    const spans = packRows(["alerts", "kpis", "watchTiles", "activity"], 12, (id) => widths[id] ?? 4);
    expect(Object.fromEntries(spans)).toEqual({ alerts: 4, kpis: 8, watchTiles: 12, activity: 12 });
    // Default admin layout (mechanics inside the first card) = the V10 design.
    const ids = DASHBOARD_BLOCKS.filter((id) => id !== "mechanics");
    const xl = Object.fromEntries([...blockSpans(ids)].map(([id, s]) => [id, s.xl]));
    expect(xl).toEqual({ todayRevenue: 4, kpis: 4, revenueChart: 4, monthlyTarget: 4, recentOrders: 8, alerts: 4, workshopStatus: 8, appointments: 4, lowStock: 8, watchTiles: 12, weekCharts: 12, recentInvoices: 6, activity: 6, agenda: 12 });
  });
});
