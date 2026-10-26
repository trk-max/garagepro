import type { Role } from "@prisma/client";
import { can, type PermOverrides, type Permission, type PermSubject } from "@/lib/permissions";
import { TODO_DEFS, todoHref, type TodoKey } from "@/lib/todo";

/**
 * PWA team app « Espace équipe » (/garage/app): the big shortcut tiles, role first, each one shown only
 * when the person may open the page (role + per-user access, can()). Pure rules, unit-tested in
 * tests/pwa-app.test.ts; the counts come from the existing « À traiter » counts and status counts.
 */
export const TEAM_TILE_KEYS = [
  "workshop", "board", "newOrder", "queue", "appointments", "orders", "quotes", "ready", "todo", "missingParts", "receipts",
  "lowStock", "purchaseOrders", "stock", "timeClock", "invoices", "team", "showroom", "messages", "mySkills", "customers", "delays",
] as const;
export type TeamTileKey = (typeof TEAM_TILE_KEYS)[number];

type Tile = { href: string; visible: (who: PermSubject) => boolean; todo?: TodoKey };
const perm = (p: Permission) => (who: PermSubject) => can(who, p);
const todoVisible = (k: TodoKey) => (who: PermSubject) => TODO_DEFS[k].visible(who);

export const TEAM_TILES: Record<TeamTileKey, Tile> = {
  workshop: { href: "/garage/atelier?view=mine", visible: perm("useWorkshop") },
  board: { href: "/garage/atelier?view=all", visible: perm("useWorkshop") },
  newOrder: { href: "/garage/work-orders/new", visible: perm("viewWorkOrders") },
  queue: { href: "/garage/accueil", visible: perm("useReception") },
  appointments: { href: "/garage/appointments", visible: perm("viewAppointments") },
  orders: { href: "/garage/work-orders", visible: perm("viewWorkOrders") },
  // Quote to prepare / send: orders still in diagnosis (the quote is sent from the order).
  quotes: { href: "/garage/work-orders?status=DIAGNOSIS", visible: perm("manageQuotes") },
  ready: { href: "/garage/work-orders?status=READY", visible: perm("deliverWorkOrder") },
  todo: { href: "/garage/a-traiter", visible: () => true },
  missingParts: { href: todoHref("missingParts"), visible: todoVisible("missingParts"), todo: "missingParts" },
  receipts: { href: "/garage/receipts", visible: perm("receiveGoods") },
  lowStock: { href: todoHref("lowStock"), visible: todoVisible("lowStock"), todo: "lowStock" },
  purchaseOrders: { href: "/garage/purchase-orders", visible: perm("requestPurchase"), todo: "purchaseOrders" },
  stock: { href: "/garage/parts", visible: perm("viewStock") },
  timeClock: { href: "/garage/pointage", visible: perm("useTimeClock") },
  invoices: { href: "/garage/invoices", visible: perm("viewClientInvoices"), todo: "overdueInvoices" },
  team: { href: "/garage/equipe", visible: perm("manageTeam"), todo: "leaves" },
  showroom: { href: "/garage/showroom", visible: perm("viewShowroom") },
  messages: { href: "/garage/messages", visible: perm("useShowroomMessages"), todo: "unreadMessages" },
  mySkills: { href: "/garage/competences/moi", visible: perm("useTimeClock") },
  customers: { href: "/garage/customers", visible: perm("viewCustomers") },
  delays: { href: "/garage/suivi", visible: perm("manageRepairFollowUp"), todo: "lateRepairs" },
};

/** The most important actions of each role, in order (the owner's list); the others go under « Autres pages ». */
export const TEAM_FOCUS: Record<Role, TeamTileKey[]> = {
  MECHANIC: ["workshop", "timeClock", "appointments", "stock", "mySkills"],
  RECEPTION: ["queue", "appointments", "newOrder", "quotes", "ready", "orders"],
  MANAGER: ["todo", "board", "orders", "appointments", "quotes", "delays"],
  ADMIN: ["todo", "board", "orders", "appointments", "invoices", "purchaseOrders"],
  STOREKEEPER: ["missingParts", "receipts", "lowStock", "purchaseOrders", "stock"],
  ACCOUNTANT: ["invoices", "todo", "timeClock"],
  HR: ["team", "timeClock", "todo"],
  SELLER: ["showroom", "messages", "timeClock"],
  SHOWROOM_MANAGER: ["showroom", "messages", "todo"],
};

/** The signed-in person: role + per-user access (V10.3). */
export type TeamWho = { role: Role; perms?: PermOverrides | null };

/** Main tiles (role focus) and the other pages this person may open — never a page they may not. */
export function teamTiles(who: TeamWho): { main: TeamTileKey[]; more: TeamTileKey[] } {
  const ok = (k: TeamTileKey) => TEAM_TILES[k].visible(who);
  const main = TEAM_FOCUS[who.role].filter(ok);
  // « board » and « workshop » are the same page (all cars / my cars): only one of them — « my cars » for a
  // mechanic, the whole board for everyone else.
  const twin: TeamTileKey = main.includes("workshop") || (who.role === "MECHANIC" && !main.includes("board")) ? "board" : "workshop";
  const more = TEAM_TILE_KEYS.filter((k) => ok(k) && !main.includes(k) && k !== twin);
  return { main, more };
}

/** Sections of the home: the mechanic's vehicles, today's appointments (desk / managers), the « À traiter » list. */
export function teamSections(who: TeamWho) {
  return {
    // Loaded for anyone who works in the workshop; shown to a mechanic always, to others only when a car is theirs.
    myOrders: can(who, "useWorkshop"),
    appointments: can(who, "viewAppointments") && who.role !== "MECHANIC",
    queue: can(who, "useReception"),
  };
}
