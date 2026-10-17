import Link from "next/link";
import { createSupplierInvoiceAction } from "@/actions/purchasing";
import { ActionForm } from "@/components/action-form";
import { SupplierInvoiceBadge } from "@/components/garage/supplier-badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, Field, NativeSelect, PageHeader, Table, Td, Textarea, Th } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { formatDate, formatMoney } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { requirePageAccess } from "@/lib/session";
import { cn } from "@/lib/utils";
import { listPurchaseOrders, listSupplierInvoices, supplierOptions } from "@/server/purchasing";

type PageProps = { searchParams: Promise<{ filter?: string; supplier?: string; po?: string }> };

export default async function SupplierInvoicesPage({ searchParams }: PageProps) {
  const staff = await requirePageAccess("viewSupplierInvoices");
  const params = await searchParams;
  const filter = params.filter === "unpaid" || params.filter === "overdue" ? params.filter : "all";
  const [{ t, lang }, invoices, suppliers, orders] = await Promise.all([
    getI18n(),
    listSupplierInvoices(filter, params.supplier),
    supplierOptions(),
    listPurchaseOrders(),
  ]);
  const today = new Date(new Date().toDateString());
  const due = invoices.reduce((s, i) => s + i.totalTtc - i.paidAmount, 0);
  const href = (f: string) => {
    const sp = new URLSearchParams();
    if (f !== "all") sp.set("filter", f);
    if (params.supplier) sp.set("supplier", params.supplier);
    return `/garage/supplier-invoices${sp.size ? `?${sp}` : ""}`;
  };

  return (
    <div className="mx-auto grid max-w-7xl gap-6 p-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0">
        <PageHeader title={t.supplierInvoices.title}>
          <span className="text-sm text-muted-foreground">
            {t.supplierInvoices.balance}: <span className="font-medium text-foreground" dir="ltr">{formatMoney(due, lang)}</span>
          </span>
        </PageHeader>
        <nav className="mb-4 flex flex-wrap gap-1.5">
          {(
            [
              ["all", t.common.all],
              ["unpaid", t.supplierInvoices.unpaidOnly],
              ["overdue", t.supplierInvoices.overdueOnly],
            ] as const
          ).map(([f, label]) => (
            <Link key={f} href={href(f)} className={cn("chip-tap rounded-full border px-3 py-1 text-xs", filter === f ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent")}>
              {label}
            </Link>
          ))}
          {params.supplier && (
            <Link href="/garage/supplier-invoices" className="chip-tap rounded-full border px-3 py-1 text-xs hover:bg-accent">
              ✕ {suppliers.find((s) => s.id === params.supplier)?.name}
            </Link>
          )}
        </nav>

        {invoices.length === 0 ? (
          <p className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">{t.supplierInvoices.empty}</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t.supplierInvoices.number}</Th>
                <Th>{t.supplierInvoices.supplier}</Th>
                <Th>{t.supplierInvoices.issuedAt}</Th>
                <Th>{t.supplierInvoices.dueDate}</Th>
                <Th className="text-end">{t.supplierInvoices.totalTtc}</Th>
                <Th className="text-end">{t.supplierInvoices.balance}</Th>
                <Th>{t.supplierInvoices.status}</Th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => {
                const late = inv.status !== "PAID" && inv.dueDate && inv.dueDate < today;
                return (
                  <tr key={inv.id} className={late ? "bg-red-500/5" : "hover:bg-accent/30"}>
                    <Td>
                      <Link href={`/garage/supplier-invoices/${inv.id}`} className="font-mono text-xs font-medium hover:underline">
                        {inv.number}
                      </Link>
                      {inv.purchaseOrder && <div className="font-mono text-xs text-muted-foreground">{inv.purchaseOrder.number}</div>}
                    </Td>
                    <Td>{inv.supplier.name}</Td>
                    <Td className="text-muted-foreground">{formatDate(inv.issuedAt, lang)}</Td>
                    <Td className={late ? "font-medium text-red-700 dark:text-red-400" : "text-muted-foreground"}>{inv.dueDate ? formatDate(inv.dueDate, lang) : t.common.none}</Td>
                    <Td className="text-end tabular-nums" dir="ltr">{formatMoney(inv.totalTtc, lang)}</Td>
                    <Td className="text-end tabular-nums" dir="ltr">{formatMoney(inv.totalTtc - inv.paidAmount, lang)}</Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        <SupplierInvoiceBadge status={inv.status} t={t} />
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

      {can(staff.role, "manageSupplierInvoices") && (
        <Card className="h-fit">
          <CardTitle>{t.supplierInvoices.new}</CardTitle>
          <ActionForm action={createSupplierInvoiceAction} reset={false} silent className="grid grid-cols-2 gap-3">
            <Field label={t.supplierInvoices.supplier} className="col-span-2">
              <NativeSelect name="supplierId" required defaultValue={params.supplier ?? ""}>
                <option value="">{t.suppliers.choose}</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label={`${t.supplierInvoices.order} (${t.common.optional})`} className="col-span-2">
              <NativeSelect name="purchaseOrderId" defaultValue={params.po ?? ""}>
                <option value="">{t.common.none}</option>
                {orders
                  .filter((o) => o.status !== "REJECTED" && o.status !== "CANCELLED" && (!params.supplier || o.supplierId === params.supplier))
                  .map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.number} · {o.supplier.name}
                    </option>
                  ))}
              </NativeSelect>
            </Field>
            <Field label={t.supplierInvoices.number} className="col-span-2">
              <Input name="number" required dir="ltr" />
            </Field>
            <Field label={t.supplierInvoices.issuedAt}>
              <Input type="date" name="issuedAt" required min="2000-01-01" max="2100-12-31" dir="ltr" />
            </Field>
            <Field label={t.supplierInvoices.dueDate}>
              <Input type="date" name="dueDate" min="2000-01-01" max="2100-12-31" dir="ltr" />
            </Field>
            <Field label={`${t.supplierInvoices.totalHt} (DT)`}>
              <Input name="totalHt" required inputMode="decimal" dir="ltr" />
            </Field>
            <Field label={`${t.supplierInvoices.totalTax} (DT)`}>
              <Input name="totalTax" required inputMode="decimal" dir="ltr" defaultValue="0" />
            </Field>
            <Field label={t.common.notes} className="col-span-2">
              <Textarea name="notes" rows={2} />
            </Field>
            <div className="col-span-2">
              <Button type="submit" className="w-full">
                {t.common.create}
              </Button>
            </div>
          </ActionForm>
        </Card>
      )}
    </div>
  );
}
