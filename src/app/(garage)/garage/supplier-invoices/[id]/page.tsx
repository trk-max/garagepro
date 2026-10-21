import Link from "next/link";
import { notFound } from "next/navigation";
import { PaymentMethod } from "@prisma/client";
import { paySupplierInvoiceAction } from "@/actions/purchasing";
import { ActionForm } from "@/components/action-form";
import { SupplierInvoiceBadge } from "@/components/garage/supplier-badges";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, Field, NativeSelect, PageHeader } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { requirePageAccess } from "@/lib/session";
import { getSupplierInvoice } from "@/server/purchasing";

type PageProps = { params: Promise<{ id: string }> };

export default async function SupplierInvoicePage({ params }: PageProps) {
  const staff = await requirePageAccess("viewSupplierInvoices");
  const { id } = await params;
  const [inv, { t, lang }] = await Promise.all([getSupplierInvoice(id), getI18n()]);
  if (!inv) notFound();

  const balance = inv.totalTtc - inv.paidAmount;
  const late = inv.status !== "PAID" && inv.dueDate && inv.dueDate < new Date(new Date().toDateString());
  const rows: [string, string, string?][] = [
    [t.supplierInvoices.supplier, inv.supplier.name],
    [t.supplierInvoices.issuedAt, formatDate(inv.issuedAt, lang)],
    [t.supplierInvoices.dueDate, inv.dueDate ? formatDate(inv.dueDate, lang) : t.common.none, late ? "font-medium text-red-700 dark:text-red-400" : undefined],
    [t.supplierInvoices.totalHt, formatMoney(inv.totalHt, lang)],
    [t.supplierInvoices.totalTax, formatMoney(inv.totalTax, lang)],
    [t.supplierInvoices.totalTtc, formatMoney(inv.totalTtc, lang), "font-semibold"],
    [t.supplierInvoices.paid, formatMoney(inv.paidAmount, lang)],
    [t.supplierInvoices.balance, formatMoney(balance, lang), "font-semibold"],
  ];

  return (
    <div className="mx-auto max-w-5xl p-6">
      <PageHeader title={`${t.supplierInvoices.number} ${inv.number}`}>
        <SupplierInvoiceBadge status={inv.status} t={t} />
        <Button asChild variant="ghost">
          <Link href="/garage/supplier-invoices">{t.common.back}</Link>
        </Button>
      </PageHeader>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <dl className="space-y-2 text-sm">
            {rows.map(([label, value, cls]) => (
              <div key={label} className="flex justify-between gap-2">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className={cls} dir={value.includes("DT") || value.includes("د.ت") ? "ltr" : undefined}>
                  {value}
                </dd>
              </div>
            ))}
            {inv.purchaseOrder && (
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">{t.supplierInvoices.order}</dt>
                <dd>
                  <Link href={`/garage/purchase-orders/${inv.purchaseOrder.id}`} className="font-mono hover:underline">
                    {inv.purchaseOrder.number}
                  </Link>
                </dd>
              </div>
            )}
          </dl>
          {inv.notes && <p className="mt-3 whitespace-pre-line rounded-md bg-muted/50 p-2 text-sm">{inv.notes}</p>}
        </Card>

        <div className="space-y-4">
          <Card>
            <CardTitle>{t.supplierInvoices.payments}</CardTitle>
            {inv.payments.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t.invoices.noPayments}</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {inv.payments.map((p) => (
                  <li key={p.id} className="flex justify-between gap-2 rounded-md bg-muted/50 px-3 py-2">
                    <span>
                      {t.paymentMethod[p.method]}
                      {p.reference && <span className="text-muted-foreground"> · {p.reference}</span>}
                      <span className="block text-xs text-muted-foreground">
                        {formatDateTime(p.paidAt, lang)} · {p.actor?.name ?? ""}
                      </span>
                    </span>
                    <span className="font-medium tabular-nums" dir="ltr">{formatMoney(p.amount, lang)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {balance > 0 && can(staff, "paySupplier") && (
            <Card>
              <CardTitle>{t.supplierInvoices.pay}</CardTitle>
              <ActionForm action={paySupplierInvoiceAction.bind(null, inv.id)} className="grid gap-3">
                <Field label={`${t.common.amount} (DT)`}>
                  <Input name="amount" required inputMode="decimal" defaultValue={(balance / 1000).toFixed(3)} dir="ltr" />
                </Field>
                <Field label={t.invoices.method}>
                  <NativeSelect name="method" defaultValue="TRANSFER">
                    {Object.values(PaymentMethod).map((m) => (
                      <option key={m} value={m}>
                        {t.paymentMethod[m]}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field label={`${t.invoices.reference} (${t.common.optional})`}>
                  <Input name="reference" />
                </Field>
                <Button type="submit">{t.supplierInvoices.pay}</Button>
              </ActionForm>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
