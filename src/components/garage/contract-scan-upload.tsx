"use client";

import { useRouter } from "next/navigation";
import { useRef, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/client";

/** Uploads the hand-signed scan to /api/contracts/:id/scan (checked again on the server). */
export function ContractScanUpload({ contractId, label }: { contractId: string; label: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const ref = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const file = ref.current?.files?.[0];
        if (!file) return;
        const body = new FormData();
        body.set("file", file);
        start(async () => {
          const res = await fetch(`/api/contracts/${contractId}/scan`, { method: "POST", body });
          if (!res.ok) {
            const j = (await res.json().catch(() => null)) as { message?: string } | null;
            toast.error(j?.message ?? t.errors.generic);
            return;
          }
          toast.success(t.ctr.scanDone);
          if (ref.current) ref.current.value = "";
          router.refresh();
        });
      }}
    >
      <input ref={ref} type="file" name="file" required accept="application/pdf,image/jpeg,image/png" className="max-w-full text-sm" disabled={pending} />
      <Button type="submit" size="sm" disabled={pending}>
        {label}
      </Button>
    </form>
  );
}
