import Link from "next/link";
import { PurchaseOrderStatus } from "@prisma/client";
import { PoBadge } from "@/components/garage/supplier-badges";
import { Button } from "@/components/ui/button";
import { PageHeader, Table, Td, Th } from "@/components/ui/field";
import { formatDate, formatMoney } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { requirePageAccess } from "@/lib/session";
import { cn } from "@/lib/utils";
import { listPurchaseOrders } from "@/server/purchasing";

type PageProps = { searchParams: Promise<{ status?: string; supplier?: string }> };

export default async function PurchaseOrdersPage({ searchParams }: PageProps) {
  await requirePageAccess("requestPurchase");
  const params = await searchParams;
  const status =
    params.status === "OPEN" ? "OPEN" : (Object.values(PurchaseOrderStatus) as string[]).includes(params.status ?? "") ? (params.status as PurchaseOrderStatus) : undefined;
  const [{ t, lang }, orders] = await Promise.all([getI18n(), listPurchaseOrders(status, params.supplier)]);

  const chips: { value?: string; label: string }[] = [
    { value: undefined, label: t.common.all },
    { value: "OPEN", label: t.dashboard.openPurchases },
    ...Object.values(PurchaseOrderStatus).map((s) => ({ value: s, label: t.purchase.statuses[s] })),
  ];

  return (
    <div className="mx-auto max-w-7xl p-6">
      <PageHeader title={t.purchase.title}>
        <Button asChild variant="outline">
          <Link href="/garage/purchase-orders/new?prefill=low">{t.purchase.prefillLow}</Link>
        </Button>
        <Button asChild>
          <Link href="/garage/purchase-orders/new">{t.purchase.new}</Link>
        </Button>
      </PageHeader>

      <nav className="mb-4 flex flex-wrap gap-1.5">
        {chips.map((c) => (
          <Link
            key={c.label}
            href={c.value ? `/garage/purchase-orders?status=${c.value}` : "/garage/purchase-orders"}
            className={cn("chip-tap rounded-full border px-3 py-1 text-xs", status === c.value ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent")}
          >
            {c.label}
          </Link>
        ))}
      </nav>

      {orders.length === 0 ? (
        <p className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">{t.purchase.empty}</p>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>{t.purchase.number}</Th>
              <Th>{t.purchase.createdAt}</Th>
              <Th>{t.purchase.supplier}</Th>
              <Th>{t.purchase.requestedBy}</Th>
              <Th className="text-end">{t.purchase.lines}</Th>
              <Th className="text-end">{t.purchase.total}</Th>
              <Th>{t.purchase.status}</Th>
            </tr>
          </thead>
          <tbody>
            {orders.map((po) => (
              <tr key={po.id} className={po.status === "PENDING_APPROVAL" ? "bg-amber-500/5" : "hover:bg-accent/30"}>
                <Td>
                  <Link href={`/garage/purchase-orders/${po.id}`} className="font-mono text-xs font-medium hover:underline">
                    {po.number}
                  </Link>
                </Td>
                <Td className="text-muted-foreground">{formatDate(po.createdAt, lang)}</Td>
                <Td>{po.supplier.name}</Td>
                <Td className="text-muted-foreground">{po.requestedBy?.name ?? t.common.none}</Td>
                <Td className="text-end tabular-nums">{po.lines.length}</Td>
                <Td className="text-end tabular-nums" dir="ltr">
                  {formatMoney(po.lines.reduce((s, l) => s + Math.round((l.quantityX100 * l.unitCost) / 100), 0), lang)}
                </Td>
                <Td>
                  <PoBadge status={po.status} t={t} />
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
