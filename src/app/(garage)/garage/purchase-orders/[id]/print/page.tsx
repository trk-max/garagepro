import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/garage/print-button";
import { StockDocument } from "@/components/garage/stock-document";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { requirePageAccess } from "@/lib/session";
import { getPurchaseOrder } from "@/server/purchasing";
import { getSettings } from "@/server/settings";

type PageProps = { params: Promise<{ id: string }> };

export default async function PurchaseOrderPrintPage({ params }: PageProps) {
  await requirePageAccess("requestPurchase");
  const { id } = await params;
  const [po, settings, { t, lang }] = await Promise.all([getPurchaseOrder(id), getSettings(), getI18n()]);
  if (!po) notFound();

  return (
    <div className="space-y-4 bg-muted/30 p-6 print:bg-white print:p-0">
      <div className="mx-auto flex max-w-[210mm] gap-2 print:hidden">
        <Button asChild variant="ghost">
          <Link href={`/garage/purchase-orders/${po.id}`}>{t.common.back}</Link>
        </Button>
        <span className="ms-auto" />
        <PrintButton />
      </div>
      <StockDocument
        t={t}
        lang={lang}
        title={t.purchase.docTitle}
        number={po.number}
        date={po.approvedAt ?? po.createdAt}
        garage={settings}
        supplier={po.supplier}
        meta={[
          { label: t.purchase.approvedBy, value: po.approvedBy?.name ?? t.common.none },
          ...(po.expectedAt ? [{ label: t.purchase.expectedAt, value: formatDate(po.expectedAt, lang) }] : []),
        ]}
        lines={po.lines.map((l) => ({ sku: l.part.sku, name: l.part.name, unit: l.part.unit, quantityX100: l.quantityX100, unitCost: l.unitCost }))}
      />
    </div>
  );
}
