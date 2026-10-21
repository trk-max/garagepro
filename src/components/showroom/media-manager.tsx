"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, FileText, ImagePlus, Loader2, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { listingMediaAction } from "@/actions/showroom";
import { ActionButton } from "@/components/action-form";
import { shrinkImage } from "@/components/garage/media-uploader";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

export type MediaItem = { id: string; kind: string; caption: string | null; isCover: boolean; isPublic: boolean };

/** Photos and PDF documents of a listing: upload, cover, order, public / internal, delete. */
export function ListingMediaManager({ listingId, items, canEdit }: { listingId: string; items: MediaItem[]; canEdit: boolean }) {
  const { t } = useI18n();
  const s = t.showroom.staff;
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const photos = items.filter((m) => m.kind === "PHOTO");
  const docs = items.filter((m) => m.kind === "DOCUMENT");

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        const blob = file.type === "application/pdf" ? file : await shrinkImage(file);
        const body = new FormData();
        body.set("file", blob, file.name);
        // A document is listed under its file name ("Rapport de contrôle.pdf" → "Rapport de contrôle").
        if (file.type === "application/pdf") body.set("caption", file.name.replace(/\.pdf$/i, ""));
        const res = await fetch(`/api/showroom/listings/${listingId}/media`, { method: "POST", body });
        if (!res.ok) {
          const msg = ((await res.json().catch(() => null)) as { message?: string } | null)?.message;
          toast.error(msg ?? t.errors.generic);
        }
      }
      router.refresh();
    } catch {
      toast.error(t.errors.generic);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  const tools = (m: MediaItem, i: number, list: MediaItem[]) =>
    canEdit && (
      <div className="flex flex-wrap gap-1">
        {m.kind === "PHOTO" && !m.isCover && (
          <ActionButton size="icon" variant="ghost" title={s.makeCover} aria-label={s.makeCover} action={listingMediaAction.bind(null, m.id, "cover")}>
            <Star className="size-4" />
          </ActionButton>
        )}
        <ActionButton
          size="icon"
          variant="ghost"
          title={m.isPublic ? s.hide : s.show}
          aria-label={m.isPublic ? s.hide : s.show}
          action={listingMediaAction.bind(null, m.id, m.isPublic ? "hide" : "show")}
        >
          {m.isPublic ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </ActionButton>
        {i > 0 && (
          <ActionButton size="icon" variant="ghost" title={s.up} aria-label={s.up} action={listingMediaAction.bind(null, m.id, "up")}>
            <ArrowUp className="size-4" />
          </ActionButton>
        )}
        {i < list.length - 1 && (
          <ActionButton size="icon" variant="ghost" title={s.down} aria-label={s.down} action={listingMediaAction.bind(null, m.id, "down")}>
            <ArrowDown className="size-4" />
          </ActionButton>
        )}
        <ActionButton size="icon" variant="ghost" title={s.remove} aria-label={s.remove} confirm={s.removeConfirm} action={listingMediaAction.bind(null, m.id, "remove")}>
          <Trash2 className="size-4 text-brand-500" />
        </ActionButton>
      </div>
    );

  return (
    <div className="space-y-4">
      {canEdit && (
        <label className={cn("flex min-h-12 cursor-pointer items-center justify-center gap-2 border border-dashed px-3 text-sm hover:border-foreground", busy && "pointer-events-none opacity-60")}>
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ImagePlus className="size-4" aria-hidden />}
          {busy ? s.uploading : s.upload}
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            multiple
            className="sr-only"
            onChange={(e) => void upload(e.target.files)}
          />
        </label>
      )}

      <section>
        <h3 className="f-label mb-2 text-muted-foreground">
          {s.photos} ({photos.length})
        </h3>
        {photos.length === 0 ? (
          <p className="text-sm text-muted-foreground">{s.noFiles}</p>
        ) : (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {photos.map((m, i) => (
              <li key={m.id} className={cn("border", m.isCover && "border-brand-500")}>
                {/* eslint-disable-next-line @next/next/no-img-element -- private file streamed after an access check */}
                <img src={`/api/showroom/media/${m.id}`} alt={m.caption ?? ""} loading="lazy" className={cn("aspect-[4/3] w-full object-cover", !m.isPublic && "opacity-50")} />
                <div className="flex flex-wrap items-center justify-between gap-1 p-1">
                  <span className="f-label px-1 text-[0.625rem] text-muted-foreground">{m.isCover ? s.cover : m.isPublic ? s.visible : s.internal}</span>
                  {tools(m, i, photos)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="f-label mb-2 text-muted-foreground">
          {s.documents} ({docs.length})
        </h3>
        <p className="mb-2 text-xs text-muted-foreground">{s.docsHint}</p>
        {docs.length > 0 && (
          <ul className="divide-y border">
            {docs.map((m, i) => (
              <li key={m.id} className="flex flex-wrap items-center gap-2 p-2">
                <FileText className="size-4 shrink-0" aria-hidden />
                <a href={`/api/showroom/media/${m.id}`} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-sm underline-offset-4 hover:underline">
                  {m.caption || `PDF ${i + 1}`}
                </a>
                <span className="f-label text-[0.625rem] text-muted-foreground">{m.isPublic ? s.visible : s.internal}</span>
                {tools(m, i, docs)}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
