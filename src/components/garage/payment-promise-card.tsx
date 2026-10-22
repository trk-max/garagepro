import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { recordPaymentPromiseAction } from "@/actions/payment-promises";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, Field, Textarea } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { fmt, formatDate, formatDateTime, formatMoney, type Lang } from "@/lib/format";
import type { Dictionary } from "@/lib/i18n/fr";
import { daysPast } from "@/lib/payment-promise";
import type { PromiseState } from "@/server/payment-promises";

type PromiseRow = { id: string; promisedAt: Date; amount: number | null; note: string | null; createdAt: Date; recordedBy: string | null };

/**
 * Paiements partiels — « Prochain paiement » of an invoice with money due: the latest promised date (red when
 * passed without a payment), the form to record a new one (recordPayment) and, on the invoice, the history (append-
 * only: a new date never erases the previous ones). Used on the invoice page and on the order page.
 */
export function PaymentPromiseCard({
  invoice,
  promises,
  state,
  canRecord,
  showHistory,
  today,
  todayStart,
  t,
  lang,
  tz,
}: {
  invoice: { id: string; number: string; workOrderId: string; balance: number };
  promises: PromiseRow[];
  state: PromiseState | null;
  canRecord: boolean;
  showHistory: boolean;
  today: string;
  todayStart: Date;
  t: Dictionary;
  lang: Lang;
  tz: string;
}) {
  const p = t.pay.promise;
  const latest = promises[0] ?? null;
  const overdue = state === "overdue" && !!latest;
  return (
    <Card id="promesse" className={`scroll-mt-24${overdue ? " border-gp-danger-ink/50" : ""}`} data-testid="promise-card">
      <CardTitle className="flex items-center gap-2">
        <CalendarClock className="size-4" aria-hidden /> {p.title}
      </CardTitle>
      {latest ? (
        <div className={`rounded-md px-3 py-2 text-sm ${overdue ? "bg-gp-danger-bg text-gp-danger-ink" : "bg-muted/50"}`} data-testid={overdue ? "promise-overdue" : "promise-current"}>
          {overdue ? (
            <>
              <p className="font-semibold">{p.overdue}</p>
              <p className="text-xs">{fmt(p.overdueSince, { date: formatDate(latest.promisedAt, lang, tz), days: daysPast(latest.promisedAt, todayStart) })}</p>
            </>
          ) : state === "kept" ? (
            <p className="text-xs">{p.kept}</p>
          ) : (
            <p className="font-medium">
              {formatDate(latest.promisedAt, lang, tz)} ·{" "}
              <span dir="ltr">{latest.amount ? formatMoney(latest.amount, lang) : p.rest}</span>
            </p>
          )}
          {latest.note && <p className="mt-1 text-xs opacity-80">{latest.note}</p>}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{p.none}</p>
      )}

      {canRecord ? (
        <ActionForm action={recordPaymentPromiseAction.bind(null, invoice.id, invoice.workOrderId)} className="mt-3 grid gap-3">
          <p className="text-xs text-muted-foreground">{p.hint}</p>
          <Field label={p.day}>
            <Input name="day" type="date" min={today} required dir="ltr" data-testid="promise-day" />
          </Field>
          <Field label={p.amount} hint={fmt(p.amountHint, { amount: formatMoney(invoice.balance, lang) })}>
            <Input name="amount" inputMode="decimal" dir="ltr" placeholder={(invoice.balance / 1000).toFixed(3)} data-testid="promise-amount" />
          </Field>
          <Field label={p.note}>
            <Textarea name="note" maxLength={300} rows={2} />
          </Field>
          <Button type="submit" className="min-h-11" data-testid="promise-submit">
            {p.submit}
          </Button>
        </ActionForm>
      ) : invoice.balance > 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">{p.noRight}</p>
      ) : null}

      {showHistory && promises.length > 0 && (
        <details className="mt-3" open={promises.length > 1}>
          <summary className="cursor-pointer text-sm font-medium">
            {p.history} ({promises.length})
          </summary>
          <ul className="mt-2 space-y-2 text-sm" data-testid="promise-history">
            {promises.map((r, i) => (
              <li key={r.id} className={`rounded-md bg-muted/50 px-3 py-2${i > 0 ? " opacity-75" : ""}`}>
                <div className="flex justify-between gap-2">
                  <span className="font-medium">{formatDate(r.promisedAt, lang, tz)}</span>
                  <span className="tabular-nums" dir="ltr">
                    {r.amount ? formatMoney(r.amount, lang) : p.rest}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {fmt(p.recordedAt, { date: formatDateTime(r.createdAt, lang, tz) })}
                  {r.recordedBy ? ` · ${fmt(p.by, { name: r.recordedBy })}` : ""}
                </p>
                {r.note && <p className="text-xs">{r.note}</p>}
              </li>
            ))}
          </ul>
        </details>
      )}
      {!showHistory && (
        <p className="mt-2 text-xs">
          <Link href={`/garage/invoices/${invoice.id}#promesse`} className="underline-offset-4 hover:underline">
            {fmt(p.invoiceOf, { number: invoice.number })}
          </Link>
        </p>
      )}
    </Card>
  );
}
