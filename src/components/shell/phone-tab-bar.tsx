"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Boxes, CarFront, ClipboardList, Clock3, FileText, House, LayoutGrid, ListTodo, PackageCheck, Ticket, UserRound, Wrench, type LucideIcon } from "lucide-react";
import type { Role } from "@prisma/client";
import { MorePanel } from "@/components/shell/more-panel";
import type { NavBadges } from "@/components/shell/nav";
import { useI18n } from "@/lib/i18n/client";
import type { PermOverrides } from "@/lib/permissions";
import { activePhoneTab, PHONE_TABS, phoneTabs, type PhoneTabKey } from "@/lib/staff-mobile";
import { cn } from "@/lib/utils";

const ICONS: Record<PhoneTabKey, LucideIcon> = {
  home: House, myCars: Wrench, board: LayoutGrid, timeClock: Clock3, todo: ListTodo, queue: Ticket, orders: ClipboardList,
  customers: UserRound, invoices: FileText, stock: Boxes, receipts: PackageCheck, showroom: CarFront,
};

const tab = "relative flex min-h-16 flex-1 flex-col items-center justify-center gap-1 px-1 text-[11px] leading-none font-medium";

/**
 * Phones and tablets (< 1024 px): labelled bottom tab bar chosen by role (4 tabs + « Plus » = every page the
 * person may open, sign-out included). It sits on the page's bottom edge above the iPhone safe area, and the
 * shell keeps room for it, so it never covers content nor Safari's toolbar. Desktop keeps its rail.
 */
export function PhoneTabBar({ who, badges, todoCount }: { who: { role: Role; perms?: PermOverrides | null }; badges: NavBadges; todoCount: number }) {
  const { t } = useI18n();
  const pathname = usePathname() ?? "";
  const tabs = phoneTabs(who);
  const active = activePhoneTab(pathname, tabs);
  const l = t.staffMobile.tabs;
  return (
    <nav
      aria-label={l.nav}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-gp-line bg-gp-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden print:hidden"
      data-testid="phone-tab-bar"
    >
      <ul className="mx-auto flex max-w-2xl items-stretch">
        {tabs.map((k) => {
          const Icon = ICONS[k];
          const on = active === k;
          const n = k === "todo" ? todoCount : k === "invoices" ? badges.clientInvoices : undefined;
          return (
            <li key={k} className="flex flex-1">
              <Link href={PHONE_TABS[k].href} aria-current={on ? "page" : undefined} className={cn(tab, on ? "text-gp-accent-ink" : "text-gp-muted hover:text-gp-ink")}>
                <span className={cn("grid h-8 w-12 place-items-center rounded-full", on && "bg-gp-accent-tint")}>
                  <Icon className="size-5" strokeWidth={on ? 2.2 : 1.8} aria-hidden />
                </span>
                {l[k]}
                {n ? (
                  <span className="absolute start-[calc(50%+6px)] top-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-gp-accent px-1 text-[10px] font-semibold text-white tabular-nums">
                    {n > 99 ? "99+" : n}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
        <li className="flex flex-1">
          <MorePanel who={who} badges={badges} all triggerLabel={l.more} triggerClassName={cn(tab, "w-full text-gp-muted hover:text-gp-ink")} />
        </li>
      </ul>
    </nav>
  );
}
