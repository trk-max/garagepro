"use client";

import { useState } from "react";
import { Check, Copy, KeyRound, MessageCircle, RefreshCw, Send } from "lucide-react";
import { regeneratePinAction, sendTrackingAction } from "@/actions/workshop";
import { ActionButton } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/client";

/** Work-order side card: the customer's 4-digit code, link, and one-tap sharing. */
export function TrackingCard({
  workOrderId,
  pin,
  link,
  shareText,
  phone,
}: {
  workOrderId: string;
  pin: string | null;
  link: string;
  shareText: string;
  phone: string;
}) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  let wa = phone.replace(/\D/g, "").replace(/^00/, "");
  if (wa.length === 8) wa = `216${wa}`;

  return (
    <section className="rounded-lg border border-brand-500/30 bg-brand-500/5 p-4">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <KeyRound className="size-4 text-brand-400" aria-hidden /> {t.tracking.title}
      </h2>
      {pin ? (
        <>
          <p className="text-xs text-muted-foreground">{t.tracking.pin}</p>
          <p className="font-mono text-3xl font-bold tracking-[0.4em]" dir="ltr">
            {pin}
          </p>
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(shareText);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="mt-2 flex w-full items-center gap-1.5 truncate rounded-md bg-background px-2 py-1.5 text-start font-mono text-xs text-muted-foreground hover:text-foreground"
            title={t.tracking.link}
            dir="ltr"
          >
            {copied ? <Check className="size-3.5 shrink-0 text-emerald-700 dark:text-emerald-400" /> : <Copy className="size-3.5 shrink-0" />}
            <span className="truncate">{link}</span>
          </button>
          <div className="mt-3 grid gap-2">
            <Button asChild size="sm" className="bg-emerald-600 hover:bg-emerald-700">
              <a href={`https://wa.me/${wa}?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noopener">
                <MessageCircle className="size-4" aria-hidden /> {t.tracking.share}
              </a>
            </Button>
            <div className="flex gap-2">
              <ActionButton size="sm" variant="outline" className="flex-1" action={sendTrackingAction.bind(null, workOrderId)} successMessage="SMS / e-mail ✓">
                <Send className="size-3.5" aria-hidden /> SMS / e-mail
              </ActionButton>
              <ActionButton size="sm" variant="ghost" confirm={t.tracking.regenerateConfirm} action={regeneratePinAction.bind(null, workOrderId)} aria-label={t.tracking.regenerate}>
                <RefreshCw className="size-3.5" aria-hidden />
              </ActionButton>
            </div>
          </div>
        </>
      ) : (
        <>
          <p className="mb-3 text-sm text-muted-foreground">{t.tracking.none}</p>
          <ActionButton size="sm" action={regeneratePinAction.bind(null, workOrderId)}>
            <KeyRound className="size-4" aria-hidden /> {t.tracking.generate}
          </ActionButton>
        </>
      )}
    </section>
  );
}
