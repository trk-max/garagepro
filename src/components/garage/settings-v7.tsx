import type { Setting } from "@prisma/client";
import { updateSettingsV7Action } from "@/actions/team";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, Field, NativeSelect } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ALERT_LIMITS } from "@/lib/alerts";
import type { Dictionary } from "@/lib/i18n/fr";

/** Settings added in V7: legal identity (certificates), time clock proof, labour billing basis, delay alerts. */
export function SettingsV7({ t, settings }: { t: Dictionary; settings: Setting }) {
  const s = t.v7.settingsV7;
  return (
    <Card>
      <ActionForm action={updateSettingsV7Action} reset={false} className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-3">
          <CardTitle>{s.legalTitle}</CardTitle>
          <Field label={s.legalName}>
            <Input name="legalName" maxLength={200} defaultValue={settings.legalName ?? ""} placeholder={settings.garageName} />
          </Field>
          <Field label={s.legalRepName}>
            <Input name="legalRepName" maxLength={120} defaultValue={settings.legalRepName ?? ""} />
          </Field>
          <Field label={s.legalRepTitle}>
            <Input name="legalRepTitle" maxLength={80} defaultValue={settings.legalRepTitle ?? ""} />
          </Field>
          <Field label={s.city}>
            <Input name="city" maxLength={80} defaultValue={settings.city ?? ""} />
          </Field>
        </div>
        <div className="space-y-3">
          <CardTitle>{s.clockTitle}</CardTitle>
          <Field label={s.clockMode}>
            <NativeSelect name="clockMode" defaultValue={settings.clockMode}>
              {(["CODE", "CODE_AND_NETWORK", "NETWORK"] as const).map((m) => (
                <option key={m} value={m}>
                  {s.clockModes[m]}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label={s.clockNetworks} hint={s.clockNetworksHint}>
            <Input name="clockNetworks" maxLength={500} defaultValue={settings.clockNetworks ?? ""} dir="ltr" placeholder="41.226.10.5" />
          </Field>
        </div>
        <div className="space-y-3">
          <CardTitle>{s.laborTitle}</CardTitle>
          <Field label={s.laborMode} hint={s.laborHint}>
            <NativeSelect name="laborBillingMode" defaultValue={settings.laborBillingMode}>
              {(["ELAPSED", "PERSON"] as const).map((m) => (
                <option key={m} value={m}>
                  {s.laborModes[m]}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </div>
        <div className="space-y-3 lg:col-span-3">
          <CardTitle>{s.alertsTitle}</CardTitle>
          <p className="text-xs text-muted-foreground">{s.alertsHint}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {(["alertOrderLateHours", "alertPartLateDays", "alertInsuranceDays"] as const).map((k) => (
              <Field key={k} label={s[k]}>
                <Input name={k} type="number" inputMode="numeric" required min={ALERT_LIMITS[k].min} max={ALERT_LIMITS[k].max} step={1} defaultValue={settings[k]} />
              </Field>
            ))}
          </div>
        </div>
        <div className="lg:col-span-3">
          <Button type="submit">{t.common.save}</Button>
        </div>
      </ActionForm>
    </Card>
  );
}
