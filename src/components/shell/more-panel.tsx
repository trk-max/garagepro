"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, useRef } from "react";
import { Ellipsis, X } from "lucide-react";
import type { Role } from "@prisma/client";
import { LangSwitch } from "@/components/garage/lang-switch";
import { HubStatus } from "@/components/pwa/hub-status";
import { InstallAppButton } from "@/components/pwa/install-app-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { allowed, groupLabel, isActive, NAV_GROUPS, navLabel, type NavBadges } from "@/components/shell/nav";
import { Tip } from "@/components/shell/tip";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

/**
 * "More" button + panel listing EVERY staff page of the former sidebar, with the
 * same permission filters and badges (nothing becomes unreachable). Native
 * <dialog>: focus stays inside, Escape and a click outside close it.
 */
export function MorePanel({ role, badges, triggerClassName }: { role: Role; badges: NavBadges; triggerClassName: string }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const close = () => ref.current?.close();
  const extra = Object.values(badges).reduce<number>((s, n) => s + (n ?? 0), 0);
  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        aria-haspopup="dialog"
        aria-label={t.v10.nav.allPages}
        className={cn(triggerClassName, "group text-gp-ink hover:bg-gp-hover")}
      >
        <Ellipsis className="size-[18px]" aria-hidden />
        {extra > 0 && <span className="absolute end-1.5 top-1.5 size-2 rounded-full bg-gp-accent" aria-hidden />}
        <Tip label={t.v10.nav.more} />
      </button>
      <dialog
        ref={ref}
        aria-labelledby={titleId}
        onClick={(e) => e.target === e.currentTarget && close()}
        className="m-auto max-h-[min(44rem,calc(100dvh-2rem))] w-[min(56rem,calc(100vw-1.5rem))] rounded-[32px] border border-gp-line bg-gp-canvas p-0 text-gp-ink shadow-2xl backdrop:bg-black/40 backdrop:backdrop-blur-sm gp-enter"
      >
        <div className="flex items-center gap-3 p-5 pb-3">
          <h2 id={titleId} className="flex-1 text-2xl font-semibold tracking-tight">{t.v10.nav.allPages}</h2>
          <button type="button" onClick={close} aria-label={t.v10.shell.close} className="grid size-11 place-items-center rounded-full bg-gp-card hover:bg-gp-hover">
            <X className="size-[18px]" aria-hidden />
          </button>
        </div>
        <div className="grid gap-3 px-5 sm:grid-cols-2 lg:grid-cols-3">
          {NAV_GROUPS.map((g, gi) => {
            const items = g.items.filter((i) => allowed(role, i));
            if (items.length === 0) return null;
            return (
              <section key={gi} className="rounded-[24px] bg-gp-card p-3">
                {g.title && <h3 className="px-2 pb-1 text-xs font-medium text-gp-muted">{groupLabel(t, g.title)}</h3>}
                <ul>
                  {items.map(({ key, href, icon: Icon }) => {
                    const active = isActive(pathname, href);
                    const badge = badges[key];
                    return (
                      <li key={key}>
                        <Link
                          href={href}
                          onClick={close}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "gp-pill-t flex min-h-11 items-center gap-3 rounded-full px-3 text-sm",
                            active ? "bg-gp-primary text-gp-primary-ink" : "hover:bg-gp-hover",
                          )}
                        >
                          <Icon className="size-4 shrink-0" aria-hidden />
                          <span className="flex-1">{navLabel(t, key)}</span>
                          {badge ? <span className="min-w-6 rounded-full bg-gp-accent px-2 text-center text-xs font-semibold text-white tabular-nums">{badge}</span> : null}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-3 p-5">
          <LangSwitch className="rounded-full border-gp-line bg-gp-card p-1 [&_a]:rounded-full" />
          <ThemeToggle withLabel className="rounded-full bg-gp-card px-4" />
          <div className="empty:hidden">
            <HubStatus />
          </div>
          <div className="ms-auto empty:hidden">
            <InstallAppButton className="rounded-full border-gp-line bg-gp-card px-4" />
          </div>
        </div>
      </dialog>
    </>
  );
}
