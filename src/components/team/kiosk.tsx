"use client";

import { useEffect, useState } from "react";
import { fmt } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";

type Kiosk = { code: string; secondsLeft: number; qr: string };

/** Garage screen: big rotating code + QR code, refreshed when the code changes. */
export function ClockKiosk() {
  const { t } = useI18n();
  const c = t.v7.clock;
  const [data, setData] = useState<Kiosk | null>(null);
  const [left, setLeft] = useState(0);
  const [error, setError] = useState(false);

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const res = await fetch("/api/clock/kiosk", { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const k = (await res.json()) as Kiosk;
        if (stop) return;
        setData(k);
        setLeft(k.secondsLeft);
        setError(false);
        timer = setTimeout(load, k.secondsLeft * 1000 + 300);
      } catch {
        setError(true);
        timer = setTimeout(load, 5000);
      }
    };
    void load();
    const tick = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => {
      stop = true;
      clearTimeout(timer);
      clearInterval(tick);
    };
  }, []);

  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <p className="max-w-xl text-muted-foreground">{c.kioskIntro}</p>
      <div className="flex flex-col items-center gap-8 md:flex-row">
        <p className="font-mono text-7xl font-bold tracking-[0.2em] tabular-nums sm:text-8xl" dir="ltr" aria-live="polite">
          {data ? `${data.code.slice(0, 3)} ${data.code.slice(3)}` : "··· ···"}
        </p>
        {data && <div className="size-56 bg-white p-2" aria-hidden dangerouslySetInnerHTML={{ __html: data.qr }} />}
      </div>
      <div className="w-64">
        <div className="h-1.5 w-full bg-muted">
          <div className="h-full bg-brand-500 transition-[width] duration-1000 ease-linear" style={{ width: `${(left / 30) * 100}%` }} />
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{fmt(c.kioskRenews, { s: left })}</p>
      </div>
      {error && <p className="text-sm text-destructive">{t.errors.generic}</p>}
      <p className="max-w-xl text-xs text-muted-foreground">{c.kioskSecurity}</p>
    </div>
  );
}
