import { z } from "zod";
import { can, type Permission, type PermSubject } from "@/lib/permissions";

/**
 * V10.3 — personal dashboard. Each block of the overview page has a stable id; each user
 * stores the order and visibility they want in User.dashboardLayout ([{ id, visible }]).
 * Pure functions (no database): unit-tested in tests/dashboard-layout.test.ts.
 */

/** Default order (= the V10 design). */
export const DASHBOARD_BLOCKS = [
  "todayRevenue",
  "mechanics",
  "kpis",
  "revenueChart",
  "monthlyTarget",
  "recentOrders",
  "alerts",
  "workshopStatus",
  "appointments",
  "lowStock",
  "watchTiles",
  "weekCharts",
  "recentInvoices",
  "activity",
  // V12 — agenda of the upcoming repairs (due within 30 days, parts to order).
  "agenda",
  // V15 — reception queue (waiting, longest wait, absents).
  "reception",
] as const;
export type BlockId = (typeof DASHBOARD_BLOCKS)[number];
export type LayoutEntry = { id: BlockId; visible: boolean };

export const isBlockId = (v: unknown): v is BlockId => typeof v === "string" && (DASHBOARD_BLOCKS as readonly string[]).includes(v);

/**
 * Who may see each block (effective permissions, overrides included). `any` = one of them is enough;
 * an empty list = everyone signed in. Same rules as before V10.3 (money = viewFinance, etc.).
 */
const BLOCK_ACCESS: Record<BlockId, readonly Permission[]> = {
  todayRevenue: ["viewFinance", "viewWorkOrders"],
  mechanics: ["viewWorkOrders"],
  kpis: [],
  revenueChart: ["viewFinance"],
  monthlyTarget: ["viewFinance"],
  recentOrders: ["viewWorkOrders"],
  alerts: ["manageRepairFollowUp"],
  workshopStatus: ["viewWorkOrders"],
  appointments: ["viewAppointments"],
  lowStock: [],
  watchTiles: ["viewWorkOrders", "viewFinance", "manageTeam", "requestPurchase"],
  weekCharts: ["viewWorkOrders"],
  recentInvoices: ["viewFinance"],
  activity: ["viewWorkOrders"],
  agenda: ["viewAgenda"],
  reception: ["useReception"],
};

/** The blocks this user may see, in the default order. */
export function allowedBlocks(who: PermSubject): BlockId[] {
  return DASHBOARD_BLOCKS.filter((id) => BLOCK_ACCESS[id].length === 0 || BLOCK_ACCESS[id].some((p) => can(who, p)));
}

/** What the save action accepts: known ids only, each once. */
export const layoutSchema = z
  .array(z.object({ id: z.enum(DASHBOARD_BLOCKS), visible: z.boolean() }).strict())
  .max(DASHBOARD_BLOCKS.length)
  .refine((list) => new Set(list.map((e) => e.id)).size === list.length, "duplicate block");

/** Reads a stored layout leniently (unknown ids, duplicates and junk are dropped). */
export function parseSavedLayout(raw: unknown): LayoutEntry[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<BlockId>();
  const out: LayoutEntry[] = [];
  for (const e of raw) {
    if (!e || typeof e !== "object") continue;
    const { id, visible } = e as { id?: unknown; visible?: unknown };
    if (!isBlockId(id) || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, visible: visible !== false });
  }
  return out;
}

/**
 * Saved layout + allowed blocks → what is rendered and offered:
 * - the saved order, keeping only the allowed blocks (a block the user may not see is never
 *   rendered nor offered, even if it is in the saved layout);
 * - allowed blocks missing from the saved layout (new blocks, newly granted access) are added
 *   at the end, visible (the default).
 */
export function mergeLayout(saved: readonly LayoutEntry[], allowed: readonly BlockId[]): LayoutEntry[] {
  const ok = new Set(allowed);
  const out: LayoutEntry[] = [];
  const placed = new Set<BlockId>();
  for (const e of saved) {
    if (!ok.has(e.id) || placed.has(e.id)) continue;
    placed.add(e.id);
    out.push({ id: e.id, visible: e.visible });
  }
  for (const id of allowed) if (!placed.has(id)) out.push({ id, visible: true });
  return out;
}

/**
 * Layout to store after an edit: what the user submitted (only blocks they could see), followed
 * by the previously saved entries they could not see right now (e.g. access removed for a while),
 * so their place is kept if the access comes back.
 */
export function layoutToStore(submitted: readonly LayoutEntry[], previous: readonly LayoutEntry[]): LayoutEntry[] {
  const ids = new Set(submitted.map((e) => e.id));
  return [...submitted, ...previous.filter((e) => !ids.has(e.id))];
}

/** Default widths: [tablet (2 columns), desktop (12 columns)]. */
const SPANS: Record<BlockId, readonly [number, number]> = {
  todayRevenue: [1, 4],
  mechanics: [1, 4],
  kpis: [1, 4],
  revenueChart: [2, 4],
  monthlyTarget: [1, 4],
  recentOrders: [2, 8],
  alerts: [1, 4],
  workshopStatus: [2, 8],
  appointments: [1, 4],
  lowStock: [1, 8],
  watchTiles: [2, 12],
  weekCharts: [2, 12],
  recentInvoices: [1, 6],
  activity: [1, 6],
  agenda: [2, 12],
  reception: [1, 4],
};

/**
 * Packs blocks into rows of `cols` columns, in order; the last block of a row that is not full
 * is widened to fill it, so no hole is left whatever the user hides or moves.
 */
export function packRows(ids: readonly BlockId[], cols: number, widthOf: (id: BlockId) => number): Map<BlockId, number> {
  const out = new Map<BlockId, number>();
  let row: BlockId[] = [];
  let used = 0;
  const close = () => {
    const last = row.at(-1);
    if (last && used < cols) out.set(last, out.get(last)! + cols - used);
    row = [];
    used = 0;
  };
  for (const id of ids) {
    const w = Math.min(cols, Math.max(1, widthOf(id)));
    if (used + w > cols) close();
    row.push(id);
    used += w;
    out.set(id, w);
  }
  close();
  return out;
}

/** Column spans of the visible blocks on tablets (2 columns) and desktops (12 columns). */
export function blockSpans(ids: readonly BlockId[]): Map<BlockId, { md: number; xl: number }> {
  const md = packRows(ids, 2, (id) => SPANS[id][0]);
  const xl = packRows(ids, 12, (id) => SPANS[id][1]);
  return new Map(ids.map((id) => [id, { md: md.get(id)!, xl: xl.get(id)! }]));
}
