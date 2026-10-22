import Link from "next/link";
import { CheckCircle2, FileClock, Printer, RefreshCw, ShieldCheck, TriangleAlert } from "lucide-react";
import { recordQuoteDecisionAction, sendQuoteAction } from "@/actions/work-orders";
import { ActionButton } from "@/components/action-form";
import { QuoteDecisionDialog } from "@/components/garage/quote-decision-dialog";
import type { ChoiceLine } from "@/components/garage/quote-line-choices";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/field";
import { fmt, formatDate, formatDateTime, formatMoney, type Lang } from "@/lib/format";
import type { Dictionary } from "@/lib/i18n/fr";
import { cn } from "@/lib/utils";
import type { QuoteHistory } from "@/server/quotes";

/**
 * V16 Lot 2 — « Devis et accords » on the order page: every version (number, kind, status, validity, totals,
 * SHA-256 fingerprint and its integrity) and every decision under it (who, when, channel, amount, accepted and
 * refused lines, who recorded it). Actions: send the quote again (manageQuotes), record the customer's decision
 * (recordQuoteApproval — never a mechanic by default).
 */
export function QuotePanel({
  workOrderId,
  legacy,
  history,
  pendingLines,
  openQuoteId,
  waiting,
  stampDuty,
  customer,
  canResend,
  canRecord,
  showMoney,
  t,
  lang,
}: {
  workOrderId: string;
  legacy: boolean;
  history: QuoteHistory;
  pendingLines: ChoiceLine[];
  /** The open quote holds exactly the pending lines (else the dialog quotes them first). */
  openQuoteId: string | null;
  /** The order waits for the customer's answer (QUOTE_SENT / WAITING_CUSTOMER): the quote may be sent again. */
  waiting: boolean;
  stampDuty: number;
  customer: { name: string; phone: string };
  canResend: boolean;
  canRecord: boolean;
  showMoney: boolean;
  t: Dictionary;
  lang: Lang;
}) {
  const q = t.v16.quote;
  const money = (m: number) => (showMoney ? formatMoney(m, lang) : "—");
  const stale = !legacy && pendingLines.length > 0 && !openQuoteId && history.some((h) => h.status === "SENT");
  const superseded = history.filter((h) => h.status === "SUPERSEDED" && h.approvals.length > 0);

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <CardTitle className="mb-0 flex-1">{q.title}</CardTitle>
        {!legacy && canResend && waiting && pendingLines.length > 0 && (
          <ActionButton size="sm" variant="outline" action={sendQuoteAction.bind(null, workOrderId)} title={q.resendHint}>
            <RefreshCw className="size-4" aria-hidden /> {q.resend}
          </ActionButton>
        )}
        {!legacy && canRecord && pendingLines.length > 0 && (
          <QuoteDecisionDialog
            action={recordQuoteDecisionAction.bind(null, workOrderId)}
            quoteId={openQuoteId}
            lines={pendingLines}
            stampDuty={stampDuty}
            defaultName={customer.name}
            defaultContact={customer.phone}
          />
        )}
      </div>

      {legacy && history.length === 0 && <p className="text-sm text-gp-muted">{q.legacy}</p>}
      {!legacy && history.length === 0 && <p className="text-sm text-gp-muted">{q.none}</p>}
      {stale && (
        <p role="status" className="mb-3 flex items-center gap-2 rounded-[14px] bg-gp-accent-tint px-3 py-2 text-sm text-gp-accent-ink">
          <TriangleAlert className="size-4 shrink-0" aria-hidden /> {q.staleQuote}
        </p>
      )}
      {superseded.map((h) => (
        <p key={h.id} role="alert" className="mb-3 flex items-center gap-2 rounded-[14px] bg-gp-danger-bg px-3 py-2 text-sm text-gp-danger-ink">
          <TriangleAlert className="size-4 shrink-0" aria-hidden /> {fmt(q.supersededApproval, { number: h.number })}
        </p>
      ))}

      <ol className="grid gap-3">
        {history.map((h) => {
          const label = h.expired ? q.status.EXPIRED : q.status[h.status];
          const lineName = (id: string) => h.snapshot.lines.find((l) => l.id === id)?.description ?? id;
          return (
            <li key={h.id} className="rounded-[18px] border border-gp-line p-3" data-quote={h.number}>
              <div className="flex flex-wrap items-center gap-2">
                <FileClock className="size-4 text-gp-muted" aria-hidden />
                <span className="font-medium">{fmt(q.heading, { kind: q.kind[h.kind], number: h.number, version: h.version })}</span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs",
                    h.status === "APPROVED" && "bg-gp-success-bg text-gp-success-ink",
                    h.status === "PARTIAL" && "bg-gp-accent-tint text-gp-accent-ink",
                    h.status === "REFUSED" && "bg-gp-danger-bg text-gp-danger-ink",
                    (h.status === "SENT" || h.status === "SUPERSEDED" || h.status === "EXPIRED") && "bg-gp-panel text-gp-muted",
                  )}
                >
                  {label}
                </span>
                <Button asChild variant="ghost" size="sm" className="ms-auto">
                  <Link href={`/garage/work-orders/${workOrderId}/quote?v=${h.version}`} target="_blank">
                    <Printer className="size-4" aria-hidden /> {t.workOrders.printQuote}
                  </Link>
                </Button>
              </div>
              <p className="mt-1 text-xs text-gp-muted">
                {fmt(q.sent, { date: formatDateTime(h.sentAt, lang) })}
                {h.sentBy && ` ${fmt(q.sentBy, { name: h.sentBy })}`}
                {h.validUntil && ` · ${fmt(q.validUntil, { date: formatDate(h.validUntil, lang) })}`}
              </p>
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm sm:grid-cols-3">
                {h.snapshot.previousTtc !== null && (
                  <div>
                    <dt className="text-xs text-gp-muted">{q.previous}</dt>
                    <dd className="tabular-nums" dir="ltr">{money(h.snapshot.previousTtc)}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-xs text-gp-muted">{h.kind === "SUPPLEMENT" ? q.supplement : t.invoices.totalTtc}</dt>
                  <dd className="font-medium tabular-nums" dir="ltr">{money(h.snapshot.totals.totalTtc)}</dd>
                </div>
                {h.snapshot.newTotalTtc !== null && (
                  <div>
                    <dt className="text-xs text-gp-muted">{q.newTotal}</dt>
                    <dd className="tabular-nums" dir="ltr">{money(h.snapshot.newTotalTtc)}</dd>
                  </div>
                )}
              </dl>
              <p className="mt-2 flex items-center gap-1.5 text-xs text-gp-muted" title={h.snapshotHash}>
                <ShieldCheck className={cn("size-3.5", h.hashOk ? "text-gp-success-ink" : "text-gp-danger-ink")} aria-hidden />
                {q.fingerprint} <span className="font-mono" dir="ltr">{h.snapshotHash.slice(0, 16)}…</span> — {h.hashOk ? q.hashOk : q.hashBad}
              </p>

              {h.approvals.map((a) => (
                <div key={a.id} className="mt-3 rounded-[14px] bg-gp-panel p-3 text-sm" data-approval={a.decision}>
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    <CheckCircle2 className="size-4 text-gp-success-ink" aria-hidden />
                    {q.decision[a.decision]} · {money(a.amountApprovedTtc)}
                  </p>
                  <p className="mt-1 text-xs text-gp-muted">
                    {a.approverName}
                    {a.approverContact && <span dir="ltr"> ({a.approverContact})</span>} · {q.channel[a.channel]} · {formatDateTime(a.createdAt, lang)} ·{" "}
                    {a.recordedBy ? fmt(q.recordedBy, { name: a.recordedBy }) : q.byCustomer}
                    {a.ip && <span dir="ltr"> · IP {a.ip}</span>}
                  </p>
                  {a.approvedLineIds.length > 0 && (
                    <p className="mt-1 text-xs">
                      <span className="font-medium text-gp-success-ink">{q.accepted} :</span> {a.approvedLineIds.map(lineName).join(" · ")}
                    </p>
                  )}
                  {a.refusedLineIds.length > 0 && (
                    <p className="mt-1 text-xs">
                      <span className="font-medium text-gp-danger-ink">{q.refused} :</span> {a.refusedLineIds.map(lineName).join(" · ")}
                    </p>
                  )}
                  {a.note && <p className="mt-1 whitespace-pre-line text-xs">{a.note}</p>}
                </div>
              ))}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
