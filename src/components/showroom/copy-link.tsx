"use client";

import { Copy } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n/client";

/** Copies the address of the current page (the buyer's private link). */
export function CopyLinkButton() {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(window.location.href);
          toast.success(t.showroom.messages.copied);
        } catch {
          toast.error(t.errors.generic);
        }
      }}
      className="f-label inline-flex min-h-10 items-center gap-2 border border-border px-3 hover:border-foreground"
    >
      <Copy className="size-3.5" aria-hidden />
      {t.showroom.messages.copyLink}
    </button>
  );
}
