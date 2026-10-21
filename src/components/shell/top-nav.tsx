"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Search, X } from "lucide-react";
import { PlateSearch } from "@/components/garage/plate-search";
import { NotificationsMenu } from "@/components/shell/notifications-menu";
import { UserMenu, type ShellUser } from "@/components/shell/user-menu";
import { isActive, pick, topLabel, TOP_KEYS, type NavBadges } from "@/components/shell/nav";
import { useI18n } from "@/lib/i18n/client";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";

const pill = "rounded-full border border-gp-line bg-gp-card shadow-gp";

/**
 * Floating pill top bar: logo pill, page pills (active = black), then search,
 * notifications and the account pill. Below 1280 px the page pills move to a
 * second row and scroll sideways.
 */
export function TopNav({ logo, user, badges }: { logo: ReactNode; user: ShellUser; badges: NavBadges }) {
  const { t } = useI18n();
  const items = pick(user, TOP_KEYS);
  return (
    <header className="sticky top-0 z-40 rounded-t-[32px] bg-gp-canvas/85 px-3 pt-3 pb-2 backdrop-blur-md sm:px-5 sm:pt-4 print:hidden">
      <div className="flex items-center gap-2 sm:gap-3">
        <div className={cn(pill, "flex h-14 min-w-0 shrink items-center")}>{logo}</div>
        <PageNav items={items} className="hidden flex-1 justify-center xl:flex" label={t.v10.nav.main} badges={badges} />
        <div className="ms-auto flex shrink-0 items-center gap-2 sm:gap-3 xl:ms-0">
          <div className={cn(pill, "flex h-14 items-center gap-1 px-1.5")}>
            {can(user, "viewWorkOrders") && <SearchButton />}
            <NotificationsMenu badges={badges} />
          </div>
          <UserMenu user={user} />
        </div>
      </div>
      <PageNav items={items} className="mt-2 xl:hidden" label={t.v10.nav.main} badges={badges} />
    </header>
  );
}

function PageNav({ items, className, label, badges }: { items: ReturnType<typeof pick>; className?: string; label: string; badges: NavBadges }) {
  const pathname = usePathname();
  const { t } = useI18n();
  const list = useRef<HTMLUListElement>(null);
  // Phones: bring the active pill into view when it sits beyond the edge of the scrolling row.
  useEffect(() => {
    const ul = list.current;
    const on = ul?.querySelector<HTMLElement>("[aria-current=page]");
    if (ul && on && ul.scrollWidth > ul.clientWidth) on.scrollIntoView({ block: "nearest", inline: "center" });
  }, [pathname]);
  if (items.length === 0) return null;
  return (
    <nav aria-label={label} className={cn("min-w-0", className)}>
      <ul ref={list} className={cn(pill, "gp-scroll-x flex h-14 items-center gap-1 overflow-x-auto p-1.5")}>
        {items.map((i) => {
          const active = isActive(pathname, i.href);
          const badge = badges[i.key];
          return (
            <li key={i.key} className="shrink-0">
              <Link
                href={i.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "gp-pill-t flex h-11 items-center rounded-full px-4 text-sm font-medium whitespace-nowrap sm:px-5",
                  active ? "bg-gp-primary text-gp-primary-ink" : "text-gp-ink hover:bg-gp-hover",
                )}
              >
                {topLabel(t, i.key)}
                {badge ? (
                  <>
                    <span className="sr-only">, </span>
                    <span className="ms-2 min-w-5 rounded-full bg-gp-accent px-1.5 text-center text-xs font-semibold text-white tabular-nums">{badge > 99 ? "99+" : badge}</span>
                  </>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Round search button opening the plate search (same form as before: GET /garage/work-orders/new?plate=…). */
function SearchButton() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    box.current?.querySelector("input")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={t.v10.shell.search}
        title={t.v10.shell.search}
        className="gp-pill-t grid size-11 place-items-center rounded-full text-gp-ink hover:bg-gp-hover"
      >
        {open ? <X className="size-[18px]" aria-hidden /> : <Search className="size-[18px]" aria-hidden />}
      </button>
      {open && (
        <div className="gp-enter absolute end-0 top-full z-50 mt-3 w-[min(22rem,calc(100vw-2rem))] rounded-[24px] border border-gp-line bg-gp-card p-3 shadow-lg">
          <PlateSearch placeholder={t.plateLookup.quick} label={t.plateLookup.title} />
          <p className="mt-2 px-2 text-xs text-gp-muted">{t.plateLookup.hint}</p>
        </div>
      )}
    </div>
  );
}

