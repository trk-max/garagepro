"use client";

import { Maximize, Volume2, WifiOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Dictionary } from "@/lib/i18n/fr";
import { cn } from "@/lib/utils";

type V15 = Dictionary["v15"];
type SLang = "fr" | "ar";
type Pair = { fr: string; ar: string };
type State = {
  garage: string;
  now: string;
  calls: { key: string; label: string; status: "CALLED" | "SERVING"; counter: Pair; reason: Pair; plate: string | null; calledAt: string }[];
  waiting: { label: string; reason: Pair; group: "MANUAL" | "APPOINTMENT" | "FAST" | "ARRIVAL" }[];
  waitingCount: number;
  waits: { reasonId: string; name: Pair; minutes: number | null }[];
  langMode: "ALTERNATE" | "SIDE";
  theme: "DARK" | "LIGHT";
};

const POLL_MS = 3000;
const ALTERNATE_MS = 8000;
const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));

/**
 * V15 — waiting-room TV (full screen, no account; device token in an http-only cookie).
 * Asks the garage server every 3 s (same short-poll principle as the app's live pages: nothing kept
 * open, automatic reconnection), plays the call sound for each NEW call (after « Activer le son »:
 * browsers block sound until a click), French and Arabic alternated or side by side.
 */
export function WaitingScreen({ dict, initial, logo, timeZone }: { dict: Record<SLang, V15>; initial: State; logo: string | null; timeZone: string }) {
  const [state, setState] = useState<State>(initial);
  const [online, setOnline] = useState(true);
  const [lang, setLang] = useState<SLang>("fr");
  const [clock, setClock] = useState(() => new Date());
  const [sound, setSound] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const seen = useRef(new Set(initial.calls.map((c) => c.key)));
  const audio = useRef<HTMLAudioElement | null>(null);
  const soundOn = useRef(false);

  useEffect(() => {
    audio.current = new Audio("/sounds/accueil-appel.wav");
    audio.current.preload = "auto";
  }, []);

  // Polling with automatic reconnection.
  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = async () => {
      try {
        const res = await fetch("/api/accueil/ecran", { cache: "no-store" });
        if (res.status === 401) {
          window.location.reload(); // device revoked → "device not authorised"
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        const next = (await res.json()) as State;
        const fresh = next.calls.filter((c) => c.status === "CALLED" && !seen.current.has(c.key));
        for (const c of next.calls) seen.current.add(c.key);
        if (fresh.length) {
          setFlash(fresh[0]!.key);
          if (soundOn.current && audio.current) {
            audio.current.currentTime = 0;
            void audio.current.play().catch(() => undefined);
          }
          setTimeout(() => setFlash(null), 6000);
        }
        setState(next);
        setOnline(true);
      } catch {
        setOnline(false);
      } finally {
        if (!stop) timer = setTimeout(tick, POLL_MS);
      }
    };
    timer = setTimeout(tick, POLL_MS);
    return () => {
      stop = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const c = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(c);
  }, []);

  useEffect(() => {
    if (state.langMode !== "ALTERNATE") return;
    const a = setInterval(() => setLang((l) => (l === "fr" ? "ar" : "fr")), ALTERNATE_MS);
    return () => clearInterval(a);
  }, [state.langMode]);

  const dark = state.theme === "DARK";
  const time = new Intl.DateTimeFormat("fr-FR", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(clock);
  const called = state.calls.filter((c) => c.status === "CALLED");
  const serving = state.calls.filter((c) => c.status === "SERVING");
  const langs: SLang[] = state.langMode === "SIDE" ? ["fr", "ar"] : [lang];

  const label = (k: (d: V15) => string) =>
    langs.map((l) => (
      <span key={l} lang={l} dir={l === "ar" ? "rtl" : "ltr"} className="block">
        {k(dict[l])}
      </span>
    ));

  return (
    <main
      className={cn("flex h-dvh flex-col overflow-hidden", dark ? "bg-neutral-950 text-white" : "bg-neutral-50 text-neutral-950")}
      data-testid="waiting-screen"
      data-theme={dark ? "dark" : "light"}
    >
      <header className={cn("flex items-center gap-6 px-[3vw] py-[1.5vh]", dark ? "bg-white/5" : "bg-white shadow-sm")}>
        {/* eslint-disable-next-line @next/next/no-img-element -- garage logo stored as a data URL (Paramètres) */}
        {logo ? <img src={logo} alt="" className="h-[6vh] w-auto rounded bg-white p-1" /> : null}
        <p className="text-[3vh] font-semibold">{state.garage}</p>
        {!online && (
          <span className="flex items-center gap-2 rounded-full bg-amber-500/20 px-4 py-1 text-[2vh] text-amber-500" role="status">
            <WifiOff className="size-[2.5vh]" aria-hidden /> {dict.fr.screen.offline} · {dict.ar.screen.offline}
          </span>
        )}
        <div className="ms-auto flex items-center gap-3">
          {!sound && (
            <button
              type="button"
              onClick={() => {
                soundOn.current = true;
                setSound(true);
                void audio.current?.play().catch(() => undefined);
              }}
              className="flex items-center gap-2 rounded-full bg-orange-500 px-5 py-2 text-[2vh] font-semibold text-white"
              title={dict.fr.screen.soundHint}
              data-testid="sound-on"
            >
              <Volume2 className="size-[2.5vh]" aria-hidden /> {dict.fr.screen.soundOn} · {dict.ar.screen.soundOn}
            </button>
          )}
          <button type="button" aria-label={dict.fr.screen.fullscreen} onClick={() => void document.documentElement.requestFullscreen?.().catch(() => undefined)} className={cn("grid size-[5vh] place-items-center rounded-full", dark ? "bg-white/10" : "bg-neutral-200")}>
            <Maximize className="size-[2.5vh]" aria-hidden />
          </button>
          <time className="font-mono text-[4.5vh] font-bold tabular-nums">{time}</time>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[1.6fr_1fr] gap-[2vw] p-[2vw]">
        {/* Calls in very large type */}
        <section className="flex min-h-0 flex-col">
          <h1 className="mb-[1.5vh] text-[3.2vh] font-semibold uppercase tracking-wide opacity-70">{label((d) => d.screen.calling)}</h1>
          {called.length === 0 ? (
            <p className="grid flex-1 place-items-center text-center text-[4vh] opacity-50">{label((d) => d.screen.noCall)}</p>
          ) : (
            <ul className="flex min-h-0 flex-1 flex-col gap-[1.5vh]">
              {called.slice(0, 4).map((c, i) => (
                <li
                  key={c.key}
                  data-testid="call"
                  className={cn(
                    "flex items-center gap-[2vw] rounded-[2vh] px-[2vw] py-[1.5vh] transition-colors",
                    i === 0 ? "flex-[1.6] bg-orange-500 text-white" : dark ? "flex-1 bg-white/10" : "flex-1 bg-white shadow",
                    flash === c.key && "animate-pulse",
                  )}
                >
                  <span className={cn("font-mono font-black tabular-nums leading-none", i === 0 ? "text-[16vh]" : "text-[8vh]")} dir="ltr">
                    {c.label}
                  </span>
                  <span className="ms-auto text-end">
                    <span className={cn("block font-semibold", i === 0 ? "text-[6vh]" : "text-[3.5vh]")}>
                      {langs.map((l) => (
                        <span key={l} lang={l} dir={l === "ar" ? "rtl" : "ltr"} className="block">
                          {"→ "}
                          {c.counter[l]}
                        </span>
                      ))}
                    </span>
                    <span className={cn("block opacity-80", i === 0 ? "text-[3vh]" : "text-[2.2vh]")}>
                      {langs.map((l) => c.reason[l]).join(" · ")}
                      {c.plate && (
                        <span className="ms-3 font-mono" dir="ltr">
                          {c.plate}
                        </span>
                      )}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {serving.length > 0 && (
            <p className="mt-[1.5vh] flex flex-wrap gap-[1vw] text-[2.4vh] opacity-60" dir="ltr">
              {serving.map((s) => (
                <span key={s.key} className="font-mono">
                  {s.label} → {s.counter.fr}
                </span>
              ))}
            </p>
          )}
        </section>

        {/* Waiting list and estimated waits */}
        <section className={cn("flex min-h-0 flex-col rounded-[2vh] p-[1.5vw]", dark ? "bg-white/5" : "bg-white shadow")}>
          <h2 className="text-[3vh] font-semibold">
            {label((d) => fill(d.screen.waitingCount, { n: state.waitingCount }))}
          </h2>
          <ol className="mt-[1.5vh] grid min-h-0 flex-1 auto-rows-min grid-cols-2 gap-[1vh] overflow-hidden" data-testid="waiting">
            {state.waiting.map((w) => (
              <li key={w.label} className={cn("flex items-center gap-[1vw] rounded-[1.2vh] px-[1vw] py-[0.8vh]", dark ? "bg-white/10" : "bg-neutral-100")}>
                <span className="font-mono text-[3.6vh] font-bold" dir="ltr">
                  {w.label}
                </span>
                {w.group !== "ARRIVAL" && <span className="rounded-full bg-orange-500/80 px-2 text-[1.6vh] text-white">{langs.map((l) => dict[l].group[w.group]).join(" · ")}</span>}
              </li>
            ))}
          </ol>
          <h2 className="mt-[2vh] text-[2.6vh] font-semibold">
            {label((d) => `${d.screen.estimated} (${d.estimated})`)}
          </h2>
          <ul className="mt-[1vh] space-y-[0.6vh] text-[2.4vh]" data-testid="waits">
            {state.waits.map((w) => (
              <li key={w.reasonId} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate">{langs.map((l) => w.name[l]).join(" · ")}</span>
                <span className="font-mono font-semibold tabular-nums" dir="ltr">
                  {w.minutes === null ? "—" : `${w.minutes} min`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
