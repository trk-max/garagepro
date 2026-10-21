"use client";

import { useState } from "react";
import { CarFront, ChevronLeft, ChevronRight } from "lucide-react";
import { fmt } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

/** Large photo with previous / next (buttons, arrow keys) and a row of thumbnails. */
export function ListingGallery({ photos, title, sold = false }: { photos: { id: string; caption: string | null }[]; title: string; sold?: boolean }) {
  const { t } = useI18n();
  const p = t.showroom.public;
  const [i, setI] = useState(0);
  const n = photos.length;
  if (n === 0) {
    return (
      <div className="grid aspect-[4/3] place-items-center border border-border bg-muted text-muted-foreground">
        <span className="flex flex-col items-center gap-2 text-sm">
          <CarFront className="size-12" strokeWidth={1} aria-hidden />
          {p.noPhoto}
        </span>
      </div>
    );
  }
  const go = (d: number) => setI((x) => (x + d + n) % n);
  const current = photos[i]!;

  return (
    <div className="space-y-2">
      <div
        className="relative aspect-[4/3] overflow-hidden bg-black outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        tabIndex={0}
        role="group"
        aria-roledescription="carousel"
        aria-label={title}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") go(document.dir === "rtl" ? -1 : 1);
          if (e.key === "ArrowLeft") go(document.dir === "rtl" ? 1 : -1);
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- files are streamed by /api/showroom/media after a check */}
        <img
          src={`/api/showroom/media/${current.id}`}
          alt={current.caption || fmt(p.photoOf, { i: i + 1, n })}
          className={cn("size-full object-contain", sold && "grayscale")}
        />
        {n > 1 && (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label={p.previous}
              className="absolute inset-y-0 start-0 grid w-12 place-items-center bg-gradient-to-r from-black/50 to-transparent text-white hover:text-brand-500 rtl:bg-gradient-to-l"
            >
              <ChevronLeft className="size-7 rtl:rotate-180" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label={p.following}
              className="absolute inset-y-0 end-0 grid w-12 place-items-center bg-gradient-to-l from-black/50 to-transparent text-white hover:text-brand-500 rtl:bg-gradient-to-r"
            >
              <ChevronRight className="size-7 rtl:rotate-180" aria-hidden />
            </button>
            <span className="f-label absolute end-3 bottom-3 bg-black/70 px-2 py-1 text-[0.625rem] text-white" aria-live="polite">
              {i + 1} / {n}
            </span>
          </>
        )}
      </div>
      {n > 1 && (
        <ul className="scroll-row flex gap-2 overflow-x-auto pb-1">
          {photos.map((ph, j) => (
            <li key={ph.id} className="shrink-0">
              <button
                type="button"
                onClick={() => setI(j)}
                aria-label={fmt(p.photoOf, { i: j + 1, n })}
                aria-current={j === i ? "true" : undefined}
                className={cn("block h-16 w-24 overflow-hidden border-2", j === i ? "border-brand-500" : "border-transparent opacity-70 hover:opacity-100")}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- files are streamed by /api/showroom/media after a check */}
                <img src={`/api/showroom/media/${ph.id}`} alt="" loading="lazy" className="size-full object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
