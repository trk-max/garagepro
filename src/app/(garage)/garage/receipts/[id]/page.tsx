import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/garage/print-button";
import { StockDocument } from "@/components/garage/stock-document";
import { Button } from "@/components/ui/button";
import { getI18n } from "@/lib/i18n/server";
import { requirePageAccess } from "@/lib/session";
import { getReceipt } from "@/server/purchasing";
import { getSettings } from "@/server/settings";

type PageProps = { params: Promise<{ id: string }> };

export default async function ReceiptPage({ params }: PageProps) {
  await requirePageAccess("receiveGoods");
  const { id } = await params;
  const [receipt, settings, { t, lang }] = await Promise.all([getReceipt(id), getSettings(), getI18n()]);
  if (!receipt) notFound();

  return (
    <div className="space-y-4 bg-muted/30 p-6 print:bg-white print:p-0">
      <div className="mx-auto flex max-w-[210mm] gap-2 print:hidden">
        <Button asChild variant="ghost">
          <Link href={receipt.purchaseOrder ? `/garage/purchase-orders/${receipt.purchaseOrder.id}` : "/garage/receipts"}>{t.common.back}</Link>
        </Button>
        <span className="ms-auto" />
        <PrintButton />
      </div>
      <StockDocument
        t={t}
        lang={lang}
        title={t.receipts.docTitle}
        number={receipt.number}
        date={receipt.receivedAt}
        garage={settings}
        supplier={receipt.supplier}
        meta={[
          { label: t.receipts.order, value: receipt.purchaseOrder?.number ?? t.receipts.noOrder },
          { label: t.receipts.deliveryNoteRef, value: receipt.deliveryNoteRef ?? t.common.none },
          { label: t.receipts.receivedBy, value: receipt.receivedBy?.name ?? t.common.none },
        ]}
        lines={receipt.lines.map((l) => ({ sku: l.part.sku, name: l.part.name, unit: l.part.unit, quantityX100: l.quantityX100, unitCost: l.unitCost }))}
      />
    </div>
  );
}
