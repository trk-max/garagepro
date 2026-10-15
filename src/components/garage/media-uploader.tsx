"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

/** Phone photos are 3–8 MB; resize to 1920 px JPEG before upload (fast on 4G, plenty for the customer). */
async function shrinkImage(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/") || file.size < 1.5 * 1024 * 1024) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1920 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    return blob ?? file;
  } catch {
    return file; // e.g. HEIC on a browser that can't decode it: let the server decide
  }
}

/** Above this, a file goes straight to storage (Vercel refuses request bodies over 4.5 MB). */
const DIRECT_THRESHOLD = 4 * 1024 * 1024;

type UploadResult = { ok: true } | { ok: false; message?: string };

/** PUT with progress (fetch has no upload progress). */
function putWithProgress(url: string, blob: Blob, onProgress: (pct: number) => void): Promise<boolean> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", blob.type || "application/octet-stream");
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300);
    xhr.onerror = () => resolve(false);
    xhr.send(blob);
  });
}

const messageOf = async (res: Response) => ((await res.json().catch(() => null)) as { message?: string } | null)?.message;

/**
 * Big files (videos): ask for a one-time upload URL, send the file straight to
 * Supabase Storage, then let the server check and record it.
 * Returns null when direct upload is not available (local ./storage): use the normal route.
 */
async function uploadDirect(
  workOrderId: string,
  blob: Blob,
  meta: { caption: string; visible: boolean },
  onProgress: (pct: number) => void,
): Promise<UploadResult | null> {
  const start = await fetch(`/api/work-orders/${workOrderId}/media/upload-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ size: blob.size, contentType: blob.type }),
  });
  if (!start.ok) return { ok: false, message: await messageOf(start) };
  const plan = (await start.json()) as { direct: false } | { direct: true; storageKey: string; uploadUrl: string };
  if (!plan.direct) return null;

  if (!(await putWithProgress(plan.uploadUrl, blob, onProgress))) return { ok: false };
  const done = await fetch(`/api/work-orders/${workOrderId}/media/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ storageKey: plan.storageKey, caption: meta.caption, visible: meta.visible }),
  });
  return done.ok ? { ok: true } : { ok: false, message: await messageOf(done) };
}

export function MediaUploader({ workOrderId, compact = false }: { workOrderId: string; compact?: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [caption, setCaption] = useState("");
  const [visible, setVisible] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        const blob = await shrinkImage(file);
        let result: UploadResult | null = null;
        if (blob.size > DIRECT_THRESHOLD && blob.type) {
          result = await uploadDirect(workOrderId, blob, { caption, visible }, setProgress);
          setProgress(null);
        }
        if (result === null) {
          const body = new FormData();
          body.set("file", blob, file.name);
          body.set("caption", caption);
          body.set("visible", String(visible));
          const res = await fetch(`/api/work-orders/${workOrderId}/media`, { method: "POST", body });
          result = res.ok ? { ok: true } : { ok: false, message: await messageOf(res) };
        }
        if (!result.ok) toast.error(result.message ?? t.errors.generic);
      }
      setCaption("");
      router.refresh();
    } catch {
      toast.error(t.errors.generic);
    } finally {
      setBusy(false);
      setProgress(null);
      if (input.current) input.current.value = "";
    }
  }

  const picker = (
    <input
      ref={input}
      type="file"
      accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm,image/*,video/*"
      capture={compact ? "environment" : undefined}
      multiple={!compact}
      className="sr-only"
      onChange={(e) => void upload(e.target.files)}
    />
  );

  if (compact) {
    return (
      <>
        {picker}
        <Button type="button" variant="outline" className="h-12 flex-1" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Camera className="size-5" aria-hidden />} {busy && progress !== null ? `${progress} %` : t.workshop.photo}
        </Button>
      </>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed p-3">
      {picker}
      <Input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder={t.tracking.caption} aria-label={t.tracking.caption} maxLength={200} className="min-w-48 flex-1" />
      <label className="inline-flex items-center gap-1.5 text-sm">
        <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} className="size-5 accent-emerald-600" />
        {t.tracking.visible}
      </label>
      <Button type="button" disabled={busy} onClick={() => input.current?.click()} className={cn(busy && "opacity-80")}>
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Camera className="size-4" aria-hidden />}
        {busy ? `${t.tracking.uploading}${progress !== null ? ` ${progress} %` : ""}` : t.tracking.upload}
      </Button>
    </div>
  );
}
