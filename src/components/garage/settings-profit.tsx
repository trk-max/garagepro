import type { Setting } from "@prisma/client";
import { updateProfitSettingsAction } from "@/actions/profit";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, Field, NativeSelect } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { Dictionary } from "@/lib/i18n/fr";

/** Paramètres → Rentabilité: the garage's labour cost per hour and the overhead method. */
export function SettingsProfit({ t, settings }: { t: Dictionary; settings: Setting }) {
  const v = t.v7.profit;
  const value =
    settings.overheadMode === "PERCENT_REVENUE" ? String(settings.overheadValue / 100) : settings.overheadMode === "PER_LABOR_HOUR" ? (settings.overheadValue / 1000).toFixed(3) : "0";
  return (
    <Card>
      <CardTitle>{v.settingsTitle}</CardTitle>
      <p className="mb-3 text-xs text-muted-foreground">{v.settingsIntro}</p>
      <ActionForm action={updateProfitSettingsAction} reset={false} className="grid gap-3 sm:grid-cols-3">
        <Field label={v.laborCostPerHour} hint={v.laborCostHint}>
          <Input name="laborCostPerHour" inputMode="decimal" dir="ltr" defaultValue={(settings.laborCostPerHour / 1000).toFixed(3)} />
        </Field>
        <Field label={v.overheadMode}>
          <NativeSelect name="overheadMode" defaultValue={settings.overheadMode}>
            {(["NONE", "PERCENT_REVENUE", "PER_LABOR_HOUR"] as const).map((m) => (
              <option key={m} value={m}>
                {v.overheadModes[m]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label={v.overheadValue} hint={v.overheadValueHint}>
          <Input name="overheadValue" inputMode="decimal" dir="ltr" defaultValue={value} />
        </Field>
        <div className="sm:col-span-3">
          <Button type="submit">{t.common.save}</Button>
        </div>
      </ActionForm>
    </Card>
  );
}
