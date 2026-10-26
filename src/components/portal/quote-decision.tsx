"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { QuoteLineChoices, type ChoiceLine } from "@/components/garage/quote-line-choices";
import { computeTotals, fmt, formatMoney } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";

type Result = { ok: true; data: { redirectTo?: string; warning?: string; message?: string } | null | undefined } | { ok: false; error: string };

/**
 * V16 Lot 2 — the customer decides on the quote, line by line, on the portal (phone-friendly: big buttons,
 * live total). The name typed, IP and browser are kept with the decision (server side).
 */
export function PortalQuoteDecision({
  action,
  quoteId,
  lines,
  stampDuty,
  defaultName,
}: {
  action: (form: FormData) => Promise<Result>;
  quoteId: string;
  lines: ChoiceLine[];
  stampDuty: number;
  defaultName: string;
}) {
  const { t, lang } = useI18n();
  const p = t.v16.portalQuote;
  const router = useRouter();
  const [pending, start] = useTransition();
  const [summary, setSummary] = useState({ count: lines.length, total: computeTotals(lines, stampDuty).totalTtc });

  return (
    <form
      className="mt-4 grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        if (!window.confirm(fmt(p.confirm, { count: summary.count, amount: formatMoney(summary.total, lang) }))) return;
        start(async () => {
          const r = await action(form);
          if (!r.ok) {
            toast.error(r.error);
            return;
          }
          toast.success(r.data?.message ?? p.done);
          router.refresh();
        });
      }}
    >
      <input type="hidden" name="quoteId" value={quoteId} />
      <QuoteLineChoices lines={lines} stampDuty={stampDuty} labels={{ accept: p.accept, refuse: p.refuse, total: p.total }} onTotal={(count, total) => setSummary({ count, total })} />
      <label className="grid gap-1.5 text-sm font-medium">
        {p.name}
        <input name="approverName" required minLength={2} maxLength={120} defaultValue={defaultName} autoComplete="name" className="h-11 rounded-[14px] border border-gp-line bg-gp-card px-3 text-base" />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="phone-pill h-12 text-base"
      >
        <CheckCircle2 className="size-5" aria-hidden /> {p.submit}
      </button>
    </form>
  );
}
