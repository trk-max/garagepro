import type { Setting } from "@prisma/client";
import { updateWarrantySettingsAction } from "@/actions/warranties";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { Dictionary } from "@/lib/i18n/fr";

/** Paramètres → automatic repair warranty at delivery (0 / 0 = off). */
export function SettingsWarranty({ t, settings }: { t: Dictionary; settings: Setting }) {
  const v = t.v7.warranty;
  return (
    <Card>
      <CardTitle>{v.settingsTitle}</CardTitle>
      <p className="mb-3 text-xs text-muted-foreground">{v.settingsIntro}</p>
      <ActionForm action={updateWarrantySettingsAction} reset={false} className="grid gap-3 sm:grid-cols-3">
        <Field label={v.settingsMonths}>
          <Input name="warrantyMonths" type="number" min={0} max={120} required dir="ltr" defaultValue={settings.warrantyMonths} />
        </Field>
        <Field label={v.settingsKm}>
          <Input name="warrantyKm" type="number" min={0} max={1000000} required dir="ltr" defaultValue={settings.warrantyKm} />
        </Field>
        <div className="flex items-end">
          <Button type="submit">{t.common.save}</Button>
        </div>
      </ActionForm>
    </Card>
  );
}
