import Link from "next/link";
import { createReceiptAction } from "@/actions/purchasing";
import { ActionForm } from "@/components/action-form";
import { PurchaseLinesEditor, type EditorRow } from "@/components/garage/purchase-lines-editor";
import { Button } from "@/components/ui/button";
import { Card, Field, NativeSelect, PageHeader, Textarea } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { getI18n } from "@/lib/i18n/server";
import { requirePageAccess } from "@/lib/session";
import { partOptions } from "@/server/parts";
import { getPurchaseOrder, supplierOptions } from "@/server/purchasing";

type PageProps = { searchParams: Promise<{ po?: string }> };

export default async function NewReceiptPage({ searchParams }: PageProps) {
  await requirePageAccess("receiveGoods");
  const { po: poId } = await searchParams;
  const [{ t }, suppliers, parts, po] = await Promise.all([getI18n(), supplierOptions(), partOptions(), poId ? getPurchaseOrder(poId) : null]);

  const receivable = po && (po.status === "APPROVED" || po.status === "PARTIAL");
  const rows: EditorRow[] = receivable
    ? po.lines
        .filter((l) => l.receivedX100 < l.quantityX100)
        .map((l) => ({
          partId: l.partId,
          quantity: String((l.quantityX100 - l.receivedX100) / 100),
          unitCost: (l.unitCost / 1000).toFixed(3),
          remainingX100: l.quantityX100 - l.receivedX100,
        }))
    : [];

  return (
    <div className="mx-auto max-w-5xl p-6">
      <PageHeader title={t.receipts.new} />

      {po && !receivable && (
        <p className="mb-4 rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-800 dark:text-amber-300">
          {t.errors.poNotApproved}{" "}
          <Link href={`/garage/purchase-orders/${po.id}`} className="font-mono underline">
            {po.number}
          </Link>
        </p>
      )}

      <ActionForm action={createReceiptAction} reset={false} silent>
        <Card className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            {receivable ? (
              <>
                <input type="hidden" name="purchaseOrderId" value={po.id} />
                <Field label={t.receipts.order}>
                  <Input value={`${po.number} · ${po.supplier.name}`} readOnly />
                </Field>
              </>
            ) : (
              <Field label={t.purchase.supplier}>
                <NativeSelect name="supplierId" required defaultValue="">
                  <option value="">{t.suppliers.choose}</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            )}
            <Field label={t.receipts.deliveryNoteRef}>
              <Input name="deliveryNoteRef" dir="ltr" />
            </Field>
          </div>

          <PurchaseLinesEditor parts={parts} initialRows={rows} fixedParts={Boolean(receivable)} />

          <Field label={t.common.notes}>
            <Textarea name="notes" rows={2} />
          </Field>
          <Button type="submit">{t.receipts.create}</Button>
        </Card>
      </ActionForm>
    </div>
  );
}
