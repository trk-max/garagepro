"use client";

import { useEffect } from "react";
import { clearPrivateCache } from "@/components/pwa/pwa-register";

export const SIGN_OUT_FORM = "gp-sign-out";
const CHANNEL = "gp-staff-auth";
const STORAGE_KEY = "gp-staff-logout";
/** While the page is shown: ask the server every minute (and when the tab comes back) whether the session still holds. */
const CHECK_EVERY_MS = 60_000;
const MIN_GAP_MS = 10_000;

/** This tab is the one signing out: its own channel message must not cancel the form's page load. */
let leaving = false;
const goLogin = () => {
  if (!leaving) window.location.replace("/login");
};

/** Tell the other tabs of this browser (same account: same cookie) to leave now. */
function announceLogout() {
  try {
    const bc = new BroadcastChannel(CHANNEL);
    bc.postMessage("logout");
    bc.close();
  } catch {
    /* old browser: the storage event below */
  }
  try {
    localStorage.setItem(STORAGE_KEY, String(Date.now()));
  } catch {
    /* private mode */
  }
}

/**
 * « Déconnexion »: forgets the pages saved for offline use, warns the other tabs, then submits the hidden
 * NATIVE form (full page POST to /api/staff/logout → 303 → /login). Works even when the account menu has
 * already closed and unmounted, and whatever build of the app the page was loaded with.
 */
export function signOutNow() {
  leaving = true;
  clearPrivateCache();
  announceLogout();
  const form = document.getElementById(SIGN_OUT_FORM) as HTMLFormElement | null;
  if (form) form.submit();
  else window.location.assign("/login");
}

/**
 * One hidden sign-out form for the whole shell (a plain HTML form, no Server Action), plus the watcher that
 * sends this tab to /login when the account was signed out elsewhere: at once for the other tabs of this
 * browser (BroadcastChannel / storage event), and for other devices at the next page, at the next return to the
 * tab, or within a minute (GET /api/staff/session, 401 = signed out).
 */
export function SignOutForm() {
  useEffect(() => {
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel(CHANNEL);
      bc.onmessage = (e) => {
        if (e.data === "logout") goLogin();
      };
    } catch {
      bc = null;
    }
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) goLogin();
    };
    window.addEventListener("storage", onStorage);

    let last = Date.now();
    let busy = false;
    const check = async () => {
      if (busy || document.visibilityState !== "visible" || Date.now() - last < MIN_GAP_MS) return;
      busy = true;
      last = Date.now();
      try {
        const res = await fetch("/api/staff/session", { cache: "no-store", credentials: "same-origin" });
        if (res.status === 401) goLogin();
      } catch {
        /* offline or the hub restarting: try again later */
      } finally {
        busy = false;
      }
    };
    const timer = window.setInterval(check, CHECK_EVERY_MS);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      bc?.close();
      window.removeEventListener("storage", onStorage);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, []);

  return <form id={SIGN_OUT_FORM} method="post" action="/api/staff/logout" hidden />;
}
