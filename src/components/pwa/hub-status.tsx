"use client";

import { useEffect, useState } from "react";
import { CloudOff, RefreshCw, Server } from "lucide-react";
import { fmt, formatDateTime } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";

type Status = { hub: true; online: boolean; lastSyncAt: string | null; pending: number; errors: number };

/**
 * Garage hub badge (garage PC only; renders nothing online): internet on/off,
 * changes waiting to be sent, last synchronisation. Refreshed every 15 s.
 */
export function HubStatus() {
  const { t, lang } = useI18n();
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const res = await fetch("/api/hub/status", { cache: "no-store" });
        if (res.status === 404) {
          stop = true; // not a hub: stop asking
          return;
        }
        if (res.ok) setStatus(await res.json());
      } catch {
        /* the hub itself is unreachable: keep the last value */
      }
    };
    void load();
    const id = setInterval(() => !stop && void load(), 15_000);
    return () => clearInterval(id);
  }, []);

  if (!status) return null;
  const p = t.pwa;
  return (
    <div className="space-y-1 rounded-2xl border border-gp-line bg-gp-panel p-3 text-[11px] leading-snug" role="status">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-gp-ink">
        <Server className="size-3.5" aria-hidden /> {p.hub}
      </p>
      {status.online ? (
        <p className="flex items-center gap-1.5 text-gp-success-ink">
          <RefreshCw className="size-3.5" aria-hidden /> {status.pending > 0 ? fmt(p.hubPending, { n: status.pending }) : p.hubSynced}
        </p>
      ) : (
        <p className="flex items-center gap-1.5 text-gp-accent-ink">
          <CloudOff className="size-3.5" aria-hidden /> {p.hubOffline}
          {status.pending > 0 && ` · ${fmt(p.hubPending, { n: status.pending })}`}
        </p>
      )}
      {status.lastSyncAt && <p className="text-gp-muted">{fmt(p.hubLastSync, { time: formatDateTime(status.lastSyncAt, lang) })}</p>}
    </div>
  );
}
