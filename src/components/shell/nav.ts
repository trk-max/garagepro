import {
  BarChart3, BellRing, Boxes, Building2, CalendarCheck2, CalendarClock, CalendarDays, CalendarRange, Car, CarFront, ClipboardList, Clock3,
  DatabaseBackup, FileSignature, FileText, History, Landmark, LayoutGrid, Mail, MessageSquareWarning, PackageCheck, ReceiptText,
  CircleHelp, Settings, ShieldCheck, ShoppingCart, Smartphone, TrendingUp, TriangleAlert, Truck, UserRound, Users,
  Ticket,
} from "lucide-react";
import { Award, GraduationCap } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Dictionary } from "@/lib/i18n/fr";
import { can, type Permission, type PermSubject } from "@/lib/permissions";

/**
 * Every staff page of the menu, with the permission that shows it. Single list
 * used by the top bar, the rail and the "More" panel, so no page can become
 * unreachable and the filters stay the same everywhere.
 */
export type NavKey =
  | "dashboard" | "appointments" | "workshop" | "workOrders" | "delays" | "agenda" | "notifications" | "customers" | "vehicles" | "companies"
  | "clientInvoices" | "claims" | "warranties" | "parts" | "suppliers" | "purchaseOrders" | "receipts" | "supplierInvoices"
  | "timeClock" | "calendar" | "team" | "showroom" | "messages" | "contracts" | "reports" | "profitability" | "expenses"
  | "cash" | "audit" | "backups" | "settings" | "help"
  // V14 — carte des compétences.
  | "skills" | "mySkills"
  // V15 — accueil (file d'attente)
  | "reception";

export type NavBadges = Partial<Record<NavKey, number>>;
export type NavItem = { key: NavKey; href: string; icon: LucideIcon; permission?: Permission };
type GroupTitle = "clientSpace" | "supplierSpace" | "teamSpace" | "showroomSpace";
export type NavGroup = { title?: GroupTitle; items: NavItem[] };

export const NAV_GROUPS: NavGroup[] = [
  { items: [{ key: "dashboard", href: "/garage", icon: LayoutGrid }] },
  {
    title: "clientSpace",
    items: [
      { key: "appointments", href: "/garage/appointments", icon: CalendarDays, permission: "viewAppointments" },
      // V15: reception desk (queue) — in the "More" panel.
      { key: "reception", href: "/garage/accueil", icon: Ticket, permission: "useReception" },
      { key: "workshop", href: "/garage/atelier", icon: Smartphone, permission: "useWorkshop" },
      { key: "workOrders", href: "/garage/work-orders", icon: ClipboardList, permission: "viewWorkOrders" },
      { key: "delays", href: "/garage/suivi", icon: TriangleAlert, permission: "manageRepairFollowUp" },
      // V12: upcoming repairs agenda (follow-up menu; in the "More" panel).
      { key: "agenda", href: "/garage/agenda", icon: CalendarCheck2, permission: "viewAgenda" },
      { key: "notifications", href: "/garage/notifications", icon: BellRing, permission: "viewNotifications" },
      { key: "customers", href: "/garage/customers", icon: UserRound, permission: "viewCustomers" },
      { key: "vehicles", href: "/garage/vehicules", icon: Car, permission: "viewCustomers" },
      { key: "companies", href: "/garage/entreprises", icon: Building2, permission: "manageCompanyAccess" },
      { key: "clientInvoices", href: "/garage/invoices", icon: FileText, permission: "viewClientInvoices" },
      { key: "claims", href: "/garage/reclamations", icon: MessageSquareWarning, permission: "manageClaims" },
      { key: "warranties", href: "/garage/garanties", icon: ShieldCheck, permission: "manageWarranties" },
    ],
  },
  {
    title: "supplierSpace",
    items: [
      { key: "parts", href: "/garage/parts", icon: Boxes, permission: "viewStock" },
      { key: "suppliers", href: "/garage/suppliers", icon: Truck, permission: "viewSuppliers" },
      { key: "purchaseOrders", href: "/garage/purchase-orders", icon: ShoppingCart, permission: "requestPurchase" },
      { key: "receipts", href: "/garage/receipts", icon: PackageCheck, permission: "receiveGoods" },
      { key: "supplierInvoices", href: "/garage/supplier-invoices", icon: ReceiptText, permission: "viewSupplierInvoices" },
    ],
  },
  {
    title: "teamSpace",
    items: [
      { key: "timeClock", href: "/garage/pointage", icon: Clock3, permission: "useTimeClock" },
      { key: "calendar", href: "/garage/calendrier", icon: CalendarRange, permission: "useTimeClock" },
      { key: "team", href: "/garage/equipe", icon: Users, permission: "manageTeam" },
      // V14: team skills matrix (managers / HR) and each person's own skills (read-only), in the "More" panel.
      { key: "skills", href: "/garage/competences", icon: GraduationCap, permission: "viewSkills" },
      { key: "mySkills", href: "/garage/competences/moi", icon: Award, permission: "useTimeClock" },
    ],
  },
  {
    title: "showroomSpace",
    items: [
      { key: "showroom", href: "/garage/showroom", icon: CarFront, permission: "viewShowroom" },
      { key: "messages", href: "/garage/messages", icon: Mail, permission: "useShowroomMessages" },
    ],
  },
  {
    items: [
      // V9: contracts (what each role sees inside depends on the category — employment: admin + HR).
      { key: "contracts", href: "/garage/contrats", icon: FileSignature, permission: "viewContracts" },
      { key: "reports", href: "/garage/rapports", icon: BarChart3, permission: "viewReports" },
      { key: "profitability", href: "/garage/rentabilite", icon: TrendingUp, permission: "viewProfit" },
      { key: "expenses", href: "/garage/depenses", icon: CalendarClock, permission: "manageExpenses" },
      { key: "cash", href: "/garage/tresorerie", icon: Landmark, permission: "readCashForecast" },
      { key: "audit", href: "/garage/journal", icon: History, permission: "viewAuditLog" },
      { key: "backups", href: "/garage/sauvegardes", icon: DatabaseBackup, permission: "manageSettings" },
      { key: "settings", href: "/garage/settings", icon: Settings, permission: "manageSettings" },
      // V10.4: the help guide, open to everyone (account menu).
      { key: "help", href: "/garage/aide", icon: CircleHelp },
    ],
  },
];

