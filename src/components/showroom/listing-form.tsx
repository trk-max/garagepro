"use client";

import { useRef, useTransition } from "react";
import { toast } from "sonner";
import { historyDraftAction } from "@/actions/showroom";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Field, NativeSelect, Textarea } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n/client";
import { CONDITIONS, FUELS, GEARBOXES, type Spec } from "@/lib/showroom";

type Result = { ok: true; data: { redirectTo?: string } | null } | { ok: false; error: string };

export type ListingDefaults = {
  make: string;
  model: string;
  version: string | null;
  year: number | null;
  mileage: number | null;
  fuel: string | null;
  gearbox: string | null;
  engineCc: number | null;
  powerHp: number | null;
  fiscalHp: number | null;
  doors: number | null;
  seats: number | null;
  colorExt: string | null;
  colorInt: string | null;
  condition: string | null;
  price: number | null;
  description: string | null;
  equipment: string[];
  specs: Spec[];
  historySummary: string | null;
  historyPublic: boolean;
  plate: string | null;
  vin: string | null;
  sellerId: string;
};

/** Create / edit form of a listing. Read-only (fieldset disabled) for people who cannot edit it. */
export function ListingForm({
  action,
  defaults,
  sellers,
  listingId,
  readOnly = false,
  submitLabel,
}: {
  action: (form: FormData) => Promise<Result>;
  defaults?: ListingDefaults;
  /** Only given to people who may reassign a listing (admin, showroom manager). */
  sellers?: { id: string; name: string }[];
  listingId?: string;
  readOnly?: boolean;
  submitLabel: string;
}) {
  const { t } = useI18n();
  const f = t.showroom.fields;
  const summary = useRef<HTMLTextAreaElement>(null);
  const [drafting, startDraft] = useTransition();
  const d = defaults;
  const num = (v: number | null | undefined) => (v == null ? "" : String(v));

  const fields = (
    <fieldset disabled={readOnly} className="contents">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={f.make}>
          <Input name="make" required maxLength={60} defaultValue={d?.make} />
        </Field>
        <Field label={f.model}>
          <Input name="model" required maxLength={60} defaultValue={d?.model} />
        </Field>
        <Field label={f.version}>
          <Input name="version" maxLength={80} defaultValue={d?.version ?? ""} />
        </Field>
        <Field label={f.price}>
          <Input name="price" inputMode="decimal" dir="ltr" defaultValue={d?.price != null ? String(d.price / 1000) : ""} />
        </Field>
        <Field label={f.year}>
          <Input name="year" type="number" min={1950} max={2100} dir="ltr" defaultValue={num(d?.year)} />
        </Field>
        <Field label={f.mileage}>
          <Input name="mileage" type="number" min={0} max={2000000} dir="ltr" defaultValue={num(d?.mileage)} />
        </Field>
        <Field label={f.fuel}>
          <NativeSelect name="fuel" defaultValue={d?.fuel ?? ""}>
            <option value="">—</option>
            {FUELS.map((v) => (
              <option key={v} value={v}>
                {t.fuel[v]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label={f.gearbox}>
          <NativeSelect name="gearbox" defaultValue={d?.gearbox ?? ""}>
            <option value="">—</option>
            {GEARBOXES.map((v) => (
              <option key={v} value={v}>
                {t.showroom.gearbox[v]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label={f.condition}>
          <NativeSelect name="condition" defaultValue={d?.condition ?? ""}>
            <option value="">—</option>
            {CONDITIONS.map((v) => (
              <option key={v} value={v}>
                {t.showroom.condition[v]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label={f.engineCc}>
          <Input name="engineCc" type="number" min={0} max={10000} dir="ltr" defaultValue={num(d?.engineCc)} />
        </Field>
        <Field label={f.powerHp}>
          <Input name="powerHp" type="number" min={0} max={2000} dir="ltr" defaultValue={num(d?.powerHp)} />
        </Field>
        <Field label={f.fiscalHp}>
          <Input name="fiscalHp" type="number" min={0} max={100} dir="ltr" defaultValue={num(d?.fiscalHp)} />
        </Field>
        <Field label={f.doors}>
          <Input name="doors" type="number" min={1} max={9} dir="ltr" defaultValue={num(d?.doors)} />
        </Field>
        <Field label={f.seats}>
          <Input name="seats" type="number" min={1} max={12} dir="ltr" defaultValue={num(d?.seats)} />
        </Field>
        <Field label={f.colorExt}>
          <Input name="colorExt" maxLength={40} defaultValue={d?.colorExt ?? ""} />
        </Field>
        <Field label={f.colorInt}>
          <Input name="colorInt" maxLength={40} defaultValue={d?.colorInt ?? ""} />
        </Field>
      </div>

      <Field label={f.description}>
        <Textarea name="description" maxLength={5000} rows={5} defaultValue={d?.description ?? ""} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={f.equipment}>
          <Textarea name="equipment" rows={6} maxLength={8000} defaultValue={d?.equipment.join("\n") ?? ""} />
        </Field>
        <Field label={f.specs} hint={t.showroom.hints.specs}>
          <Textarea name="specs" rows={6} maxLength={8000} defaultValue={d?.specs.map((s) => `${s.label} : ${s.value}`).join("\n") ?? ""} />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={f.plate} hint={t.showroom.hints.plate}>
          <Input name="plate" maxLength={20} dir="ltr" className="uppercase" defaultValue={d?.plate ?? ""} />
        </Field>
        <Field label={f.vin}>
          <Input name="vin" maxLength={40} dir="ltr" className="uppercase" defaultValue={d?.vin ?? ""} />
        </Field>
      </div>

      {sellers && (
        <Field label={f.seller}>
          <NativeSelect name="sellerId" defaultValue={d?.sellerId ?? ""}>
            {!d && <option value="">—</option>}
            {sellers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
      )}

      <div className="space-y-2 border border-dashed p-3">
        <Field label={f.historySummary} hint={t.showroom.hints.historySummary}>
          <Textarea ref={summary} name="historySummary" rows={4} maxLength={3000} defaultValue={d?.historySummary ?? ""} />
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" name="historyPublic" defaultChecked={d?.historyPublic ?? false} className="size-4" />
            {f.historyPublic}
          </label>
          {listingId && !readOnly && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              // Long label: wraps on phones instead of widening the page.
              className="h-auto min-h-8 max-w-full whitespace-normal py-1.5 text-start"
              disabled={drafting}
              onClick={() =>
                startDraft(async () => {
                  const r = await historyDraftAction(listingId);
                  if (!r.ok) return void toast.error(r.error);
                  if (!r.data.text) return void toast.info(t.showroom.staff.historyDraftEmpty);
                  if (summary.current) summary.current.value = r.data.text;
                  toast.success(t.showroom.staff.historyDraftDone);
                })
              }
            >
              {t.showroom.staff.historyDraft}
            </Button>
          )}
        </div>
      </div>
    </fieldset>
  );

  if (readOnly) return <div className="space-y-4">{fields}</div>;
  return (
    <ActionForm action={action} reset={false} className="space-y-4">
      {fields}
      <Button type="submit">{submitLabel}</Button>
    </ActionForm>
  );
}
