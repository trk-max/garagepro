"use client";

import { useState } from "react";
import { Priority } from "@prisma/client";
import { createWorkOrderAction } from "@/actions/work-orders";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, Field, NativeSelect, Textarea } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { displayPlate } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";
import type { CustomerOption } from "@/server/customers";
import { CustomerPicker } from "@/components/garage/customer-picker";
import { missingVehicleInfo } from "@/lib/vehicle-info";
import { FuelSelect, MissingVehicleFields, VinInput } from "@/components/garage/vehicle-completion";
import { IntakeFields } from "@/components/garage/intake-fields";

type Props = {
  /** Pre-selected customer (form opened from a customer page). */
  initialCustomer: CustomerOption | null;
  mechanics: { id: string; name: string }[];
  preset?: { vehicleId?: string; plate?: string };
  /** V16 Lot 3 — diagnostic fee of Paramètres, formatted (null = none): proposed, box ticked by default. */
  diagnosticFee?: string | null;
};

const NEW = "__new";

export function CheckInForm({ initialCustomer, mechanics, preset, diagnosticFee }: Props) {
  const { t } = useI18n();
  const [customer, setCustomer] = useState<CustomerOption | null>(initialCustomer);
  const [vehicleId, setVehicleId] = useState(initialCustomer && preset?.vehicleId ? preset.vehicleId : NEW);
  const customerId = customer?.id ?? NEW;
  const vehicles = customer?.vehicles ?? [];
  const vehicle = vehicles.find((v) => v.id === vehicleId);
  // Known car with an incomplete file: the missing pieces must be typed now.
  const missing = vehicle ? missingVehicleInfo(vehicle) : [];
  // V16 Lot 4: a mileage lower than the car's last reading is never saved without an explicit confirmation.
  const [km, setKm] = useState("");
  const lower = !!vehicle?.mileage && km !== "" && Number(km) < vehicle.mileage;
  const req = ` (${t.customers.required})`;

  return (
    <ActionForm action={createWorkOrderAction} reset={false} silent className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardTitle>{t.workOrders.customer}</CardTitle>
        <div className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">{t.workOrders.selectCustomer}</span>
          <input type="hidden" name="customerId" value={customer?.id ?? ""} />
          <CustomerPicker
            value={customer}
            onChange={(c) => {
              setCustomer(c);
              setVehicleId(NEW);
            }}
          />
        </div>

        {customerId === NEW && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label={t.common.name}>
              <Input name="c_name" required />
            </Field>
            <Field label={t.common.phone}>
              <Input name="c_phone" type="tel" required dir="ltr" placeholder="+216 …" />
            </Field>
            <Field label={`${t.common.email} (${t.common.optional})`} className="sm:col-span-2">
              <Input name="c_email" type="email" dir="ltr" />
            </Field>
          </div>
        )}

        <div className="mt-5">
          <CardTitle>{t.workOrders.vehicle}</CardTitle>
          {customerId !== NEW && (
            <Field label={t.workOrders.selectVehicle}>
              <NativeSelect name="vehicleId" value={vehicleId === NEW ? "" : vehicleId} onChange={(e) => setVehicleId(e.target.value || NEW)}>
                <option value="">{t.workOrders.orNewVehicle}</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {displayPlate(v.plate)} · {v.make} {v.model}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          )}
          {vehicleId === NEW && (
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <Field label={t.customers.plate + req}>
                <Input name="v_plate" required dir="ltr" className="uppercase" placeholder={t.customers.platePlaceholder} defaultValue={preset?.plate} />
              </Field>
              <Field label={t.customers.make + req}>
                <Input name="v_make" required placeholder="Peugeot" />
              </Field>
              <Field label={t.customers.model + req}>
                <Input name="v_model" required placeholder="208" />
              </Field>
              <Field label={t.customers.year + req}>
                <Input name="v_year" type="number" required min={1950} max={2100} dir="ltr" />
              </Field>
              <Field label={t.customers.fuel + req}>
                <FuelSelect name="v_fuel" />
              </Field>
              <Field label={t.customers.color + req}>
                <Input name="v_color" required maxLength={40} />
              </Field>
              <Field label={t.customers.vin + req} hint={t.customers.vinHint} className="sm:col-span-3">
                <VinInput name="v_vin" />
              </Field>
            </div>
          )}
          {vehicle && missing.length > 0 && (
            <div className="mt-4 border-s-2 border-brand-500 ps-3">
              <p className="f-label text-brand-500">{t.customers.completeInfo}</p>
              <div className="mt-3">
                <MissingVehicleFields missing={missing} prefix="f_" vinDefault={vehicle.vin ?? undefined} />
              </div>
            </div>
          )}
        </div>
      </Card>

      <Card>
        <CardTitle>{t.workOrders.createTitle}</CardTitle>
        <div className="grid gap-3">
          <Field label={t.workOrders.complaint}>
            <Textarea name="complaint" required placeholder={t.workOrders.complaintPlaceholder} rows={4} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t.workOrders.mileageIn + req} hint={vehicle?.mileage ? `${t.customers.mileage}: ${vehicle.mileage} km` : undefined}>
              <Input name="mileageIn" type="number" required min={0} max={10_000_000} dir="ltr" value={km} onChange={(e) => setKm(e.target.value)} />
            </Field>
            {lower && (
              <label className="flex items-start gap-2 rounded-[14px] bg-gp-accent-tint px-3 py-2 text-sm text-gp-accent-ink sm:col-span-2" data-testid="mileage-confirm">
                <input type="checkbox" name="confirmLowerMileage" required className="mt-0.5 size-4" />
                {t.v16.lot4.intake.mileageConfirm.replace("{km}", String(vehicle!.mileage))}
              </label>
            )}
            <Field label={t.workOrders.promisedAt}>
              <Input name="promisedAt" type="datetime-local" min="2000-01-01T00:00" max="2100-12-31T23:59" dir="ltr" />
            </Field>
            <Field label={t.workOrders.priority}>
              <NativeSelect name="priority" defaultValue="NORMAL">
                {Object.values(Priority).map((p) => (
                  <option key={p} value={p}>
                    {t.priority[p]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label={t.workOrders.mechanic}>
              <NativeSelect name="mechanicId" defaultValue="">
                <option value="">{t.workOrders.unassigned}</option>
                {mechanics.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
          {/* V10.6 — printed on the repair order (prise en charge) signed by the customer. */}
          <details className="rounded-[14px] border border-gp-line p-3">
            <summary className="cursor-pointer text-sm font-medium">{t.legal.intake.title}</summary>
            <p className="mb-3 mt-1 text-xs text-muted-foreground">{t.legal.intake.intro}</p>
            <IntakeFields t={t} />
          </details>
          {diagnosticFee && (
            <label className="flex items-start gap-2 rounded-[14px] border border-gp-line p-3 text-sm">
              <input type="checkbox" name="diagnosticFee" defaultChecked className="mt-0.5 size-4" />
              {t.v16.lot3.refusal.diagnosticAccept.replace("{amount}", diagnosticFee)}
            </label>
          )}
          <Button type="submit" className="mt-2">
            {t.common.create}
          </Button>
        </div>
      </Card>
    </ActionForm>
  );
}
