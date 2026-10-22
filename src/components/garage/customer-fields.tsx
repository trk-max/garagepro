import { Field, Textarea } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { Dictionary } from "@/lib/i18n/fr";

type CustomerDefaults = {
  name?: string;
  phone?: string;
  email?: string | null;
  address?: string | null;
  taxId?: string | null;
  nationalId?: string | null;
  notes?: string | null;
  reminderOptOut?: boolean;
};

export function CustomerFields({ t, defaults = {} }: { t: Dictionary; defaults?: CustomerDefaults }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label={t.common.name}>
        <Input name="name" required defaultValue={defaults.name} />
      </Field>
      <Field label={t.common.phone}>
        <Input name="phone" type="tel" required dir="ltr" defaultValue={defaults.phone} placeholder="+216 …" />
      </Field>
      <Field label={`${t.common.email} (${t.common.optional})`}>
        <Input name="email" type="email" dir="ltr" defaultValue={defaults.email ?? ""} />
      </Field>
      <Field label={`${t.common.taxId} (${t.common.optional})`}>
        <Input name="taxId" dir="ltr" defaultValue={defaults.taxId ?? ""} />
      </Field>
      <Field label={`${t.legal.nationalId} (${t.common.optional})`}>
        <Input name="nationalId" dir="ltr" maxLength={30} defaultValue={defaults.nationalId ?? ""} />
      </Field>
      <Field label={t.common.address} className="sm:col-span-2">
        <Input name="address" defaultValue={defaults.address ?? ""} />
      </Field>
      <Field label={t.common.notes} className="sm:col-span-2">
        <Textarea name="notes" rows={2} defaultValue={defaults.notes ?? ""} />
      </Field>
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input type="checkbox" name="reminderOptOut" defaultChecked={!!defaults.reminderOptOut} className="size-4" />
        {t.v7.maintenance.optOutLabel}
      </label>
    </div>
  );
}
