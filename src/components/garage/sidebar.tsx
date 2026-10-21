"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { signOutAction } from "@/actions/auth";
import { ThemeToggle } from "@/components/theme-toggle";
import { InstallAppButton } from "@/components/pwa/install-app-button";
import { clearPrivateCache } from "@/components/pwa/pwa-register";
import { HubStatus } from "@/components/pwa/hub-status";
import {
  Building2, BarChart3,
  CalendarRange,
  Clock3,
  History,
  TriangleAlert,
  Users,
  MessageSquareWarning,
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
} from "lucide-react";
import { GpMonogram, GpWordmark } from "@/components/brand/garagepro-logo";
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
  | "claims"
  | "reports"
  | "settings"
  | "timeClock"
  | "team"
  | "calendar"
  | "delays"
  | "audit"
  | "companies";

type V7Key = "timeClock" | "team" | "calendar" | "delays" | "audit" | "companies";
const V7_KEYS: V7Key[] = ["timeClock", "team", "calendar", "delays", "audit", "companies"];

type Item = { key: NavKey; href: string; icon: LucideIcon; permission?: Permission };
type Group = { title?: "clientSpace" | "supplierSpace" | "teamSpace"; items: Item[] };

const GROUPS: Group[] = [
  { items: [{ key: "dashboard", href: "/garage", icon: LayoutDashboard }] },
  {
    title: "clientSpace",
    items: [
      { key: "appointments", href: "/garage/appointments", icon: CalendarDays, permission: "viewAppointments" },
      { key: "workshop", href: "/garage/atelier", icon: Smartphone, permission: "useWorkshop" },
      { key: "workOrders", href: "/garage/work-orders", icon: ClipboardList, permission: "viewWorkOrders" },
      { key: "delays", href: "/garage/suivi", icon: TriangleAlert, permission: "manageRepairFollowUp" },
      { key: "customers", href: "/garage/customers", icon: Car, permission: "viewCustomers" },
      { key: "companies", href: "/garage/entreprises", icon: Building2, permission: "manageCompanyAccess" },
      { key: "clientInvoices", href: "/garage/invoices", icon: FileText, permission: "viewClientInvoices" },
      { key: "claims", href: "/garage/reclamations", icon: MessageSquareWarning, permission: "manageClaims" },
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
    ],
  },
  {
    items: [
      { key: "reports", href: "/garage/rapports", icon: BarChart3, permission: "viewReports" },
      { key: "audit", href: "/garage/journal", icon: History, permission: "viewAuditLog" },
      { key: "settings", href: "/garage/settings", icon: Settings, permission: "manageSettings" },
    ],
  },
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
  return (
    <aside className="dark hidden h-dvh flex-col border-e border-[#303030] bg-black text-white lg:flex print:hidden">
      <Link href="/garage" className="flex items-center gap-3 border-b border-[#303030] px-4 py-5" aria-label={garageName}>
        <GpMonogram className="h-9 w-auto shrink-0 text-white" aria-hidden />
        <span className="min-w-0">
          <GpWordmark className="h-2.5 w-auto text-white" aria-hidden />
          <span className="f-label mt-1.5 block truncate text-[0.625rem] text-white/50">{garageName}</span>
        </span>
      </Link>

      <NavLinks role={user.role} badges={badges} className="flex-1 overflow-y-auto px-2" />

      <div className="space-y-3 border-t border-[#303030] p-4">
        <HubStatus />
        <InstallAppButton />
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
      {/* Sign-out also forgets the pages saved for offline use on this device. */}
      <form action={signOutAction} onSubmit={() => clearPrivateCache()}>
        <button type="submit" className="grid size-10 place-items-center text-muted-foreground transition-colors hover:text-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" aria-label={t.common.signOut} title={t.common.signOut}>
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
      <nav className={cn("space-y-5 py-4", className)} aria-label="Navigation">
        {GROUPS.map((group, gi) => {
          const items = group.items.filter((i) => !i.permission || can(role, i.permission));
          if (items.length === 0) return null;
          return (
            <div key={gi} className="space-y-0.5">
              {group.title && (
                <p className="f-label px-3 pb-2 text-[0.625rem] text-muted-foreground">{group.title === "teamSpace" ? t.v7.team.title : t.nav[group.title]}</p>
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
                      "relative flex min-h-10 items-center gap-3 px-3 py-2 text-[0.75rem] tracking-[0.06em] uppercase transition-colors pointer-coarse:min-h-11",
                      active
                        ? "bg-accent text-foreground before:absolute before:inset-y-0 before:start-0 before:w-0.5 before:bg-brand-500"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Icon className="size-4 shrink-0" strokeWidth={1.5} aria-hidden />
                    <span className="flex-1">{(V7_KEYS as string[]).includes(key) ? t.v7.nav[key as V7Key] : t.nav[key as Exclude<NavKey, V7Key>]}</span>
                    {badge ? <span className="min-w-5 bg-brand-500 px-1.5 text-center text-[0.6875rem] font-semibold tracking-normal text-white">{badge}</span> : null}
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
    <div className="dark sticky top-0 z-40 border-b border-[#303030] bg-black text-white lg:hidden print:hidden">
      <div className="flex items-center gap-3 px-3 py-2">
        <Link href="/garage" className="flex min-w-0 flex-1 items-center gap-3" aria-label={garageName}>
          <GpMonogram className="h-8 w-auto shrink-0 text-white" aria-hidden />
          <GpWordmark className="h-2.5 w-auto text-white" aria-hidden />
        </Link>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="relative grid size-11 place-items-center hover:text-brand-500 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          aria-label={t.common.menu}
        >
          <Menu className="size-5" aria-hidden />
          {total > 0 && <span className="absolute end-1.5 top-1.5 size-2 bg-brand-500" aria-hidden />}
        </button>
      </div>
      {open && (
        <div className="max-h-[80dvh] space-y-3 overflow-y-auto border-t border-[#303030] bg-black p-3">
          <NavLinks role={user.role} badges={badges} onNavigate={() => setOpen(false)} />
          <HubStatus />
          <InstallAppButton />
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
