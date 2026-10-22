import { PaymentMethod } from "@prisma/client";
import { Field, NativeSelect, Textarea } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { Dictionary } from "@/lib/i18n/fr";
import { BODY_ZONES, FUEL_LEVELS, PARTS_ORIGINS } from "@/lib/repair-order";

export type IntakeDefaults = {
  fuelLevel?: number | null;
  partsOrigin?: string | null;
  bodyChecklist?: unknown;
  bodyDamageNotes?: string | null;
  estimateTtc?: number | null;
  depositAmount?: number | null;
  depositMethod?: string | null;
  customerNationalId?: string | null;
};

const dt = (m: number | null | undefined) => (m ? (m / 1000).toFixed(3) : "");

/**
 * V10.6 — repair order details (check-in form and work order page): fuel level, body condition
 * (optional checklist + free text), parts origin agreed, estimate, deposit and the customer's CIN.
 * Plain fields: used inside a client form (check-in) and a server page (work order).
 */
export function IntakeFields({ t, defaults = {}, disabled = false }: { t: Dictionary; defaults?: IntakeDefaults; disabled?: boolean }) {
  const l = t.legal.intake;
  const zones = Array.isArray(defaults.bodyChecklist) ? (defaults.bodyChecklist as string[]) : [];
  return (
    <fieldset disabled={disabled} className="grid gap-3 sm:grid-cols-2">
      <Field label={l.fuelLevel}>
        <NativeSelect name="fuelLevel" defaultValue={defaults.fuelLevel ? String(defaults.fuelLevel) : ""}>
          <option value="">{l.fuelUnknown}</option>
          {FUEL_LEVELS.map((q) => (
            <option key={q} value={q}>
              {q}/4
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label={l.partsOrigin}>
        <NativeSelect name="partsOrigin" defaultValue={defaults.partsOrigin ?? ""}>
          <option value="">{l.partsOriginNone}</option>
          {PARTS_ORIGINS.map((o) => (
            <option key={o} value={o}>
              {l.origins[o]}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <div className="sm:col-span-2">
        <p className="mb-1.5 text-sm font-medium">{l.body}</p>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm sm:grid-cols-3">
          {BODY_ZONES.map((z) => (
            <label key={z} className="flex items-center gap-2">
              <input type="checkbox" name="bodyChecklist" value={z} defaultChecked={zones.includes(z)} className="size-4" />
              {l.bodyZones[z]}
            </label>
          ))}
        </div>
      </div>
      <Field label={l.bodyNotes} className="sm:col-span-2">
        <Textarea name="bodyDamageNotes" rows={2} maxLength={2000} defaultValue={defaults.bodyDamageNotes ?? ""} />
      </Field>
      <Field label={l.estimate} hint={l.estimateHint}>
        <Input name="estimateTtc" inputMode="decimal" dir="ltr" defaultValue={dt(defaults.estimateTtc)} />
      </Field>
      <Field label={`${t.legal.nationalId} (${t.common.optional})`}>
        <Input name="customerNationalId" dir="ltr" maxLength={30} defaultValue={defaults.customerNationalId ?? ""} />
      </Field>
      <Field label={l.deposit} hint={l.depositHint}>
        <Input name="depositAmount" inputMode="decimal" dir="ltr" defaultValue={dt(defaults.depositAmount)} />
      </Field>
      <Field label={l.depositMethod}>
        <NativeSelect name="depositMethod" defaultValue={defaults.depositMethod ?? "CASH"}>
          {Object.values(PaymentMethod).map((m) => (
            <option key={m} value={m}>
              {t.paymentMethod[m]}
            </option>
          ))}
        </NativeSelect>
      </Field>
    </fieldset>
  );
}
