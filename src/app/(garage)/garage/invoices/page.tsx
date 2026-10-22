import Link from "next/link";
import { BellRing } from "lucide-react";
import { InvoiceBadge, PlateChip } from "@/components/garage/badges";
import { InvoiceFilters, type InvoiceFilterValues } from "@/components/garage/invoice-filters";
import { Badge } from "@/components/ui/badge";
import { PageHeader, Table, Td, Th } from "@/components/ui/field";
import { fmt, formatDate, formatMoney, woNumber } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { requirePageAccess } from "@/lib/session";
import { invoiceFilterSchema } from "@/lib/validators";
import { daysLate, isOverdue, listInvoices } from "@/server/invoices";
import { garageToday, nextPaymentOf } from "@/server/payment-promises";
import { invoiceBalance } from "@/lib/billing";

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function InvoicesPage({ searchParams }: PageProps) {
  await requirePageAccess("viewClientInvoices");
  const raw = Object.fromEntries(Object.entries(await searchParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])) as InvoiceFilterValues;
  const filters = invoiceFilterSchema.parse(raw);

  const [{ t, lang }, invoices, { tz, todayStart }] = await Promise.all([getI18n(), listInvoices(filters), garageToday()]);
  const total = invoices.reduce((s, i) => s + i.totalTtc, 0);
  const due = invoices.reduce((s, i) => s + (i.totalTtc - i.paidAmount), 0);

  return (
    <div className="mx-auto max-w-7xl p-6">
      <PageHeader title={t.nav.clientInvoices} />

      <InvoiceFilters values={raw} />

      <p className="mb-3 flex flex-wrap gap-x-4 text-sm text-muted-foreground">
        <span>{fmt(t.invoiceFilters.results, { count: invoices.length })}</span>
        <span>
          {t.invoices.totalTtc}: <span className="font-medium text-foreground" dir="ltr">{formatMoney(total, lang)}</span>
        </span>
        <span>
          {t.invoices.balance}: <span className="font-medium text-foreground" dir="ltr">{formatMoney(due, lang)}</span>
        </span>
      </p>

      {invoices.length === 0 ? (
        <p className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">{t.invoices.empty}</p>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>{t.invoices.number}</Th>
              <Th>{t.invoices.issuedAt}</Th>
              <Th>{t.invoices.customer}</Th>
              <Th>{t.invoices.vehicle}</Th>
              <Th className="text-end">{t.invoices.totalTtc}</Th>
              <Th className="text-end">{t.invoices.balance}</Th>
              <Th>{t.reminders.dueDate}</Th>
              <Th>{t.pay.promise.title}</Th>
              <Th>{t.invoices.status}</Th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => {
              const late = isOverdue(inv);
              const next = invoiceBalance(inv) > 0 ? nextPaymentOf(inv.paymentPromises[0] ?? null, inv.payments, todayStart) : null;
              return (
                <tr key={inv.id} className={late ? "bg-red-500/5 hover:bg-red-500/10" : "hover:bg-accent/30"}>
                  <Td>
                    <Link href={`/garage/invoices/${inv.id}`} className="font-mono text-xs font-medium hover:underline">
                      {inv.number}
                    </Link>
                    <div className="font-mono text-xs text-muted-foreground">{woNumber(inv.workOrder.number)}</div>
                  </Td>
                  <Td className="text-muted-foreground">{formatDate(inv.issuedAt, lang)}</Td>
                  <Td>
                    <div>{inv.customer.name}</div>
                    <div className="text-xs text-muted-foreground" dir="ltr">{inv.customer.phone}</div>
                  </Td>
                  <Td>
                    <PlateChip plate={inv.workOrder.vehicle.plate} />
                  </Td>
                  <Td className="text-end tabular-nums" dir="ltr">{formatMoney(inv.totalTtc, lang)}</Td>
                  <Td className="text-end tabular-nums" dir="ltr">{formatMoney(inv.totalTtc - inv.paidAmount, lang)}</Td>
                  <Td className="text-xs">
                    <div className={late ? "font-medium text-red-700 dark:text-red-400" : "text-muted-foreground"}>{formatDate(inv.dueDate ?? inv.issuedAt, lang)}</div>
                    {late && <div className="text-red-700 dark:text-red-400">{fmt(t.reminders.daysLate, { days: daysLate(inv) })}</div>}
                    {inv.reminders[0] && (
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <BellRing className="size-3" aria-hidden /> {formatDate(inv.reminders[0].sentAt, lang)}
                      </div>
                    )}
                  </Td>
                  <Td className="text-xs" data-testid="invoice-next-payment">
                    {next ? (
                      <div className={next.overdue ? "font-semibold text-red-700 dark:text-red-400" : "font-medium"}>
                        <div>{formatDate(next.at, lang, tz)}</div>
                        {next.amount ? <div dir="ltr">{formatMoney(next.amount, lang)}</div> : null}
                        {next.overdue && <div>{t.pay.promise.overdue}</div>}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      <InvoiceBadge status={inv.status} t={t} />
                      {late && <Badge className="bg-red-600 text-white">{t.reminders.overdue}</Badge>}
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </div>
  );
}
