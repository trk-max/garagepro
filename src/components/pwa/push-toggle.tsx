"use client";

import { useEffect, useState } from "react";
import { BellRing, BellOff } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

type State = "loading" | "off" | "on" | "denied" | "unsupported" | "disabled";

const toKey = (b64: string) => {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

/**
 * « Activer les notifications » (team app): asks the phone's permission ONLY on tap, then registers this phone
 * with the service worker's push subscription. iPhone: only inside the installed team app (iOS 16.4+), a short
 * hint otherwise. Hidden when the server has no VAPID keys.
 */
export function PushToggle({ className }: { className?: string }) {
  const { t } = useI18n();
  const p = t.staffMobile.push;
  const [state, setState] = useState<State>("loading");
  const [key, setKey] = useState<string | null>(null);

  useEffect(() => {
    let off = false;
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setState("unsupported");
      const r = await fetch("/api/staff/push", { cache: "no-store" }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
      if (off) return;
      if (!r?.publicKey) return setState("disabled");
      setKey(r.publicKey);
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })().catch(() => setState("unsupported"));
    return () => {
      off = true;
    };
  }, []);

  if (state === "loading" || state === "disabled") return null;
  if (state === "unsupported" || state === "denied")
    return <p className={cn("text-xs text-gp-muted", className)}>{state === "denied" ? p.denied : p.unsupported}</p>;

  const enable = async () => {
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return setState(perm === "denied" ? "denied" : "off");
      const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js", { scope: "/" }));
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(key!) }));
      const res = await fetch("/api/staff/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscription: sub.toJSON() }) });
      setState(res.ok ? "on" : "off");
    } catch {
      setState("unsupported");
    }
  };

  return (
    <button
      type="button"
      onClick={state === "off" ? enable : undefined}
      aria-pressed={state === "on"}
      disabled={state === "on"}
      className={cn(
        "inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-medium",
        state === "on" ? "bg-gp-success-bg text-gp-success-ink" : "bg-gp-accent text-white hover:opacity-90",
        className,
      )}
      data-testid="push-toggle"
    >
      {state === "on" ? <BellRing className="size-4" aria-hidden /> : <BellOff className="size-4" aria-hidden />}
      {state === "on" ? p.enabled : p.enable}
    </button>
  );
}
