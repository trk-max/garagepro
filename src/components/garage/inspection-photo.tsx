"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { shrinkImage } from "@/components/garage/media-uploader";
import { useI18n } from "@/lib/i18n/client";

type Result = { ok: true; data: unknown } | { ok: false; error: string };

/**
 * V16 Lot 5 — photo of an inspection point: reduced in the browser (well under Vercel's 4.5 MB), sent through the
 * order's existing upload route (putObject → WorkOrderMedia, copied by the hub's media sync), then tied to the point.
 */
export function InspectionPhoto({ workOrderId, label, attach }: { workOrderId: string; label: string; attach: (mediaId: string) => Promise<Result> }) {
  const { t } = useI18n();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function send(file: File) {
    setBusy(true);
    try {
      const blob = await shrinkImage(file);
      const body = new FormData();
      body.set("file", blob, file.name || "inspection.jpg");
      body.set("caption", label.slice(0, 200));
      body.set("visible", "true");
      body.set("stage", "WORK");
      const res = await fetch(`/api/work-orders/${workOrderId}/media`, { method: "POST", body });
      const json = (await res.json().catch(() => null)) as { id?: string; message?: string } | null;
      if (!res.ok || !json?.id) {
        toast.error(json?.message ?? t.tracking.badType);
        return;
      }
      const r = await attach(json.id);
      if (!r.ok) toast.error(r.error);
      else {
        toast.success(t.v16.lot5.inspection.photoSaved);
        router.refresh();
      }
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <label className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full border border-gp-line px-3 text-xs font-medium hover:bg-gp-hover">
      {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Camera className="size-3.5" aria-hidden />}
      {t.v16.lot5.inspection.addPhoto}
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        disabled={busy}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void send(f);
        }}
      />
    </label>
  );
}
