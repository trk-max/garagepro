import { Pencil, Plus } from "lucide-react";
import { updatePartAction } from "@/actions/catalog";
import { ActionForm } from "@/components/action-form";
import { StockMoveForm } from "@/components/stock/stock-move-form";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { DialogButton } from "@/components/ui/redesign/dialog";
import type { Dictionary } from "@/lib/i18n/fr";
import { fmt } from "@/lib/format";

export type EditablePart = { id: string; sku: string; name: string; brand: string | null; unit: string; costPrice: number; salePrice: number; minStockX100: number };

const dt = (millimes: number) => (millimes / 1000).toFixed(3);
const qty = (x100: number) => String(x100 / 100);

/**
 * The existing part edit form (same fields, same validation, same updatePartAction — manageStock),
 * now with labels so it reads well in a dialog. Closes its dialog and toasts on success; the
 * action revalidates the page.
 */
export function PartEditForm({ t, part }: { t: Dictionary; part: EditablePart }) {
  return (
    <ActionForm action={updatePartAction.bind(null, part.id)} reset={false} closeDialog successMessage={t.stockList.saved} className="grid grid-cols-2 gap-3">
      <Field label={t.parts.sku}>
        <Input name="sku" defaultValue={part.sku} required dir="ltr" />
      </Field>
      <Field label={t.parts.brand}>
        <Input name="brand" defaultValue={part.brand ?? ""} />
      </Field>
      <Field label={t.parts.name} className="col-span-2">
        <Input name="name" defaultValue={part.name} required />
      </Field>
      <Field label={`${t.parts.costPrice} (DT)`}>
        <Input name="costPrice" defaultValue={dt(part.costPrice)} inputMode="decimal" dir="ltr" />
      </Field>
      <Field label={`${t.parts.salePrice} (DT)`}>
        <Input name="salePrice" defaultValue={dt(part.salePrice)} inputMode="decimal" required dir="ltr" />
      </Field>
      <Field label={t.parts.minStock}>
        <Input name="minStock" defaultValue={qty(part.minStockX100)} inputMode="decimal" dir="ltr" />
      </Field>
      <Field label={t.parts.unit}>
        <Input name="unit" defaultValue={part.unit} placeholder="pce, L, kit" />
      </Field>
      <div className="col-span-2">
        <Button type="submit" className="w-full">
          {t.common.save}
        </Button>
      </div>
    </ActionForm>
  );
}

/** « Modifier » pill opening the edit form in a dialog (manageStock: the caller decides). */
export function EditPartButton({ t, part, className }: { t: Dictionary; part: EditablePart; className?: string }) {
  return (
    <DialogButton
      id={`edit-part-${part.id}`}
      label={t.stockList.edit}
      title={fmt(t.stockList.editTitle, { name: part.name })}
      closeLabel={t.v10.shell.close}
      variant="outline"
      icon={<Pencil className="size-4" aria-hidden />}
      className={className}
    >
      <PartEditForm t={t} part={part} />
    </DialogButton>
  );
}

/** « Ajuster » pill opening the existing stock movement form in a dialog. */
export function AdjustStockButton({ t, part, suppliers, className }: { t: Dictionary; part: { id: string; name: string }; suppliers: { id: string; name: string }[]; className?: string }) {
  return (
    <DialogButton
      id={`adjust-part-${part.id}`}
      label={t.stockList.adjust}
      title={fmt(t.stockList.adjustTitle, { name: part.name })}
      closeLabel={t.v10.shell.close}
      variant="secondary"
      icon={<Plus className="size-4" aria-hidden />}
      className={className}
    >
      <StockMoveForm t={t} partId={part.id} suppliers={suppliers} className="space-y-3" closeDialog />
    </DialogButton>
  );
}
