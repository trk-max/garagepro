"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarCheck, CarFront, Gauge, House } from "lucide-react";
import { cn } from "@/lib/utils";

export type AppTabLabels = { home: string; track: string; book: string; showroom: string; nav: string };

const TABS = [
  { href: "/app", key: "home", icon: House },
  { href: "/app/suivi", key: "track", icon: Gauge },
  { href: "/app/rdv", key: "book", icon: CalendarCheck },
  { href: "/app/showroom", key: "showroom", icon: CarFront },
] as const;

/**
 * Bottom tab bar of the CLIENT app (Accueil / Suivre / RDV / Showroom), always shown on the app pages (/app/…);
 * on the customer site only when it is opened from the home-screen icon (`standalone:`, see PortalShell) — its
 * tabs then lead into the app pages.
 */
export function AppTabBar({ labels, className }: { labels: AppTabLabels; className?: string }) {
  const pathname = usePathname() || "/";
  return (
    <nav
      aria-label={labels.nav}
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#0b0b0c]/95 pb-[env(safe-area-inset-bottom)] text-white backdrop-blur-md",
        className,
      )}
      data-testid="app-tab-bar"
    >
      <ul className="mx-auto grid max-w-md grid-cols-4">
        {TABS.map(({ href, key, icon: Icon }) => {
          // « Accueil » only on /app itself; the others also on their sub-pages (vehicle, confirmation, listing).
          const active = href === "/app" ? pathname === "/app" : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors",
                  active ? "text-[#f58a4f]" : "text-white/60 hover:text-white",
                )}
              >
                <Icon className="size-[22px]" strokeWidth={active ? 2.2 : 1.8} aria-hidden />
                {labels[key]}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
