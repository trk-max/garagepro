"use client";

import { useEffect, useRef, useState } from "react";
import { PlayCircle, X } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";

export type GalleryItem = { id: string; kind: "PHOTO" | "VIDEO"; caption: string | null; createdAt: string };

/** Photo/video grid with a full-screen viewer. Files come from /api/media/:id (access-checked). */
export function MediaGallery({ items, emptyLabel }: { items: GalleryItem[]; emptyLabel: string }) {
  const { lang, t } = useI18n();
  const [open, setOpen] = useState<GalleryItem | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);

  if (items.length === 0) return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;

  return (
    <>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => setOpen(item)}
              className="group relative block aspect-square w-full overflow-hidden rounded-md bg-muted focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
            >
              {item.kind === "PHOTO" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/media/${item.id}`} alt={item.caption ?? ""} loading="lazy" decoding="async" className="size-full object-cover transition group-hover:scale-105" />
              ) : (
                <>
                  <video src={`/api/media/${item.id}#t=0.5`} preload="metadata" muted playsInline className="size-full object-cover" />
                  <PlayCircle className="absolute inset-0 m-auto size-12 text-white drop-shadow-sm" aria-hidden />
                </>
              )}
              {item.caption && (
                <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent px-2 pt-6 pb-1.5 text-start text-xs text-white">
                  {item.caption}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>

      <dialog
        ref={dialog}
        onClose={() => setOpen(null)}
        onClick={(e) => e.target === dialog.current && setOpen(null)}
        className="m-auto max-h-[92dvh] w-[min(96vw,900px)] rounded-lg bg-black p-0 text-white backdrop:bg-black/80"
      >
        {open && (
          <figure>
            <button type="button" onClick={() => setOpen(null)} className="absolute end-2 top-2 z-10 grid size-11 place-items-center rounded-full bg-black/60 hover:bg-black/80 focus-visible:outline-2 focus-visible:outline-white" aria-label={t.common.close}>
              <X className="size-5" aria-hidden />
            </button>
            {open.kind === "PHOTO" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/media/${open.id}`} alt={open.caption ?? ""} className="max-h-[80dvh] w-full object-contain" />
            ) : (
              <video src={`/api/media/${open.id}`} controls autoPlay playsInline className="max-h-[80dvh] w-full" />
            )}
            <figcaption className="flex justify-between gap-2 px-4 py-3 text-sm">
              <span>{open.caption}</span>
              <time className="shrink-0 text-slate-300">{formatDateTime(open.createdAt, lang)}</time>
            </figcaption>
          </figure>
        )}
      </dialog>
    </>
  );
}
