"use client";

import { useRouter } from "next/navigation";
import { useRef, useTransition } from "react";
import { ClipboardCheck, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { QuoteLineChoices, type ChoiceLine } from "@/components/garage/quote-line-choices";
import { SignaturePad } from "@/components/garage/signature-pad";
import { useI18n } from "@/lib/i18n/client";

type Result = { ok: true; data: { redirectTo?: string; warning?: string; message?: string } | null | undefined } | { ok: false; error: string };

const CHANNELS = ["PHONE", "IN_PERSON", "SMS", "EMAIL", "WHATSAPP"] as const;

/**
 * V16 Lot 2 — the team records the customer's decision (phone, at the desk…): who decides, how to reach them,
 * the channel, each line accepted or refused, a note. Only shown to people with recordQuoteApproval (never a
 * mechanic by default); the server checks it again and stores an append-only QuoteApproval.
 */
export function QuoteDecisionDialog({
  action,
  quoteId,
  lines,
  stampDuty,
  defaultName,
  defaultContact,
}: {
  action: (form: FormData) => Promise<Result>;
  quoteId: string | null;
  lines: ChoiceLine[];
  stampDuty: number;
  defaultName: string;
  defaultContact: string;
}) {
  const { t } = useI18n();
  const q = t.v16.quote;
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <>
      <Button type="button" size="sm" aria-haspopup="dialog" onClick={() => ref.current?.showModal()} className="gap-1.5">
        <ClipboardCheck className="size-4" aria-hidden /> {q.record}
      </Button>
      <dialog
        ref={ref}
        aria-label={q.recordTitle}
        onClick={(e) => e.target === e.currentTarget && ref.current?.close()}
        className="gp-enter m-auto max-h-[calc(100dvh-2rem)] w-[min(36rem,calc(100vw-1.5rem))] rounded-[28px] border border-gp-line bg-gp-card p-0 text-gp-ink shadow-2xl backdrop:bg-black/40 backdrop:backdrop-blur-sm"
      >
        <div className="flex items-center gap-3 p-5 pb-3">
          <h2 className="flex-1 text-lg font-semibold tracking-tight">{q.recordTitle}</h2>
          <button type="button" onClick={() => ref.current?.close()} aria-label={t.common.close} className="grid size-10 place-items-center rounded-full bg-gp-panel hover:bg-gp-hover">
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <form
          className="grid gap-4 px-5 pb-5"
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            start(async () => {
              const r = await action(form);
              if (!r.ok) {
                toast.error(r.error);
                return;
              }
              toast.success(t.common.saved);
              ref.current?.close();
              router.refresh();
            });
          }}
        >
          <p className="text-sm text-gp-muted">{q.recordHint}</p>
          {quoteId && <input type="hidden" name="quoteId" value={quoteId} />}
          <QuoteLineChoices lines={lines} stampDuty={stampDuty} labels={{ accept: q.accept, refuse: q.refuse, total: q.totalAccepted }} />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm font-medium">
              {q.approverName}
              <input name="approverName" required minLength={2} maxLength={120} defaultValue={defaultName} className="h-11 rounded-[14px] border border-gp-line bg-gp-card px-3 text-sm" />
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              {q.approverContact}
              <input name="approverContact" maxLength={120} defaultValue={defaultContact} dir="ltr" className="h-11 rounded-[14px] border border-gp-line bg-gp-card px-3 text-sm" />
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              {q.channelLabel}
              <select name="channel" defaultValue="PHONE" className="h-11 rounded-[14px] border border-gp-line bg-gp-card px-3 text-sm">
                {CHANNELS.map((c) => (
                  <option key={c} value={c}>
                    {q.channel[c]}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              {q.note}
              <input name="note" maxLength={1000} className="h-11 rounded-[14px] border border-gp-line bg-gp-card px-3 text-sm" />
            </label>
          </div>
          {/* V16 Lot 4 — optional: the customer signs on the tablet (kept with the proof, QuoteApproval.signatureKey). */}
          <details className="rounded-[14px] border border-gp-line p-3">
            <summary className="cursor-pointer text-sm font-medium">{t.v16.lot4.signature.quoteOptional}</summary>
            <div className="mt-2">
              <SignaturePad />
            </div>
          </details>
          <div className="flex justify-end">
            <Button type="submit" disabled={pending}>
              {q.submit}
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
