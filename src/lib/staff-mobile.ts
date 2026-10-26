import type { Role } from "@prisma/client";
import { can, type PermOverrides, type Permission } from "@/lib/permissions";

/**
 * Staff shell on phones and tablets (< 1024 px): a labelled bottom tab bar chosen by role, each tab shown only
 * when the person may open the page (role + per-user access). « Plus » (all pages) is always the last tab.
 * Pure rules, unit-tested in tests/staff-mobile.test.ts.
 */
export type PhoneTabKey = "home" | "myCars" | "board" | "timeClock" | "todo" | "queue" | "orders" | "customers" | "invoices" | "stock" | "receipts" | "showroom";

export const PHONE_TABS: Record<PhoneTabKey, { href: string; permission?: Permission }> = {
  home: { href: "/garage/app" },
  myCars: { href: "/garage/atelier?view=mine", permission: "useWorkshop" },
  board: { href: "/garage/atelier?view=all", permission: "useWorkshop" },
  timeClock: { href: "/garage/pointage", permission: "useTimeClock" },
  todo: { href: "/garage/a-traiter" },
  queue: { href: "/garage/accueil", permission: "useReception" },
  orders: { href: "/garage/work-orders", permission: "viewWorkOrders" },
  customers: { href: "/garage/customers", permission: "viewCustomers" },
  invoices: { href: "/garage/invoices", permission: "viewClientInvoices" },
  stock: { href: "/garage/parts", permission: "viewStock" },
  receipts: { href: "/garage/receipts", permission: "receiveGoods" },
  showroom: { href: "/garage/showroom", permission: "viewShowroom" },
};

const BY_ROLE: Record<Role, PhoneTabKey[]> = {
  MECHANIC: ["home", "myCars", "timeClock", "todo"],
  RECEPTION: ["home", "queue", "orders", "customers"],
  MANAGER: ["home", "board", "todo", "invoices"],
  ADMIN: ["home", "board", "todo", "invoices"],
  STOREKEEPER: ["home", "stock", "receipts", "todo"],
  ACCOUNTANT: ["home", "invoices", "todo", "timeClock"],
  HR: ["home", "todo", "timeClock", "customers"],
  SELLER: ["home", "showroom", "timeClock", "todo"],
  SHOWROOM_MANAGER: ["home", "showroom", "todo", "timeClock"],
};
/** Filled in when a role tab is not allowed for this person (custom access), so the bar keeps 4 tabs + « Plus ». */
const FALLBACK: PhoneTabKey[] = ["todo", "orders", "timeClock", "customers", "stock", "invoices"];

export function phoneTabs(who: { role: Role; perms?: PermOverrides | null }): PhoneTabKey[] {
  const ok = (k: PhoneTabKey) => !PHONE_TABS[k].permission || can(who, PHONE_TABS[k].permission!);
  const tabs = BY_ROLE[who.role].filter(ok);
  for (const k of FALLBACK) if (tabs.length < 4 && ok(k) && !tabs.includes(k)) tabs.push(k);
  return tabs.slice(0, 4);
}

/** Active tab: the longest matching href (query strings ignored), so /garage/app/ordre/… lights « Accueil ». */
export function activePhoneTab(pathname: string, tabs: PhoneTabKey[]): PhoneTabKey | null {
  let best: PhoneTabKey | null = null;
  let len = -1;
  for (const k of tabs) {
    const base = PHONE_TABS[k].href.split("?")[0]!;
    if ((pathname === base || pathname.startsWith(`${base}/`)) && base.length > len) {
      best = k;
      len = base.length;
    }
  }
  return best;
}
