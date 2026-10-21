"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Thin bar at the top of the staff pages while a link is loading the next page. Replaces the
 * staff loading.tsx skeleton: with it, in production builds, links that only change the query
 * (tabs, filters, periods: ?tab=…, ?status=…, ?date=…) never finished their navigation.
 * Shown on a plain left click on an internal link; hidden as soon as the address changes
 * (or after 10 s, e.g. a download or a link to the same page).
 */
export function NavProgress() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [busy, setBusy] = useState(false);

  // New address = navigation done.
  useEffect(() => setBusy(false), [pathname, search]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]");
      if (!(a instanceof HTMLAnchorElement) || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname.startsWith("/api/")) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      setBusy(true);
    };
    // Capture phase: runs before the Link handler (which calls preventDefault for client navigation).
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  useEffect(() => {
    if (!busy) return;
    const timer = setTimeout(() => setBusy(false), 10_000);
    return () => clearTimeout(timer);
  }, [busy]);

  if (!busy) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5 overflow-hidden print:hidden" aria-hidden>
      <div className="gp-nav-progress h-full w-1/3 rounded-full bg-gp-accent" />
    </div>
  );
}
