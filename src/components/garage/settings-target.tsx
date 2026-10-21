import type { Setting } from "@prisma/client";
import { updateMonthlyTargetAction } from "@/actions/dashboard";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { Dictionary } from "@/lib/i18n/fr";

/** Paramètres → monthly revenue target shown on the dashboard (0 = none). */
export function SettingsTarget({ t, settings }: { t: Dictionary; settings: Setting }) {
  const v = t.v7.monthlyTarget;
  return (
    <Card>
      <CardTitle>{v.title}</CardTitle>
      <p className="mb-3 text-xs text-muted-foreground">{v.intro}</p>
      <ActionForm action={updateMonthlyTargetAction} reset={false} className="grid gap-3 sm:grid-cols-3">
        <Field label={v.amount}>
          <Input name="monthlyRevenueTarget" inputMode="decimal" required dir="ltr" defaultValue={(settings.monthlyRevenueTarget / 1000).toFixed(3)} />
        </Field>
        <div className="flex items-end">
          <Button type="submit">{t.common.save}</Button>
        </div>
      </ActionForm>
    </Card>
  );
}
