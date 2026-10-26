"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { fmt } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";

type Item = { id: string; plate: string; vehicle: string };
const KEY = "gp-assigned-notified";
const EVERY_MS = 20_000;

/** Short two-tone chime (no file to download); silent when the browser blocks sound before a first tap. */
function chime() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [880, 1320].forEach((hz, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = hz;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.18);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + i * 0.18 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.18 + 0.16);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + i * 0.18);
      o.stop(ctx.currentTime + i * 0.18 + 0.2);
    });
    setTimeout(() => ctx.close().catch(() => {}), 800);
  } catch {
    /* no sound: the toast and the badge remain */
  }
}

/**
 * « Nouveau véhicule pour vous » (mechanics, every staff page while it is open): asks every 20 s (and when the
 * page comes back on screen) for the cars newly assigned to this person; a new one shows a toast with a link to
 * the phone order screen, plays a short chime and vibrates, and refreshes the page (the car appears at the top
 * of the team space). Each car alerts once per browser (localStorage); opening the car clears it on the server.
 */
export function AssignmentAlert() {
  const { t } = useI18n();
  const router = useRouter();
  const busy = useRef(false);
  useEffect(() => {
    let stop = false;
    const read = (): string[] => {
      try {
        return JSON.parse(localStorage.getItem(KEY) ?? "[]") as string[];
      } catch {
        return [];
      }
    };
    const check = async () => {
      if (busy.current || document.visibilityState !== "visible") return;
      busy.current = true;
      try {
        const res = await fetch("/api/staff/assignments", { cache: "no-store" });
        if (!res.ok || stop) return;
        const { items } = (await res.json()) as { items: Item[] };
        const seen = new Set(read());
        const fresh = items.filter((i) => !seen.has(i.id));
        if (fresh.length === 0) return;
        try {
          localStorage.setItem(KEY, JSON.stringify([...items.map((i) => i.id), ...seen].slice(0, 200)));
        } catch {
          /* private mode: may alert again on the next visit */
        }
        chime();
        navigator.vibrate?.([200, 100, 200]);
        for (const i of fresh) {
          toast(t.staffMobile.assigned.title, {
            description: fmt(t.staffMobile.assigned.body, { plate: i.plate, vehicle: i.vehicle }),
            duration: 15_000,
            action: { label: t.app.team.open, onClick: () => router.push(`/garage/app/ordre/${i.id}`) },
          });
        }
        router.refresh();
      } catch {
        /* offline: next try */
      } finally {
        busy.current = false;
      }
    };
    void check();
    const timer = setInterval(check, EVERY_MS);
    document.addEventListener("visibilitychange", check);
    return () => {
      stop = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, [router, t]);
  return null;
}
