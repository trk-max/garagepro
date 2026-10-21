import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, PackageCheck, Printer, X } from "lucide-react";
import { approvePurchaseOrderAction, cancelPurchaseOrderAction, rejectPurchaseOrderAction } from "@/actions/purchasing";
import { ActionButton, ActionForm } from "@/components/action-form";
import { PoBadge, SupplierInvoiceBadge } from "@/components/garage/supplier-badges";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, Field, Table, Td, Th } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { fmt, formatDate, formatDateTime, formatMoney, formatQty } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { requirePageAccess } from "@/lib/session";
import { getPurchaseOrder } from "@/server/purchasing";

type PageProps = { params: Promise<{ id: string }> };

export default async function PurchaseOrderPage({ params }: PageProps) {
  const staff = await requirePageAccess("requestPurchase");
  const { id } = await params;
  const [po, { t, lang }] = await Promise.all([getPurchaseOrder(id), getI18n()]);
  if (!po) notFound();

  const total = po.lines.reduce((s, l) => s + Math.round((l.quantityX100 * l.unitCost) / 100), 0);
  const canApprove = can(staff, "approvePurchase") && po.status === "PENDING_APPROVAL";
  const canReceive = can(staff, "receiveGoods") && (po.status === "APPROVED" || po.status === "PARTIAL");
  const canCancel = po.status === "PENDING_APPROVAL" || po.status === "APPROVED";

  return (
    <div className="mx-auto grid max-w-7xl gap-6 p-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <section className="min-w-0 space-y-5">
        <header className="flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-xl font-semibold">{po.number}</h1>
          <PoBadge status={po.status} t={t} />
          <span className="text-muted-foreground">{po.supplier.name}</span>
          <div className="ms-auto flex flex-wrap gap-2">
            {po.status !== "PENDING_APPROVAL" && po.status !== "REJECTED" && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/garage/purchase-orders/${po.id}/print`} target="_blank">
                  <Printer className="size-4" aria-hidden /> {t.purchase.print}
                </Link>
              </Button>
            )}
            {canReceive && (
              <Button asChild size="sm">
                <Link href={`/garage/receipts/new?po=${po.id}`}>
                  <PackageCheck className="size-4" aria-hidden /> {t.purchase.receive}
                </Link>
              </Button>
            )}
          </div>
        </header>

        {po.status === "PENDING_APPROVAL" && !canApprove && (
          <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-700 dark:text-amber-300">{t.purchase.pendingInfo}</p>
        )}
        {po.status === "REJECTED" && po.rejectionReason && (
          <p className="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-700 dark:text-red-300">
            {fmt(t.purchase.rejectedInfo, { reason: po.rejectionReason })}
          </p>
        )}

        {canApprove && (
          <Card className="border-amber-500/40">
            <CardTitle>{t.dashboard.pendingApprovals}</CardTitle>
            <div className="flex flex-wrap items-end gap-3">
              <ActionButton action={approvePurchaseOrderAction.bind(null, po.id)}>
                <Check className="size-4" aria-hidden /> {t.purchase.approve}
              </ActionButton>
              <ActionForm action={rejectPurchaseOrderAction.bind(null, po.id)} className="flex flex-1 flex-wrap items-end gap-2">
                <Field label={t.purchase.rejectReason} className="min-w-60 flex-1">
                  <Input name="reason" required />
                </Field>
                <Button type="submit" variant="destructive">
                  <X className="size-4" aria-hidden /> {t.purchase.reject}
                </Button>
              </ActionForm>
            </div>
          </Card>
        )}

        <Card>
          <CardTitle>{t.purchase.lines}</CardTitle>
          <Table>
            <thead>
              <tr>
                <Th>{t.purchase.part}</Th>
                <Th className="text-end">{t.purchase.qty}</Th>
                <Th className="text-end">{t.purchase.received}</Th>
                <Th className="text-end">{t.parts.stock}</Th>
                <Th className="text-end">{t.purchase.unitCost}</Th>
                <Th className="text-end">{t.purchase.total}</Th>
              </tr>
            </thead>
            <tbody>
              {po.lines.map((l) => (
                <tr key={l.id}>
                  <Td>
                    <span className="font-mono text-xs text-muted-foreground">{l.part.sku}</span> {l.part.name}
                  </Td>
                  <Td className="text-end tabular-nums">
                    {formatQty(l.quantityX100, lang)} {l.part.unit}
                  </Td>
                  <Td className={`text-end tabular-nums ${l.receivedX100 >= l.quantityX100 ? "text-emerald-700 dark:text-emerald-400" : l.receivedX100 > 0 ? "text-orange-700 dark:text-orange-400" : "text-muted-foreground"}`}>
                    {formatQty(l.receivedX100, lang)}
                  </Td>
                  <Td className="text-end tabular-nums text-muted-foreground">{formatQty(l.part.stockX100, lang)}</Td>
                  <Td className="text-end tabular-nums" dir="ltr">{formatMoney(l.unitCost, lang)}</Td>
                  <Td className="text-end tabular-nums" dir="ltr">{formatMoney(Math.round((l.quantityX100 * l.unitCost) / 100), lang)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <p className="mt-3 text-end font-semibold">
            {t.purchase.total}: <span dir="ltr">{formatMoney(total, lang)}</span>
          </p>
        </Card>
      </section>

      <aside className="space-y-4">
        <Card>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">{t.purchase.createdAt}</dt>
              <dd>{formatDateTime(po.createdAt, lang)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">{t.purchase.requestedBy}</dt>
              <dd>{po.requestedBy?.name ?? t.common.none}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">{t.purchase.approvedBy}</dt>
              <dd>
                {po.approvedBy?.name ?? t.common.none}
                {po.approvedAt && <span className="block text-xs text-muted-foreground">{formatDateTime(po.approvedAt, lang)}</span>}
              </dd>
            </div>
            {po.expectedAt && (
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">{t.purchase.expectedAt}</dt>
                <dd>{formatDate(po.expectedAt, lang)}</dd>
              </div>
            )}
          </dl>
          {po.notes && <p className="mt-3 whitespace-pre-line rounded-md bg-muted/50 p-2 text-sm">{po.notes}</p>}
          {canCancel && (
            <ActionButton variant="ghost" size="sm" className="mt-3 w-full text-destructive" confirm={`${t.purchase.cancel} ?`} action={cancelPurchaseOrderAction.bind(null, po.id)}>
              {t.purchase.cancel}
            </ActionButton>
          )}
        </Card>

        <Card>
          <CardTitle>{t.receipts.title}</CardTitle>
          {po.receipts.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t.receipts.empty}</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {po.receipts.map((r) => (
                <li key={r.id} className="flex justify-between">
                  <Link href={`/garage/receipts/${r.id}`} className="font-mono hover:underline">
                    {r.number}
                  </Link>
                  <span className="text-muted-foreground">{formatDate(r.receivedAt, lang)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {can(staff, "viewSupplierInvoices") && (
          <Card>
            <CardTitle>{t.supplierInvoices.title}</CardTitle>
            {po.invoices.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t.supplierInvoices.empty}</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {po.invoices.map((inv) => (
                  <li key={inv.id} className="flex items-center justify-between gap-2">
                    <Link href={`/garage/supplier-invoices/${inv.id}`} className="font-mono hover:underline">
                      {inv.number}
                    </Link>
                    <SupplierInvoiceBadge status={inv.status} t={t} />
                  </li>
                ))}
              </ul>
            )}
            <Button asChild variant="outline" size="sm" className="mt-3 w-full">
              <Link href={`/garage/supplier-invoices?supplier=${po.supplierId}&po=${po.id}`}>{t.supplierInvoices.new}</Link>
            </Button>
          </Card>
        )}
      </aside>
    </div>
  );
}
