"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, useRef, useState } from "react";
import { Ellipsis, LogOut, X } from "lucide-react";
import type { PermSubject } from "@/lib/permissions";
import { InstallAppButton } from "@/components/pwa/install-app-button";
import { PushToggle } from "@/components/pwa/push-toggle";
import { ThemeToggle } from "@/components/theme-toggle";
import { allowed, groupLabel, inMore, isActive, NAV_GROUPS, navLabel, type NavBadges } from "@/components/shell/nav";
import { Tip } from "@/components/shell/tip";
import { signOutNow } from "@/components/shell/sign-out-form";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

/**
 * "More" button + panel listing the staff pages that are neither in the top bar,
 * the rail nor the account menu (each page appears once, none is unreachable),
 * with the same permission filters and badges. Language and hub status are in the
 * account menu only; the theme button shows here on phones only. Native
 * <dialog>: focus stays inside, Escape and a click outside close it.
 */
export function MorePanel({
  who,
  badges,
  triggerClassName,
  all = false,
  triggerLabel,
}: {
  who: PermSubject;
  badges: NavBadges;
  triggerClassName: string;
  /** Phone tab bar « Plus »: every page the person may open (not only the ones missing from the bars). */
  all?: boolean;
  /** Visible label under the icon (phone tab bar). */
  triggerLabel?: string;
}) {
  const { t } = useI18n();
  const pathname = usePathname();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  // Content only exists while the panel is open.
  const [open, setOpen] = useState(false);
  const close = () => ref.current?.close();
  // Dot on the button only for badges of pages listed inside the panel.
  const listed = (key: keyof NavBadges) => all || inMore(key);
  const extra = Object.entries(badges).reduce<number>((s, [k, n]) => s + (listed(k as keyof NavBadges) ? (n ?? 0) : 0), 0);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          ref.current?.showModal();
        }}
        aria-haspopup="dialog"
        aria-label={t.v10.nav.allPages}
        className={cn(triggerClassName, "group text-gp-ink hover:bg-gp-hover")}
      >
        <Ellipsis className="size-[18px]" aria-hidden />
        {extra > 0 && <span className="absolute end-1.5 top-1.5 size-2 rounded-full bg-gp-accent" aria-hidden />}
        {triggerLabel ? <span className="text-[11px] leading-none font-medium">{triggerLabel}</span> : <Tip label={t.v10.nav.more} />}
      </button>
      <dialog
        ref={ref}
        aria-labelledby={titleId}
        onClick={(e) => e.target === e.currentTarget && close()}
        onClose={() => setOpen(false)}
        className="m-auto max-h-[min(44rem,calc(100dvh-2rem))] w-[min(56rem,calc(100vw-1.5rem))] rounded-[32px] border border-gp-line bg-gp-canvas p-0 text-gp-ink shadow-2xl backdrop:bg-black/40 backdrop:backdrop-blur-sm gp-enter"
      >
        {open && (
        <>
        <div className="flex items-center gap-3 p-5 pb-3">
          <h2 id={titleId} className="flex-1 text-2xl font-semibold tracking-tight">{t.v10.nav.allPages}</h2>
          <button type="button" onClick={close} aria-label={t.v10.shell.close} className="grid size-11 place-items-center rounded-full bg-gp-card hover:bg-gp-hover">
            <X className="size-[18px]" aria-hidden />
          </button>
        </div>
        <div className="grid gap-3 px-5 sm:grid-cols-2 lg:grid-cols-3">
          {NAV_GROUPS.map((g, gi) => {
            const items = g.items.filter((i) => listed(i.key) && allowed(who, i));
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
                          {badge ? (
                            <>
                              <span className="sr-only">, </span>
                              <span className="min-w-6 rounded-full bg-gp-accent px-2 text-center text-xs font-semibold text-white tabular-nums">{badge}</span>
                            </>
                          ) : null}
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
          {/* Phones only: the rail (desktop) and the bottom bar (tablets) already carry the theme switch. */}
          <ThemeToggle withLabel className="rounded-full bg-gp-card px-4 md:hidden" />
          <div className="ms-auto empty:hidden">
            <InstallAppButton className="rounded-full border-gp-line bg-gp-card px-4" />
          </div>
          <PushToggle />
          {/* Phones / tablets: sign-out also here, next to the pages (same hidden form as the account menu). */}
          <button
            type="button"
            onClick={signOutNow}
            className={cn("inline-flex min-h-11 items-center gap-2 rounded-full bg-gp-card px-4 text-sm font-medium text-gp-danger-ink hover:bg-gp-hover", !all && "xl:hidden")}
            data-testid="more-sign-out"
          >
            <LogOut className="size-4 rtl:rotate-180" aria-hidden /> {t.common.signOut}
          </button>
        </div>
        </>
        )}
      </dialog>
    </>
  );
}
