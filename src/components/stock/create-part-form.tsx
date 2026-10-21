import { createPartAction } from "@/actions/catalog";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { Dictionary } from "@/lib/i18n/fr";

/** The existing "new part" form (manageStock), unchanged — now shown in a dialog. */
export function CreatePartForm({ t }: { t: Dictionary }) {
  return (
    <ActionForm action={createPartAction} className="grid grid-cols-2 gap-3">
      <Field label={t.parts.sku}>
        <Input name="sku" required dir="ltr" className="uppercase" />
      </Field>
      <Field label={t.parts.brand}>
        <Input name="brand" />
      </Field>
      <Field label={t.parts.name} className="col-span-2">
        <Input name="name" required />
      </Field>
      <Field label={`${t.parts.costPrice} (DT)`}>
        <Input name="costPrice" inputMode="decimal" dir="ltr" />
      </Field>
      <Field label={`${t.parts.salePrice} (DT)`}>
        <Input name="salePrice" inputMode="decimal" required dir="ltr" />
      </Field>
      <Field label={t.parts.stock}>
        <Input name="stock" inputMode="decimal" dir="ltr" />
      </Field>
      <Field label={t.parts.minStock}>
        <Input name="minStock" inputMode="decimal" dir="ltr" />
      </Field>
      <Field label={t.parts.unit}>
        <Input name="unit" placeholder="pce, L, kit" />
      </Field>
      <div className="col-span-2">
        <Button type="submit" className="w-full">
          {t.common.create}
        </Button>
      </div>
    </ActionForm>
  );
}
