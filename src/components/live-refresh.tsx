"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/** How often a visible page checks for changes. Hidden tabs do not poll at all. */
const POLL_MS = 4000;

/**
 * Keeps the page up to date: while the tab is visible, asks `url` for a
 * version every few seconds (one short request, nothing kept open, so buttons
 * are never stuck behind it) and re-renders the page when it changes
 * (router.refresh keeps scroll position and form inputs). Shows a "Live" pill.
 */
export function LiveRefresh({
  url,
  liveLabel,
  reconnectingLabel,
  onGone,
  className,
  tone = "light",
}: {
  url: string;
  liveLabel: string;
  reconnectingLabel: string;
  onGone?: string;
  className?: string;
  tone?: "light" | "dark";
}) {
  const router = useRouter();
  const [connected, setConnected] = useState(false);
  const last = useRef<string | null>(null);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let controller: AbortController | null = null;
    last.current = null;

    const schedule = () => {
      if (timer) clearTimeout(timer);
      if (!stopped && document.visibilityState === "visible") timer = setTimeout(check, POLL_MS);
    };

    async function check() {
      if (stopped || document.visibilityState !== "visible") return;
      controller?.abort();
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 8000);
      try {
        const res = await fetch(url, { cache: "no-store", signal: controller.signal });
        if (res.status === 410 || res.status === 401) {
          stopped = true;
          if (onGone) window.location.href = onGone;
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        const { version } = (await res.json()) as { version: string };
        setConnected(true);
        if (last.current !== null && version !== last.current) router.refresh();
        last.current = version;
      } catch {
        if (!stopped) setConnected(false);
      } finally {
        clearTimeout(timeout);
        schedule();
      }
    }

    // Phones and browsers pause background tabs: check at once when visible again.
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
      else if (timer) clearTimeout(timer);
    };
    document.addEventListener("visibilitychange", onVisible);
    void check();

    return () => {
      stopped = true;
      controller?.abort();
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [url, router, onGone]);

  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        tone === "dark" ? "bg-white/10 text-white" : "bg-muted text-muted-foreground",
        className,
      )}
    >
      <span className="relative flex size-2">
        {connected && <span className="absolute inline-flex size-full animate-ping rounded-full motion-reduce:hidden bg-emerald-400 opacity-75" />}
        <span className={cn("relative inline-flex size-2 rounded-full", connected ? "bg-emerald-500" : "bg-amber-400")} />
      </span>
      {connected ? liveLabel : reconnectingLabel}
    </span>
  );
}
