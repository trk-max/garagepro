import { createPurchaseOrderAction } from "@/actions/purchasing";
import { ActionForm } from "@/components/action-form";
import { PurchaseLinesEditor, type EditorRow } from "@/components/garage/purchase-lines-editor";
import { Button } from "@/components/ui/button";
import { Card, Field, NativeSelect, PageHeader, Textarea } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { getI18n } from "@/lib/i18n/server";
import { requirePageAccess } from "@/lib/session";
import { partOptions } from "@/server/parts";
import { lowStockSuggestions, supplierOptions } from "@/server/purchasing";

type PageProps = { searchParams: Promise<{ prefill?: string; supplier?: string }> };

export default async function NewPurchaseOrderPage({ searchParams }: PageProps) {
  const staff = await requirePageAccess("requestPurchase");
  const { prefill, supplier } = await searchParams;
  const [{ t }, suppliers, parts, suggestions] = await Promise.all([
    getI18n(),
    supplierOptions(),
    partOptions(),
    prefill === "low" ? lowStockSuggestions() : Promise.resolve([]),
  ]);

  const initialRows: EditorRow[] = suggestions.map((s) => ({
    partId: s.partId,
    quantity: String(s.quantityX100 / 100),
    unitCost: s.unitCost ? (s.unitCost / 1000).toFixed(3) : "",
  }));
  const defaultSupplier = supplier ?? suggestions.find((s) => s.supplierId)?.supplierId ?? "";

  return (
    <div className="mx-auto max-w-5xl p-6">
      <PageHeader title={t.purchase.new} />
      {staff.role !== "ADMIN" && (
        <p className="mb-4 rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-800 dark:text-amber-300">
          {t.purchase.pendingInfo}
        </p>
      )}
      <ActionForm action={createPurchaseOrderAction} reset={false} silent>
        <Card className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t.purchase.supplier}>
              <NativeSelect name="supplierId" required defaultValue={defaultSupplier}>
                <option value="">{t.suppliers.choose}</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label={t.purchase.expectedAt}>
              <Input type="date" name="expectedAt" min="2000-01-01" max="2100-12-31" dir="ltr" />
            </Field>
          </div>
          <PurchaseLinesEditor parts={parts} initialRows={initialRows} />
          <Field label={t.common.notes}>
            <Textarea name="notes" rows={2} />
          </Field>
          <Button type="submit" className="w-full sm:w-auto">
            {staff.role === "ADMIN" ? t.common.create : t.purchase.submit}
          </Button>
        </Card>
      </ActionForm>
    </div>
  );
}
