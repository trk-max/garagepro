"use client";

import { FuelType } from "@prisma/client";
import { completeVehicleAction } from "@/actions/work-orders";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Field, NativeSelect } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n/client";
import { VIN_PATTERN, type VehicleInfoField } from "@/lib/vehicle-info";

/** VIN input: 17 characters, spaces/dashes removed and uppercased while typing. */
export function VinInput({ name, defaultValue }: { name: string; defaultValue?: string }) {
  const { t } = useI18n();
  return (
    <Input
      name={name}
      required
      dir="ltr"
      className="font-mono uppercase"
      pattern={VIN_PATTERN}
      minLength={17}
      maxLength={17}
      title={t.customers.vinHint}
      defaultValue={defaultValue}
      onInput={(e) => (e.currentTarget.value = e.currentTarget.value.replace(/[\s-]/g, "").toUpperCase())}
    />
  );
}

export function FuelSelect({ name }: { name: string }) {
  const { t } = useI18n();
  return (
    <NativeSelect name={name} defaultValue="" required>
      <option value="" disabled>
        —
      </option>
      {Object.values(FuelType).map((f) => (
        <option key={f} value={f}>
          {t.fuel[f]}
        </option>
      ))}
    </NativeSelect>
  );
}

/** Inputs for the pieces of the vehicle file that are still missing (all required). */
export function MissingVehicleFields({ missing, prefix, vinDefault }: { missing: readonly string[]; prefix: string; vinDefault?: string }) {
  const { t } = useI18n();
  const req = ` (${t.customers.required})`;
  const has = (f: VehicleInfoField | "mileage") => missing.includes(f);
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {has("year") && (
        <Field label={t.customers.year + req}>
          <Input name={`${prefix}year`} type="number" required min={1950} max={2100} dir="ltr" />
        </Field>
      )}
      {has("fuel") && (
        <Field label={t.customers.fuel + req}>
          <FuelSelect name={`${prefix}fuel`} />
        </Field>
      )}
      {has("color") && (
        <Field label={t.customers.color + req}>
          <Input name={`${prefix}color`} required maxLength={40} />
        </Field>
      )}
      {has("mileage") && (
        <Field label={t.workOrders.mileageIn + req}>
          <Input name="mileageIn" type="number" required min={0} max={10_000_000} dir="ltr" />
        </Field>
      )}
      {has("vin") && (
        <Field label={t.customers.vin + req} hint={t.customers.vinHint} className="sm:col-span-3">
          <VinInput name={`${prefix}vin`} defaultValue={vinDefault} />
        </Field>
      )}
    </div>
  );
}

/**
 * Work order opened without the full vehicle file (e.g. from an online
 * booking): a banner asking for VIN, year, fuel, colour and mileage.
 */
export function VehicleCompletionCard({ workOrderId, missing, vinDefault }: { workOrderId: string; missing: string[]; vinDefault?: string }) {
  const { t } = useI18n();
  return (
    <ActionForm action={completeVehicleAction.bind(null, workOrderId)} reset={false} className="space-y-3 rounded-[18px] border border-brand-500/60 bg-gp-accent-tint/40 p-4">
      <p className="f-label text-gp-accent-ink">{t.customers.completeInfo}</p>
      <MissingVehicleFields missing={missing} prefix="f_" vinDefault={vinDefault} />
      <Button type="submit" size="sm">
        {t.common.save}
      </Button>
    </ActionForm>
  );
}
