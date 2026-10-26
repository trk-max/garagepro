"use client";

import { useEffect } from "react";

/** Registers the service worker (production builds only: in dev it would cache stale code). */
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    let reg: ServiceWorkerRegistration | null = null;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((r) => (reg = r))
      .catch(() => {
        /* not a secure origin (http on the LAN), or blocked: the site still works normally */
      });
    // An installed app can stay open for days: look for a new worker each time it comes back to the screen.
    const onVisible = () => {
      if (document.visibilityState === "visible") reg?.update().catch(() => {});
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);
  return null;
}

/** Forget the private page copies (called on sign-out). */
export function clearPrivateCache() {
  if (typeof navigator !== "undefined" && navigator.serviceWorker?.controller) {
    navigator.serviceWorker.controller.postMessage("clear-private");
  }
}
