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

type PageProps = { params: Promise<{ id: string }> };

export default async function InvoicePage({ params }: PageProps) {
  const staff = await requirePageAccess("viewClientInvoices");

  const { id } = await params;
  const [invoice, { t, lang }, settings] = await Promise.all([getInvoice(id), getI18n(), getSettings()]);
  if (!invoice) notFound();

  const balance = invoice.totalTtc - invoice.paidAmount;
  const s = invoice.snapshot;
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
    <div className="grid min-h-full grid-cols-1 gap-6 bg-muted/30 p-6 xl:grid-cols-[minmax(0,1fr)_320px] print:block print:bg-white print:p-0">
      <div className="space-y-4">
        <div className="flex gap-2 print:hidden">
          <Button asChild variant="ghost">
            <Link href={`/garage/work-orders/${invoice.workOrder.id}`}>{t.common.back}</Link>
          </Button>
          <span className="ms-auto" />
          <PrintButton />
        </div>
        <DocumentView
          t={t}
          lang={lang}
          logo={settings.logoDataUrl}
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

          {invoice.payments.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">{t.invoices.noPayments}</p>
          ) : (
            <ul className="mt-4 space-y-2 text-sm">
              {invoice.payments.map((p) => (
                <li key={p.id} className="flex justify-between gap-2 rounded-md bg-muted/50 px-3 py-2">
                  <span>
                    {t.paymentMethod[p.method]}
                    {p.reference && <span className="text-muted-foreground"> · {p.reference}</span>}
                    <span className="block text-xs text-muted-foreground">{formatDateTime(p.paidAt, lang)}</span>
                  </span>
                  <span className="font-medium tabular-nums" dir="ltr">{formatMoney(p.amount, lang)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {balance > 0 && can(staff.role, "sendReminder") && (
          <Card className={late ? "border-red-500/40" : undefined}>
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

        {balance > 0 && can(staff.role, "recordPayment") && (
          <Card>
            <CardTitle>{t.invoices.recordPayment}</CardTitle>
            <ActionForm action={recordPaymentAction.bind(null, invoice.id)} className="grid gap-3">
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
        {/* V9: contract of the repair invoiced here (its page shows the payment status too). */}
        <RelatedContracts staff={staff} filter={{ workOrderId: invoice.workOrder.id }} t={t} lang={lang} />
      </aside>
    </div>
  );
}
