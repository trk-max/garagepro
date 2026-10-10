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
import { FuelType } from "@prisma/client";

type Props = {
  /** Pre-selected customer (form opened from a customer page). */
  initialCustomer: CustomerOption | null;
  mechanics: { id: string; name: string }[];
  preset?: { vehicleId?: string };
};

const NEW = "__new";

export function CheckInForm({ initialCustomer, mechanics, preset }: Props) {
  const { t } = useI18n();
  const [customer, setCustomer] = useState<CustomerOption | null>(initialCustomer);
  const [vehicleId, setVehicleId] = useState(initialCustomer && preset?.vehicleId ? preset.vehicleId : NEW);
  const customerId = customer?.id ?? NEW;
  const vehicles = customer?.vehicles ?? [];
  const vehicle = vehicles.find((v) => v.id === vehicleId);

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
              <Field label={t.customers.plate}>
                <Input name="v_plate" required dir="ltr" className="uppercase" placeholder={t.customers.platePlaceholder} />
              </Field>
              <Field label={t.customers.make}>
                <Input name="v_make" required placeholder="Peugeot" />
              </Field>
              <Field label={t.customers.model}>
                <Input name="v_model" required placeholder="208" />
              </Field>
              <Field label={t.customers.year}>
                <Input name="v_year" type="number" min={1950} max={2100} dir="ltr" />
              </Field>
              <Field label={t.customers.fuel}>
                <NativeSelect name="v_fuel" defaultValue="">
                  <option value="">{t.common.none}</option>
                  {Object.values(FuelType).map((f) => (
                    <option key={f} value={f}>
                      {t.fuel[f]}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label={t.customers.vin}>
                <Input name="v_vin" dir="ltr" className="uppercase" />
              </Field>
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
            <Field label={t.workOrders.mileageIn} hint={vehicle?.mileage ? `${t.customers.mileage}: ${vehicle.mileage} km` : undefined}>
              <Input name="mileageIn" type="number" min={0} dir="ltr" />
            </Field>
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
          <Button type="submit" className="mt-2">
            {t.common.create}
          </Button>
        </div>
      </Card>
    </ActionForm>
  );
}
