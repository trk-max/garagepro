"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { signOutAction } from "@/actions/auth";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Boxes,
  CalendarDays,
  Car,
  Menu,
  Smartphone,
  ClipboardList,
  FileText,
  LayoutDashboard,
  LogOut,
  PackageCheck,
  ReceiptText,
  Settings,
  ShoppingCart,
  Truck,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Role } from "@prisma/client";
import { LangSwitch } from "@/components/garage/lang-switch";
import { useI18n } from "@/lib/i18n/client";
import { can, type Permission } from "@/lib/permissions";
import { cn } from "@/lib/utils";

type NavKey =
  | "dashboard"
  | "appointments"
  | "workshop"
  | "workOrders"
  | "customers"
  | "clientInvoices"
  | "parts"
  | "suppliers"
  | "purchaseOrders"
  | "receipts"
  | "supplierInvoices"
  | "settings";

type Item = { key: NavKey; href: string; icon: LucideIcon; permission?: Permission };
type Group = { title?: "clientSpace" | "supplierSpace"; items: Item[] };

const GROUPS: Group[] = [
  { items: [{ key: "dashboard", href: "/garage", icon: LayoutDashboard }] },
  {
    title: "clientSpace",
    items: [
      { key: "appointments", href: "/garage/appointments", icon: CalendarDays, permission: "viewAppointments" },
      { key: "workshop", href: "/garage/atelier", icon: Smartphone, permission: "useWorkshop" },
      { key: "workOrders", href: "/garage/work-orders", icon: ClipboardList, permission: "viewWorkOrders" },
      { key: "customers", href: "/garage/customers", icon: Car, permission: "viewCustomers" },
      { key: "clientInvoices", href: "/garage/invoices", icon: FileText, permission: "viewClientInvoices" },
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
  { items: [{ key: "settings", href: "/garage/settings", icon: Settings, permission: "manageSettings" }] },
];

export function Sidebar({
  user,
  garageName,
  badges = {},
}: {
  user: { name: string; role: Role };
  garageName: string;
  badges?: Partial<Record<NavKey, number>>;
}) {
  const { t } = useI18n();

  return (
    <aside className="hidden h-dvh flex-col border-e bg-card lg:flex print:hidden">
      <div className="flex items-center gap-2 px-4 py-4">
        <span className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground">
          <Wrench className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{garageName}</p>
          <p className="text-xs text-muted-foreground">{t.common.appName}</p>
        </div>
      </div>

      <NavLinks role={user.role} badges={badges} className="flex-1 overflow-y-auto px-2" />

      <div className="space-y-3 border-t p-4">
        <div className="flex items-center justify-between gap-2">
          <LangSwitch />
          <ThemeToggle />
        </div>
        <UserRow user={user} />
      </div>
    </aside>
  );
}

function UserRow({ user }: { user: { name: string; role: Role } }) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{user.name}</p>
        <p className="text-xs text-muted-foreground">{t.roles[user.role]}</p>
      </div>
      <form action={signOutAction}>
        <button type="submit" className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label={t.common.signOut} title={t.common.signOut}>
          <LogOut className="size-4 rtl:rotate-180" />
        </button>
      </form>
    </div>
  );
}

function NavLinks({ role, badges, className, onNavigate }: { role: Role; badges: Partial<Record<NavKey, number>>; className?: string; onNavigate?: () => void }) {
  const pathname = usePathname();
  const { t } = useI18n();
  return (
      <nav className={cn("space-y-4", className)} aria-label="Navigation">
        {GROUPS.map((group, gi) => {
          const items = group.items.filter((i) => !i.permission || can(role, i.permission));
          if (items.length === 0) return null;
          return (
            <div key={gi} className="space-y-0.5">
              {group.title && (
                <p className="label-tech px-3 pb-1.5">{t.nav[group.title]}</p>
              )}
              {items.map(({ key, href, icon: Icon }) => {
                const active = href === "/garage" ? pathname === href : pathname.startsWith(href);
                const badge = badges[key];
                return (
                  <Link
                    key={key}
                    href={href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative flex min-h-10 items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors pointer-coarse:min-h-11",
                      active
                        ? "bg-accent font-medium text-accent-foreground before:absolute before:inset-y-2 before:start-0 before:w-0.5 before:rounded-full before:bg-primary"
                        : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                    )}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden />
                    <span className="flex-1">{t.nav[key]}</span>
                    {badge ? <span className="min-w-5 rounded-full bg-red-600 px-1.5 text-center text-xs font-semibold text-white">{badge}</span> : null}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>
  );
}

/** Top bar + drop-down menu for phones and tablets (the sidebar is hidden below 1024 px). */
export function MobileNav({
  user,
  garageName,
  badges = {},
}: {
  user: { name: string; role: Role };
  garageName: string;
  badges?: Partial<Record<NavKey, number>>;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const total = Object.values(badges).reduce<number>((s, n) => s + (n ?? 0), 0);
  return (
    <div className="sticky top-0 z-40 border-b bg-background lg:hidden print:hidden">
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
          <Wrench className="size-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{garageName}</span>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="relative grid size-11 place-items-center rounded-md hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          aria-label={t.common.menu}
        >
          <Menu className="size-5" aria-hidden />
          {total > 0 && <span className="absolute end-1 top-1 size-2 rounded-full bg-red-500" aria-hidden />}
        </button>
      </div>
      {open && (
        <div className="max-h-[80dvh] space-y-3 overflow-y-auto border-t bg-background p-3 shadow-lg">
          <NavLinks role={user.role} badges={badges} onNavigate={() => setOpen(false)} />
          <div className="flex items-center justify-between gap-2">
            <LangSwitch />
            <ThemeToggle withLabel />
          </div>
          <UserRow user={user} />
        </div>
      )}
    </div>
  );
}
