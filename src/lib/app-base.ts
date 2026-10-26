"use client";

import { usePathname } from "next/navigation";

/**
 * PWA client app: the customer pages exist twice — on the website (/suivi, /rdv, /showroom, /assistant) and inside
 * the app (/app/suivi, /app/rdv…, same components). "/app" when the page is shown inside the app, "" on the website,
 * so links and redirects stay in the place the customer started from.
 */
export function useAppBase(): "" | "/app" {
  const p = usePathname() ?? "";
  return p === "/app" || p.startsWith("/app/") ? "/app" : "";
}

/** Where the back arrow goes from an app page (the tab's own home, or the app home). */
export function appBackHref(pathname: string): string | null {
  if (pathname === "/app") return null;
  if (/^\/app\/showroom\/[^/]+/.test(pathname)) return "/app/showroom";
  return "/app";
}
