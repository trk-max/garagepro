import type { Setting } from "@prisma/client";
import { updateCashAlertSettingsAction } from "@/actions/cash";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, Field, NativeSelect } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SCENARIO_LIST } from "@/lib/cash-forecast";
import type { Dictionary } from "@/lib/i18n/fr";

/** Paramètres → cash alert: threshold (0 = off) and the scenario it is checked on. */
export function SettingsCash({ t, settings }: { t: Dictionary; settings: Setting }) {
  const v = t.v7.cash;
  return (
    <Card>
      <CardTitle>{v.settingsTitle}</CardTitle>
      <p className="mb-3 text-xs text-muted-foreground">{v.settingsIntro}</p>
      <ActionForm action={updateCashAlertSettingsAction} reset={false} className="grid gap-3 sm:grid-cols-3">
        <Field label={v.threshold}>
          <Input name="cashAlertThreshold" inputMode="decimal" required dir="ltr" defaultValue={(settings.cashAlertThreshold / 1000).toFixed(3)} />
        </Field>
        <Field label={v.alertScenario}>
          <NativeSelect name="cashAlertScenario" defaultValue={settings.cashAlertScenario}>
            {SCENARIO_LIST.map((s) => (
              <option key={s} value={s}>
                {v.scenarios[s]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <div className="flex items-end">
          <Button type="submit">{t.common.save}</Button>
        </div>
      </ActionForm>
    </Card>
  );
}
