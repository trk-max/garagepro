import type { BookableService, Setting } from "@prisma/client";
import { updateBookingSettingsAction, upsertServiceAction } from "@/actions/workshop";
import { ActionForm } from "@/components/action-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SwitchInput } from "@/components/ui/redesign/toggle";
import { parseOpeningHours } from "@/lib/booking";
import { formatMoney, type Lang } from "@/lib/format";
import type { Dictionary } from "@/lib/i18n/fr";

const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Monday first

function ServiceFields({ t, s }: { t: Dictionary; s?: BookableService }) {
  const b = t.bookingSettings;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label={b.serviceName}>
        <Input name="name" required defaultValue={s?.name} />
      </Field>
      <Field label={b.serviceNameAr}>
        <Input name="nameAr" dir="rtl" defaultValue={s?.nameAr ?? ""} />
      </Field>
      <Field label={b.description}>
        <Input name="description" defaultValue={s?.description ?? ""} />
      </Field>
      <Field label={b.descriptionAr}>
        <Input name="descriptionAr" dir="rtl" defaultValue={s?.descriptionAr ?? ""} />
      </Field>
      <Field label={b.duration}>
        <Input name="durationMin" type="number" min={10} max={600} step={5} required defaultValue={s?.durationMin ?? 60} dir="ltr" />
      </Field>
      <Field label={b.priceFrom}>
        <Input name="priceFrom" inputMode="decimal" dir="ltr" defaultValue={s?.priceFrom != null ? (s.priceFrom / 1000).toFixed(3) : ""} />
      </Field>
      <Field label="#">
        <Input name="position" type="number" min={0} max={999} defaultValue={s?.position ?? 0} dir="ltr" />
      </Field>
      <label className="flex items-center gap-2 self-end pb-2 text-sm">
        <input type="checkbox" name="isActive" defaultChecked={s?.isActive ?? true} className="size-4" /> {b.active}
      </label>
    </div>
  );
}

/** Online booking: on/off, capacity, slots, opening hours (updateBookingSettingsAction, manageSettings). Also on the appointments page. */
export function BookingHoursForm({ t, settings }: { t: Dictionary; settings: Setting }) {
  const b = t.bookingSettings;
  const hours = parseOpeningHours(settings.openingHours);
  return (
    <ActionForm action={updateBookingSettingsAction} reset={false} className="space-y-4">
      <SwitchInput name="bookingEnabled" defaultChecked={settings.bookingEnabled} label={b.enabled} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={b.capacity}>
          <Input name="bookingCapacity" type="number" min={1} max={50} required defaultValue={settings.bookingCapacity} dir="ltr" />
        </Field>
        <Field label={b.slotMinutes}>
          <Input name="bookingSlotMinutes" type="number" min={5} max={240} step={5} required defaultValue={settings.bookingSlotMinutes} dir="ltr" />
        </Field>
        <Field label={b.lead}>
          <Input name="bookingLeadMinutes" type="number" min={0} max={10080} step={15} required defaultValue={settings.bookingLeadMinutes} dir="ltr" />
        </Field>
        <Field label={b.horizon}>
          <Input name="bookingHorizonDays" type="number" min={1} max={120} required defaultValue={settings.bookingHorizonDays} dir="ltr" />
        </Field>
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">{b.hours}</legend>
        <div className="space-y-1.5">
          {WEEK_ORDER.map((d) => {
            const day = hours[String(d)];
            return (
              <div key={d} className="grid grid-cols-[4.5rem_auto_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2 rounded-full bg-gp-panel py-1 ps-3 pe-1 text-sm">
                <span>{b.days[d]}</span>
                <label className="flex items-center gap-1 text-xs text-muted-foreground">
                  <input type="checkbox" name={`closed_${d}`} defaultChecked={!day} className="size-4" /> {b.closed}
                </label>
                <Input type="time" name={`open_${d}`} defaultValue={day?.open ?? "08:00"} className="h-8 min-w-0 px-2 text-[13px]" dir="ltr" aria-label={`${b.days[d]} open`} />
                <Input type="time" name={`close_${d}`} defaultValue={day?.close ?? "17:00"} className="h-8 min-w-0 px-2 text-[13px]" dir="ltr" aria-label={`${b.days[d]} close`} />
              </div>
            );
          })}
        </div>
      </fieldset>
      <Button type="submit">{t.common.save}</Button>
    </ActionForm>
  );
}

export function BookingSettings({ t, lang, settings, services }: { t: Dictionary; lang: Lang; settings: Setting; services: BookableService[] }) {
  const b = t.bookingSettings;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardTitle>{b.title}</CardTitle>
        <BookingHoursForm t={t} settings={settings} />
      </Card>

      <Card>
        <CardTitle>{b.services}</CardTitle>
        {services.length === 0 && <p className="mb-3 text-sm text-muted-foreground">{b.noServices}</p>}
        <ul className="mb-4 divide-y text-sm">
          {services.map((s) => (
            <li key={s.id} className="py-2">
              <details>
                <summary className="flex cursor-pointer items-center gap-2">
                  <span className="flex-1 font-medium">
                    {lang === "ar" && s.nameAr ? s.nameAr : s.name}
                  </span>
                  <span className="text-xs text-muted-foreground">{s.durationMin} min</span>
                  <span className="text-xs text-muted-foreground" dir="ltr">
                    {s.priceFrom != null ? formatMoney(s.priceFrom, lang) : t.booking.onQuote}
                  </span>
                  {!s.isActive && <Badge variant="outline">{b.closed}</Badge>}
                </summary>
                <ActionForm action={upsertServiceAction.bind(null, s.id)} reset={false} className="mt-3 space-y-3">
                  <ServiceFields t={t} s={s} />
                  <Button type="submit" size="sm">
                    {t.common.save}
                  </Button>
                </ActionForm>
              </details>
            </li>
          ))}
        </ul>
        <details className="rounded-md border border-dashed p-3">
          <summary className="cursor-pointer text-sm font-medium">{b.newService}</summary>
          <ActionForm action={upsertServiceAction.bind(null, null)} className="mt-3 space-y-3">
            <ServiceFields t={t} />
            <Button type="submit">{t.common.create}</Button>
          </ActionForm>
        </details>
      </Card>
    </div>
  );
}
