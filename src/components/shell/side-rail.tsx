"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Moon, Sun, type LucideIcon } from "lucide-react";
import type { Role } from "@prisma/client";
import { MorePanel } from "@/components/shell/more-panel";
import { Tip } from "@/components/shell/tip";
import { isActive, navLabel, pick, RAIL_KEYS, type NavBadges } from "@/components/shell/nav";
import { useTheme } from "@/components/theme-toggle";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

const group = "flex items-center gap-1 rounded-full border border-gp-line bg-gp-card p-1.5 shadow-gp";
const btn = "gp-pill-t relative grid size-10 shrink-0 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-gp-accent xl:size-11";

/**
 * Floating icon rail (≥ 1280 px, left / right in Arabic): theme switch on top,
 * then the garage's daily pages with a "More" panel for the other pages.
 * Sign-out and settings live only in the account menu. Below 1280 px the same
 * icons become a bottom bar.
 */
export function SideRail({ role, badges }: { role: Role; badges: NavBadges }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const items = pick(role, RAIL_KEYS);
  const links = items.map((i) => (
    <RailLink key={i.key} href={i.href} icon={i.icon} label={navLabel(t, i.key)} active={isActive(pathname, i.href)} badge={badges[i.key]} />
  ));
  return (
    <>
      <nav aria-label={t.v10.nav.quick} className="sticky top-28 hidden h-[calc(100dvh-8.5rem)] flex-col items-center gap-4 pb-2 xl:flex print:hidden">
        <ThemeSwitch />
        <div className={cn(group, "flex-col")}>
          {links}
          <MorePanel role={role} badges={badges} triggerClassName={btn} />
        </div>
      </nav>
      {/* Tablets and phones: same icons as a floating bottom bar. */}
      <nav aria-label={t.v10.nav.quick} className="fixed inset-x-0 bottom-3 z-40 flex justify-center px-3 xl:hidden print:hidden">
        <div className={cn(group, "max-w-full shadow-lg")}>
          {/* Phones: the page icons scroll sideways, "More" stays pinned at the end. */}
          <div className="gp-scroll-x flex min-w-0 items-center gap-1 max-md:-m-1 max-md:overflow-x-auto max-md:p-1">{links}</div>
          <MorePanel role={role} badges={badges} triggerClassName={btn} />
          <span className="hidden md:contents">
            <ThemeButton />
          </span>
        </div>
      </nav>
    </>
  );
}

function RailLink({ href, icon: Icon, label, active, badge }: { href: string; icon: LucideIcon; label: string; active: boolean; badge?: number }) {
  return (
    <Link
      href={href}
      aria-label={badge ? `${label} (${badge})` : label}
      aria-current={active ? "page" : undefined}
      className={cn(btn, "group", active ? "bg-gp-primary text-gp-primary-ink" : "text-gp-ink hover:bg-gp-hover")}
    >
      <Icon className="size-[18px]" aria-hidden />
      {badge ? (
        <span className="absolute -end-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full border-2 border-gp-card bg-gp-accent px-1 text-[10px] leading-none font-semibold text-white tabular-nums" aria-hidden>
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
      <Tip label={label} />
    </Link>
  );
}


/** Sun / moon pair at the top of the rail (the active theme sits in a filled circle). */
function ThemeSwitch() {
  const { t } = useI18n();
  const [theme, setTheme] = useTheme();
  const opt = (value: "light" | "dark", Icon: LucideIcon, label: string) => (
    <button
      type="button"
      onClick={() => setTheme(value)}
      aria-pressed={theme === value}
      aria-label={label}
      className={cn(btn, "group", theme === value ? "bg-gp-hover text-gp-ink" : "text-gp-muted hover:text-gp-ink")}
    >
      <Icon className="size-[18px]" aria-hidden />
      <Tip label={label} />
    </button>
  );
  return (
    <div className={cn(group, "flex-col")} role="group" aria-label={t.v10.shell.theme}>
      {opt("light", Sun, t.common.lightMode)}
      {opt("dark", Moon, t.common.darkMode)}
    </div>
  );
}

/** Single theme button for the bottom bar. */
function ThemeButton() {
  const { t } = useI18n();
  const [theme, setTheme] = useTheme();
  const label = theme === "dark" ? t.common.lightMode : t.common.darkMode;
  return (
    <button type="button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label={label} className={cn(btn, "group text-gp-ink hover:bg-gp-hover")}>
      {theme === "dark" ? <Sun className="size-[18px]" aria-hidden /> : <Moon className="size-[18px]" aria-hidden />}
      <Tip label={label} />
    </button>
  );
}
