import type { Setting } from "@prisma/client";
import { updateReminderSettingsAction } from "@/actions/reminders";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, Field, Textarea } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { Dictionary } from "@/lib/i18n/fr";
import { DEFAULT_TEMPLATES } from "@/server/reminders";

/** Paramètres → Rappels et alertes: delays, thresholds and message templates. */
export function SettingsReminders({ t, settings }: { t: Dictionary; settings: Setting }) {
  const r = t.v7.reminderSettings;
  return (
    <Card>
      <CardTitle>{r.title}</CardTitle>
      <p className="mb-3 text-xs text-muted-foreground">{r.intro}</p>
      <ActionForm action={updateReminderSettingsAction} reset={false} className="grid gap-3 sm:grid-cols-3">
        <Field label={r.leadDays}>
          <Input name="reminderLeadDays" type="number" min={0} max={60} required defaultValue={settings.reminderLeadDays} />
        </Field>
        <Field label={r.stuckDays}>
          <Input name="alertStuckDays" type="number" min={1} max={90} required defaultValue={settings.alertStuckDays} />
        </Field>
        <Field label={r.riskHours}>
          <Input name="alertDeliveryRiskHours" type="number" min={1} max={168} required defaultValue={settings.alertDeliveryRiskHours} />
        </Field>
        {(
          [
            ["tplMaintenance", r.tplMaintenance, DEFAULT_TEMPLATES.MAINTENANCE, settings.tplMaintenance],
            ["tplAppointment", r.tplAppointment, DEFAULT_TEMPLATES.APPOINTMENT, settings.tplAppointment],
            ["tplDelivery", r.tplDelivery, DEFAULT_TEMPLATES.DELIVERY, settings.tplDelivery],
          ] as const
        ).map(([name, label, placeholder, value]) => (
          <Field key={name} label={label} className="sm:col-span-3">
            <Textarea name={name} rows={2} maxLength={500} placeholder={placeholder} defaultValue={value ?? ""} />
          </Field>
        ))}
        <p className="text-xs text-muted-foreground sm:col-span-3">{r.variables}</p>
        <div className="sm:col-span-3">
          <Button type="submit">{t.common.save}</Button>
        </div>
      </ActionForm>
    </Card>
  );
}
