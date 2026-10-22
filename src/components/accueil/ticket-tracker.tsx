"use client";

import { useEffect, useState } from "react";
import type { Lang } from "@/lib/format";
import type { Dictionary } from "@/lib/i18n/fr";

type State = {
  label: string;
  status: "WAITING" | "CALLED" | "SERVING" | "DONE" | "ABSENT" | "CANCELLED";
  reason: { fr: string; ar: string; en: string };
  ahead: number | null;
  counter: { fr: string; ar: string } | null;
  waitMinutes: number | null;
  garage: string;
};

const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));

/** V15 — public tracking of one ticket (refreshed every 10 s): number, status, people before, counter. */
export function TicketTracker({ v, lang, dir, token, initial }: { v: Dictionary["v15"]; lang: Lang; dir: "ltr" | "rtl"; token: string; initial: State }) {
  const [s, setS] = useState(initial);
  useEffect(() => {
    if (s.status === "DONE" || s.status === "CANCELLED") return;
    const id = setInterval(async () => {
      try {
        const res = await fetch(`/api/accueil/t/${token}`, { cache: "no-store" });
        if (res.ok) setS((await res.json()) as State);
      } catch {
        // offline: keep the last state, try again later
      }
    }, 10_000);
    return () => clearInterval(id);
  }, [token, s.status]);

  const counter = s.counter ? (lang === "ar" ? s.counter.ar : s.counter.fr) : null;
  return (
    <main dir={dir} className="grid min-h-dvh place-items-center bg-neutral-50 p-6 text-neutral-950 dark:bg-neutral-950 dark:text-white" data-testid="ticket-tracker">
      <div className="w-full max-w-sm rounded-3xl bg-white p-8 text-center shadow-lg dark:bg-neutral-900">
        <p className="text-sm text-neutral-500">{s.garage}</p>
        <h1 className="mt-1 text-lg font-semibold">{v.track.title}</h1>
        <p className="my-4 font-mono text-7xl font-black text-orange-500" dir="ltr">
          {s.label}
        </p>
        <p className="font-medium">{s.reason[lang]}</p>
        <p className="mt-4 inline-block rounded-full bg-neutral-100 px-4 py-1 text-sm dark:bg-neutral-800">{v.status[s.status]}</p>
        {s.status === "WAITING" && (
          <>
            <p className="mt-4 text-xl font-semibold">{s.ahead === 0 ? v.track.first : s.ahead !== null ? fill(v.track.ahead, { n: s.ahead }) : ""}</p>
            <p className="mt-1 text-sm text-neutral-500">
              {s.waitMinutes === null ? v.kiosk.waitUnknown : fill(v.track.wait, { n: s.waitMinutes })} ({v.estimated})
            </p>
          </>
        )}
        {(s.status === "CALLED" || s.status === "SERVING") && counter && <p className="mt-4 text-2xl font-bold text-orange-600">{fill(v.track.goTo, { counter })}</p>}
        {(s.status === "DONE" || s.status === "CANCELLED") && <p className="mt-4 text-neutral-500">{v.track.finished}</p>}
      </div>
    </main>
  );
}
