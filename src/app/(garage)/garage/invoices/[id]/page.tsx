import Link from "next/link";
import { notFound } from "next/navigation";
import { PaymentMethod } from "@prisma/client";
import { recordPaymentAction } from "@/actions/catalog";
import { ActionForm } from "@/components/action-form";
import { InvoiceBadge } from "@/components/garage/badges";
import { DocumentView } from "@/components/garage/document-view";
import { PrintButton } from "@/components/garage/print-button";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, Field, NativeSelect } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { fmt, formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { requirePageAccess } from "@/lib/session";
import { ReminderPanel } from "@/components/garage/reminder-panel";
import { RelatedContracts } from "@/components/garage/contracts";
import { emailConfigured } from "@/server/email";
import { daysLate, getInvoice, isOverdue } from "@/server/invoices";
import { getSettings } from "@/server/settings";
import { completeSnapshot, snapshotLegal } from "@/lib/invoice-snapshot";
import { invoiceAmountSentence } from "@/lib/amount-words";
import { randomUUID } from "node:crypto";
import { issueCreditNoteAction, reversePaymentAction } from "@/actions/lot4";
import { invoiceBalance, refundDue } from "@/lib/billing";
import { snapshotHash } from "@/lib/quote";
import { utcToZoned, zonedToUtc } from "@/lib/booking";
import { PaymentPromiseCard } from "@/components/garage/payment-promise-card";
import { invoicePromises } from "@/server/payment-promises";
import { vehicleQrForDocument } from "@/components/garage/vehicle-qr-mini";
import { prisma } from "@/lib/prisma";

type PageProps = { params: Promise<{ id: string }> };

export default async function InvoicePage({ params }: PageProps) {
  const staff = await requirePageAccess("viewClientInvoices");

  const { id } = await params;
  const [invoice, { t, lang }, settings, promises] = await Promise.all([getInvoice(id), getI18n(), getSettings(), invoicePromises(id)]);
  if (!invoice) notFound();

  // V16 Lot 4: a credited invoice owes nothing; what was paid on it is owed back to the customer.
  const balance = invoiceBalance(invoice);
  const refund = refundDue(invoice);
  const credited = invoice.status === "CREDITED";
  const hashOk = invoice.snapshotHash ? snapshotHash(invoice.snapshot) === invoice.snapshotHash : null;
  const today = utcToZoned(new Date(), settings.timezone).date;
  const todayStart = zonedToUtc(today, "00:00", settings.timezone);
  const l4 = t.v16.lot4;
  // Old invoices may lack part of the frozen copy: complete it from live data and say so (never a 500).
  const s = completeSnapshot(invoice.snapshot, {
    garage: { name: settings.garageName, address: settings.address ?? null, phone: settings.phone ?? null, email: settings.email ?? null, taxId: settings.taxId ?? null, footer: settings.invoiceFooter ?? null },
    customer: { name: invoice.customer.name, phone: invoice.customer.phone, address: invoice.customer.address, taxId: invoice.customer.taxId },
    vehicle: { ...invoice.workOrder.vehicle, mileage: invoice.workOrder.mileageIn ?? invoice.workOrder.vehicle.mileage },
    workOrderNumber: invoice.workOrder.number,
    lines: invoice.workOrder.lines,
    stampDuty: invoice.stampDuty,
  });
  // staff-ux: the vehicle's QR (carnet), made from the vehicle NOW — the frozen invoice copy is not touched.
  // Read from the LIVE vehicle row (by the order), never from the snapshot.
  const liveVehicle = await prisma.workOrder.findUnique({ where: { id: invoice.workOrder.id }, select: { vehicle: { select: { qrToken: true } } } });
  const vehicleQr = await vehicleQrForDocument(liveVehicle?.vehicle.qrToken, t);
  const late = isOverdue(invoice);
  const dueDate = invoice.dueDate ?? invoice.issuedAt;
  const reminderText = fmt(t.reminders.message, {
    name: invoice.customer.name,
    number: invoice.number,
    amount: formatMoney(balance, lang),
    date: formatDate(dueDate, lang),
    garage: settings.garageName,
    phone: settings.phone ?? "",
  }).trim();

  return (
    <div className="grid min-h-full grid-cols-1 gap-6 p-3 sm:p-6 xl:grid-cols-[minmax(0,1fr)_320px] print:block print:bg-white print:p-0">
      <div className="min-w-0 space-y-4">
        <div className="flex gap-2 print:hidden">
          <Button asChild variant="ghost">
            <Link href={`/garage/work-orders/${invoice.workOrder.id}`}>{t.common.back}</Link>
          </Button>
          <span className="ms-auto" />
          <PrintButton />
        </div>
        {s.incomplete && (
          <p role="status" className="rounded-[14px] bg-gp-accent-tint px-4 py-2.5 text-sm text-gp-accent-ink print:hidden">{t.v10.pages.invoice.incomplete}</p>
        )}
        <DocumentView
          t={t}
          lang={lang}
          logo={settings.logoDataUrl}
          vehicleQr={vehicleQr}
          doc={{
            kind: "invoice",
            number: invoice.number,
            date: invoice.issuedAt,
            garage: s.garage,
            customer: s.customer,
            vehicle: s.vehicle,
            workOrderNumber: s.workOrderNumber,
            lines: s.lines,
            totals: { totalHt: invoice.totalHt, taxByRate: s.taxByRate, stampDuty: invoice.stampDuty, totalTtc: invoice.totalTtc },
            // V10.6: due date (column), frozen mentions (new invoices only), amount in words (from the frozen total).
            dueDate: invoice.dueDate,
            legal: snapshotLegal(invoice.snapshot),
            amountWords: invoiceAmountSentence(invoice.totalTtc),
          }}
        />
      </div>

      <aside className="space-y-4 print:hidden">
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <CardTitle className="mb-0">{t.invoices.payments}</CardTitle>
            <InvoiceBadge status={invoice.status} t={t} />
          </div>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{t.invoices.totalTtc}</dt>
              <dd dir="ltr">{formatMoney(invoice.totalTtc, lang)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{t.invoices.paid}</dt>
              <dd dir="ltr">{formatMoney(invoice.paidAmount, lang)}</dd>
            </div>
            <div className="flex justify-between border-t pt-1 font-semibold">
              <dt>{t.invoices.balance}</dt>
              <dd dir="ltr">{formatMoney(balance, lang)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{t.reminders.dueDate}</dt>
              <dd className={late ? "font-medium text-red-700 dark:text-red-400" : ""}>
                {formatDate(dueDate, lang)}
                {late && ` · ${fmt(t.reminders.daysLate, { days: daysLate(invoice) })}`}
              </dd>
            </div>
          </dl>

          {credited && invoice.creditNote && (
            <p className="mt-3 rounded-md bg-gp-panel px-3 py-2 text-xs" data-testid="credited">
              {fmt(l4.invoice.creditDone, { number: invoice.creditNote.number, date: formatDate(invoice.creditNote.issuedAt, lang) })} —{" "}
              <Link href={`/garage/invoices/${invoice.id}/avoir`} className="font-medium underline">
                {l4.invoice.printCredit}
              </Link>
            </p>
          )}
          {refund > 0 && <p className="mt-2 rounded-md bg-gp-danger-bg px-3 py-2 text-xs text-gp-danger-ink">{fmt(l4.invoice.refundDue, { amount: formatMoney(refund, lang) })}</p>}
          {invoice.workOrder.depositAmount && !invoice.workOrder.workflowLot4 && invoice.payments.length === 0 ? (
            <p className="mt-3 rounded-md bg-gp-accent-tint px-3 py-2 text-xs text-gp-accent-ink">
              {fmt(t.legal.invoice.depositToRecord, { amount: formatMoney(invoice.workOrder.depositAmount, lang), method: t.paymentMethod[(invoice.workOrder.depositMethod ?? "CASH") as PaymentMethod] ?? "" })}
            </p>
          ) : null}
          {invoice.payments.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">{t.invoices.noPayments}</p>
          ) : (
            <ul className="mt-4 space-y-2 text-sm">
              {invoice.payments.map((p) => (
                <li key={p.id} className="rounded-md bg-muted/50 px-3 py-2" data-testid="payment-row">
                  <div className="flex justify-between gap-2">
                    <span>
                      {p.reversalOfId ? l4.payment.reversal : t.paymentMethod[p.method]}
                      {p.isDeposit && <span className="text-muted-foreground"> · {l4.payment.deposit}</span>}
                      {p.reference && <span className="text-muted-foreground"> · {p.reference}</span>}
                      {p.reversedBy && <span className="text-gp-danger-ink"> · {l4.payment.reversed}</span>}
                      <span className="block text-xs text-muted-foreground">{formatDateTime(p.paidAt, lang)}</span>
                      {p.reason && <span className="block text-xs text-muted-foreground">{p.reason}</span>}
                    </span>
                    <span className={`font-medium tabular-nums${p.reversedBy ? " line-through" : ""}`} dir="ltr">
                      {formatMoney(p.amount, lang)}
                    </span>
                  </div>
                  {/* V16 Lot 4: cancel a payment (negative line, reason) — the payment itself is never changed. */}
                  {!p.reversalOfId && !p.reversedBy && p.amount > 0 && can(staff, "reversePayment") && (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-xs text-muted-foreground">{l4.payment.reverse}</summary>
                      <ActionForm action={reversePaymentAction.bind(null, p.id, invoice.id)} className="mt-2 grid gap-2">
                        <p className="text-xs text-muted-foreground">{l4.payment.reverseHint}</p>
                        <Input name="reason" required minLength={3} maxLength={500} placeholder={l4.payment.reasonPlaceholder} aria-label={t.v16.status.reason} />
                        <Button type="submit" size="sm" variant="secondary">
                          {l4.payment.reverseTitle}
                        </Button>
                      </ActionForm>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Paiements partiels: date of the next payment promised by the customer (history kept, append-only). */}
        {(balance > 0 || promises.rows.length > 0) && !credited && (
          <PaymentPromiseCard
            invoice={{ id: invoice.id, number: invoice.number, workOrderId: invoice.workOrder.id, balance }}
            promises={promises.rows}
            state={balance > 0 ? promises.state : "kept"}
            canRecord={balance > 0 && can(staff, "recordPayment")}
            showHistory
            today={today}
            todayStart={todayStart}
            t={t}
            lang={lang}
            tz={settings.timezone}
          />
        )}

        {balance > 0 && can(staff, "sendReminder") && (
          <Card id="relance" className={`scroll-mt-24${late || promises.state === "overdue" ? " border-red-500/40" : ""}`}>
            <CardTitle>{t.reminders.send}</CardTitle>
            <ReminderPanel
              invoiceId={invoice.id}
              invoiceNumber={invoice.number}
              phone={invoice.customer.phone}
              email={invoice.customer.email}
              defaultMessage={reminderText}
              emailViaResend={emailConfigured()}
            />
          </Card>
        )}

        <Card>
          <CardTitle>{t.reminders.title}</CardTitle>
          {invoice.reminders.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t.reminders.none}</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {invoice.reminders.map((r) => (
                <li key={r.id} className="rounded-md bg-muted/50 px-3 py-2">
                  <div className="flex justify-between gap-2 text-xs text-muted-foreground">
                    <span>
                      {t.reminders.channels[r.channel]} · {r.actor?.name ?? ""}
                    </span>
                    <span>{formatDateTime(r.sentAt, lang)}</span>
                  </div>
                  <p className="mt-1 line-clamp-3">{r.message}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {balance > 0 && can(staff, "recordPayment") && (
          <Card>
            <CardTitle>{t.invoices.recordPayment}</CardTitle>
            <ActionForm action={recordPaymentAction.bind(null, invoice.id)} className="grid gap-3">
              {/* V16 Lot 4: one key per form shown — the same form sent twice records ONE payment (server check). */}
              <input type="hidden" name="requestKey" value={randomUUID()} />
              <Field label={l4.payment.paidAt} hint={l4.payment.paidAtHint}>
                <Input name="paidAt" type="date" max={today} defaultValue={today} dir="ltr" required />
              </Field>
              <Field label={`${t.common.amount} (DT)`}>
                <Input name="amount" inputMode="decimal" required defaultValue={(balance / 1000).toFixed(3)} dir="ltr" />
              </Field>
              <Field label={t.invoices.method}>
                <NativeSelect name="method" defaultValue="CASH">
                  {Object.values(PaymentMethod).map((m) => (
                    <option key={m} value={m}>
                      {t.paymentMethod[m]}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label={t.v7.profit.payer}>
                <NativeSelect name="payer" defaultValue="CUSTOMER">
                  <option value="CUSTOMER">{t.v7.profit.customer}</option>
                  <option value="INSURANCE">{t.v7.profit.insurance}</option>
                </NativeSelect>
              </Field>
              <Field label={`${t.invoices.reference} (${t.common.optional})`}>
                <Input name="reference" />
              </Field>
              <Button type="submit">{t.invoices.recordPayment}</Button>
            </ActionForm>
          </Card>
        )}
        {/* V16 Lot 4: frozen invoice (fingerprint) and its cancellation by a credit note (never edited nor deleted). */}
        <Card>
          <CardTitle>{l4.invoice.cardTitle}</CardTitle>
          <p className="text-xs text-muted-foreground">{l4.invoice.frozen}</p>
          {invoice.snapshotHash && (
            <p className="mt-1 text-xs text-muted-foreground" dir="ltr">
              {l4.invoice.fingerprint} <span className="font-mono">{invoice.snapshotHash.slice(0, 16)}…</span>{" "}
              <span className={hashOk ? "text-gp-success-ink" : "font-medium text-gp-danger-ink"}>({hashOk ? l4.invoice.intact : l4.invoice.altered})</span>
            </p>
          )}
          {!credited && can(staff, "issueCreditNote") && (
            <details className="mt-3 rounded-[14px] border border-gp-line p-3">
              <summary className="cursor-pointer text-sm font-medium">{l4.invoice.issueCredit}</summary>
              <ActionForm action={issueCreditNoteAction.bind(null, invoice.id)} className="mt-2 grid gap-2">
                <p className="text-xs text-muted-foreground">{l4.invoice.creditHint}</p>
                <Field label={l4.invoice.reason}>
                  <Input name="reason" required minLength={3} maxLength={500} />
                </Field>
                <Button type="submit" size="sm" variant="secondary">
                  {l4.invoice.creditTitle}
                </Button>
              </ActionForm>
            </details>
          )}
        </Card>
        {/* V9: contract of the repair invoiced here (its page shows the payment status too). */}
        <RelatedContracts staff={staff} filter={{ workOrderId: invoice.workOrder.id }} t={t} lang={lang} />
      </aside>
    </div>
  );
}
