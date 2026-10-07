import { FuelType } from "@prisma/client";
import { Field, NativeSelect } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { Dictionary } from "@/lib/i18n/fr";

/** Shared vehicle inputs. `prefix` lets them live inside a bigger form (check-in). */
export function VehicleFields({ t, prefix = "", required = true }: { t: Dictionary; prefix?: string; required?: boolean }) {
  const n = (name: string) => `${prefix}${name}`;
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Field label={t.customers.plate}>
        <Input name={n("plate")} placeholder={t.customers.platePlaceholder} required={required} dir="ltr" className="uppercase" />
      </Field>
      <Field label={t.customers.make}>
        <Input name={n("make")} placeholder="Peugeot" required={required} />
      </Field>
      <Field label={t.customers.model}>
        <Input name={n("model")} placeholder="208" required={required} />
      </Field>
      <Field label={t.customers.year}>
        <Input name={n("year")} type="number" min={1950} max={2100} dir="ltr" />
      </Field>
      <Field label={t.customers.fuel}>
        <NativeSelect name={n("fuel")} defaultValue="">
          <option value="">{t.common.none}</option>
          {Object.values(FuelType).map((f) => (
            <option key={f} value={f}>
              {t.fuel[f]}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label={t.customers.color}>
        <Input name={n("color")} />
      </Field>
      <Field label={t.customers.vin} className="sm:col-span-2">
        <Input name={n("vin")} dir="ltr" className="uppercase" />
      </Field>
      <Field label={t.customers.mileage}>
        <Input name={n("mileage")} type="number" min={0} dir="ltr" />
      </Field>
    </div>
  );
}
