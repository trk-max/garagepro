"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Subscribes to a Server-Sent Events URL and re-renders the current page
 * (router.refresh keeps scroll position and form inputs) whenever the server
 * reports a change. Shows a small "Live" pill.
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
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const source = new EventSource(url);
    const refresh = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 250);
    };
    source.addEventListener("ready", () => setConnected(true));
    source.addEventListener("update", () => {
      setConnected(true);
      refresh();
    });
    source.addEventListener("gone", () => {
      source.close();
      if (onGone) window.location.href = onGone;
    });
    source.onerror = () => setConnected(false); // EventSource retries on its own

    // Phones pause background tabs: refresh once when the page becomes visible again.
    const onVisible = () => document.visibilityState === "visible" && router.refresh();
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      source.close();
      document.removeEventListener("visibilitychange", onVisible);
      if (timer.current) clearTimeout(timer.current);
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
