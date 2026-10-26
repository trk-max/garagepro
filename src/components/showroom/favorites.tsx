"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { Heart } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { useAppBase } from "@/lib/app-base";

/**
 * Favourites of a visitor, kept ONLY in this browser (localStorage, no account): a list of
 * listing numbers. Storage can be missing or refused (private mode…): everything still works,
 * favourites are simply not remembered.
 */
const KEY = "gp_showroom_favs";
const EVENT = "gp-favs";

function read(): number[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((n): n is number => Number.isSafeInteger(n) && n > 0).slice(0, 50) : [];
  } catch {
    return [];
  }
}

function write(list: number[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list.slice(0, 50)));
  } catch {
    // Storage refused: nothing to do, the button simply does not remember.
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

/** Serialised list (a stable string, so React does not re-render for nothing). */
function useFavs(): number[] {
  const snapshot = useSyncExternalStore(
    subscribe,
    () => read().join(","),
    () => "",
  );
  return snapshot ? snapshot.split(",").map(Number) : [];
}

export function FavoriteButton({ number, className }: { number: number; className?: string }) {
  const { t } = useI18n();
  const favs = useFavs();
  const on = favs.includes(number);
  const label = on ? t.showroom.public.favRemove : t.showroom.public.favAdd;
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={label}
      title={label}
      onClick={() => write(on ? favs.filter((n) => n !== number) : [...favs, number])}
      className={cn(
        "grid size-10 place-items-center bg-black/60 text-white transition-colors hover:text-brand-500 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none",
        className,
      )}
    >
      <Heart className={cn("size-4", on && "fill-brand-500 text-brand-500")} aria-hidden />
    </button>
  );
}

/** "Mes favoris (3)" → /showroom?ids=… ; shows a hint when there are none. */
export function FavoritesLink({ active }: { active: boolean }) {
  const { t } = useI18n();
  const base = useAppBase();
  const favs = useFavs();
  const p = t.showroom.public;
  if (active) {
    return (
      <Link href={`${base}/showroom`} className="f-label inline-flex min-h-10 items-center border border-border px-3 hover:border-foreground">
        {p.allVehicles}
      </Link>
    );
  }
  return (
    <Link
      href={favs.length ? `${base}/showroom?ids=${favs.join(",")}` : `${base}/showroom`}
      aria-disabled={!favs.length}
      title={favs.length ? p.favHint : p.favNone}
      className={cn("f-label inline-flex min-h-10 items-center gap-2 border border-border px-3 hover:border-foreground", !favs.length && "pointer-events-none opacity-60")}
    >
      <Heart className="size-3.5" aria-hidden />
      {p.favorites}
      {favs.length > 0 && <span className="bg-brand-500 px-1.5 text-white">{favs.length}</span>}
    </Link>
  );
}
