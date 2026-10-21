import { moveStockAction } from "@/actions/catalog";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { Dictionary } from "@/lib/i18n/fr";

/** The existing stock movement form (purchase / adjustment / supplier return) for one part — manageStock only. */
export function StockMoveForm({ t, partId, suppliers, className, closeDialog = false }: { t: Dictionary; partId: string; suppliers: { id: string; name: string }[]; className?: string; closeDialog?: boolean }) {
  const v = t.v7.stock;
  return (
    <ActionForm action={moveStockAction.bind(null, partId)} className={className ?? "mt-2 space-y-2"} closeDialog={closeDialog}>
      <Input name="delta" required inputMode="decimal" placeholder="+10 / -2" dir="ltr" aria-label={t.parts.delta} />
      <NativeSelect name="reason" defaultValue="PURCHASE" aria-label={t.parts.reason}>
        <option value="PURCHASE">{t.parts.reasons.PURCHASE}</option>
        <option value="ADJUSTMENT">{t.parts.reasons.ADJUSTMENT}</option>
        <option value="SUPPLIER_RETURN">{t.parts.reasons.SUPPLIER_RETURN}</option>
      </NativeSelect>
      <NativeSelect name="supplierId" defaultValue="" aria-label={v.returnSupplier}>
        <option value="">{v.returnSupplier} —</option>
        {suppliers.map((sup) => (
          <option key={sup.id} value={sup.id}>
            {sup.name}
          </option>
        ))}
      </NativeSelect>
      <Input name="note" placeholder={t.common.notes} />
      <Button type="submit" size="sm" className="w-full">
        {t.common.save}
      </Button>
    </ActionForm>
  );
}
