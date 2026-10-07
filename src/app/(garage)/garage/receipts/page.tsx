import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageHeader, Table, Td, Th } from "@/components/ui/field";
import { formatDate, formatMoney } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { requirePageAccess } from "@/lib/session";
import { listReceipts } from "@/server/purchasing";

export default async function ReceiptsPage() {
  await requirePageAccess("receiveGoods");
  const [{ t, lang }, receipts] = await Promise.all([getI18n(), listReceipts()]);

  return (
    <div className="mx-auto max-w-6xl p-6">
      <PageHeader title={t.receipts.title}>
        <Button asChild>
          <Link href="/garage/receipts/new">{t.receipts.new}</Link>
        </Button>
      </PageHeader>
      {receipts.length === 0 ? (
        <p className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">{t.receipts.empty}</p>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>{t.receipts.number}</Th>
              <Th>{t.receipts.receivedAt}</Th>
              <Th>{t.purchase.supplier}</Th>
              <Th>{t.receipts.order}</Th>
              <Th>{t.receipts.deliveryNoteRef}</Th>
              <Th>{t.receipts.receivedBy}</Th>
              <Th className="text-end">{t.purchase.total}</Th>
            </tr>
          </thead>
          <tbody>
            {receipts.map((r) => (
              <tr key={r.id} className="hover:bg-accent/30">
                <Td>
                  <Link href={`/garage/receipts/${r.id}`} className="font-mono text-xs font-medium hover:underline">
                    {r.number}
                  </Link>
                </Td>
                <Td className="text-muted-foreground">{formatDate(r.receivedAt, lang)}</Td>
                <Td>{r.supplier.name}</Td>
                <Td>
                  {r.purchaseOrder ? (
                    <Link href={`/garage/purchase-orders/${r.purchaseOrder.id}`} className="font-mono text-xs hover:underline">
                      {r.purchaseOrder.number}
                    </Link>
                  ) : (
                    <span className="text-xs text-muted-foreground">{t.receipts.noOrder}</span>
                  )}
                </Td>
                <Td className="text-muted-foreground">{r.deliveryNoteRef ?? t.common.none}</Td>
                <Td className="text-muted-foreground">{r.receivedBy?.name ?? t.common.none}</Td>
                <Td className="text-end tabular-nums" dir="ltr">
                  {formatMoney(r.lines.reduce((s, l) => s + Math.round((l.quantityX100 * l.unitCost) / 100), 0), lang)}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