const ALL = new Map(NAV_GROUPS.flatMap((g) => g.items).map((i) => [i.key, i]));

/**
 * Top pill bar (short labels): overview, stock and the money pages. Left rail: the
 * garage's daily work. "More" lists every other page; the team, contracts, help and
 * settings pages and sign-out live only in the account menu (V10.4). Each page therefore appears in exactly one place.
 */
export const TOP_KEYS: NavKey[] = ["dashboard", "parts", "clientInvoices", "cash", "profitability", "reports"];
export const RAIL_KEYS: NavKey[] = ["workOrders", "workshop", "appointments", "customers", "vehicles", "delays", "messages"];
/** Pages reached from the account menu only (never in the bar, the rail or "More"), in menu order. */
export const MENU_KEYS: NavKey[] = ["team", "contracts", "help", "settings"];
const PLACED = new Set<NavKey>([...TOP_KEYS, ...RAIL_KEYS, ...MENU_KEYS]);
/** True when a page belongs in the "More" panel (not already in the bar, the rail or the account menu). */
export const inMore = (key: NavKey) => !PLACED.has(key);

/** `who`: the signed-in user (role + V10.3 overrides) — a bare role keeps the role-only answer. */
export const allowed = (who: PermSubject, item: NavItem) => !item.permission || can(who, item.permission);
export const pick = (who: PermSubject, keys: NavKey[]) => keys.map((k) => ALL.get(k)!).filter((i) => allowed(who, i));
export const isActive = (pathname: string, href: string) => (href === "/garage" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));

const V7 = ["timeClock", "team", "calendar", "delays", "audit", "companies", "profitability", "notifications", "backups", "warranties", "expenses", "cash"] as const;

/** Full label of a page, from the dictionaries the old sidebar used. */
export function navLabel(t: Dictionary, key: NavKey): string {
  if (key === "contracts") return t.ctr.nav;
  if (key === "showroom" || key === "messages") return t.showroom.nav[key];
  if (key === "vehicles") return t.v10.nav.vehicles;
  if (key === "help") return t.todo.help;
  if (key === "agenda") return t.v12.nav;
  if (key === "skills" || key === "mySkills") return t.v14.nav[key];
  if (key === "reception") return t.v15.nav;
  if ((V7 as readonly string[]).includes(key)) return t.v7.nav[key as (typeof V7)[number]];
  return t.nav[key as Exclude<NavKey, (typeof V7)[number] | "contracts" | "showroom" | "messages" | "vehicles" | "help" | "agenda" | "skills" | "mySkills" | "reception">];
}

/** Short label for the top pill bar. */
export function topLabel(t: Dictionary, key: NavKey): string {
  const n = t.v10.nav;
  const short: Partial<Record<NavKey, string>> = { dashboard: n.overview, parts: n.stock, clientInvoices: n.invoices, cash: n.cash, profitability: n.profitability, reports: n.reports };
  return short[key] ?? navLabel(t, key);
}

export function groupLabel(t: Dictionary, title: GroupTitle): string {
  return title === "teamSpace" ? t.v7.team.title : title === "showroomSpace" ? t.showroom.nav.group : t.nav[title];
}

