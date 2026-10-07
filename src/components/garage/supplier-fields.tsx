import type { Supplier } from "@prisma/client";
import { Field, Textarea } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { Dictionary } from "@/lib/i18n/fr";

export function SupplierFields({ t, defaults }: { t: Dictionary; defaults?: Partial<Supplier> }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label={t.common.name} className="sm:col-span-2">
        <Input name="name" required defaultValue={defaults?.name} />
      </Field>
      <Field label={t.suppliers.contact}>
        <Input name="contact" defaultValue={defaults?.contact ?? ""} />
      </Field>
      <Field label={t.common.phone}>
        <Input name="phone" type="tel" dir="ltr" defaultValue={defaults?.phone ?? ""} />
      </Field>
      <Field label={t.common.email}>
        <Input name="email" type="email" dir="ltr" defaultValue={defaults?.email ?? ""} />
      </Field>
      <Field label={t.common.taxId}>
        <Input name="taxId" dir="ltr" defaultValue={defaults?.taxId ?? ""} />
      </Field>
      <Field label={t.common.address} className="sm:col-span-2">
        <Input name="address" defaultValue={defaults?.address ?? ""} />
      </Field>
      <Field label={t.common.notes} className="sm:col-span-2">
        <Textarea name="notes" rows={2} defaultValue={defaults?.notes ?? ""} />
      </Field>
    </div>
  );
}
