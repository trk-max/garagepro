"use client";

import { useEffect } from "react";

/** Registers the service worker (production builds only: in dev it would cache stale code). */
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      /* not a secure origin (http on the LAN), or blocked: the site still works normally */
    });
  }, []);
  return null;
}

/** Forget the private page copies (called on sign-out). */
export function clearPrivateCache() {
  if (typeof navigator !== "undefined" && navigator.serviceWorker?.controller) {
    navigator.serviceWorker.controller.postMessage("clear-private");
  }
}
