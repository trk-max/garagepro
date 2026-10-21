"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { NAV_GROUPS, navLabel, type NavBadges } from "@/components/shell/nav";
import { useI18n } from "@/lib/i18n/client";

/**
 * Bell with an orange dot when something waits (the same counters as the menu
 * badges: overdue invoices, unread messages, alerts, approvals…). Opens the list
 * of those pages with their counts.
 */
export function NotificationsMenu({ badges }: { badges: NavBadges }) {
  const { t } = useI18n();
  const items = NAV_GROUPS.flatMap((g) => g.items).filter((i) => (badges[i.key] ?? 0) > 0);
  const total = items.reduce((s, i) => s + (badges[i.key] ?? 0), 0);
  const label = total > 0 ? `${t.v10.shell.notifications} (${total})` : t.v10.shell.notifications;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={label}
        title={label}
        className="gp-pill-t relative grid size-11 place-items-center rounded-full text-gp-ink outline-none hover:bg-gp-hover focus-visible:ring-2 focus-visible:ring-gp-accent"
      >
        <Bell className="size-[18px]" aria-hidden />
        {total > 0 && <span className="absolute end-2.5 top-2.5 size-2.5 rounded-full border-2 border-gp-card bg-gp-accent" aria-hidden />}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={12} className="w-72 rounded-[20px] p-2">
        <DropdownMenuLabel className="px-3">{t.v10.shell.notifications}</DropdownMenuLabel>
        {items.length === 0 ? (
          <p className="px-3 py-4 text-sm text-gp-muted">{t.v10.shell.noNotifications}</p>
        ) : (
          items.map(({ key, href, icon: Icon }) => (
            <DropdownMenuItem key={key} asChild className="rounded-full px-3 py-2.5">
              <Link href={href}>
                <Icon className="size-4 text-gp-muted" aria-hidden />
                <span className="flex-1">{navLabel(t, key)}</span>
                <span className="sr-only">, </span>
                <span className="min-w-6 rounded-full bg-gp-accent-tint px-2 text-center text-xs font-semibold text-gp-accent-ink tabular-nums">{badges[key]}</span>
              </Link>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
