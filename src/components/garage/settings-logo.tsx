import type { Setting } from "@prisma/client";
import { removeLogoAction, saveLogoAction } from "@/actions/branding";
import { ActionButton, ActionForm } from "@/components/action-form";
import { DocLogo } from "@/components/garage/doc-brand";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { Dictionary } from "@/lib/i18n/fr";

/** Paramètres → logo of the printed documents (invoices, quotes, orders, certificates). */
export function SettingsLogo({ t, settings }: { t: Dictionary; settings: Setting }) {
  const b = t.v7.branding;
  return (
    <Card>
      <CardTitle>{b.title}</CardTitle>
      <p className="mb-3 text-xs text-muted-foreground">{b.hint}</p>
      <div className="paper mb-3 inline-block rounded-md border bg-white p-3">
        <DocLogo logo={settings.logoDataUrl} name={settings.garageName} />
        <p className="text-[0.6875rem] text-zinc-500">{settings.logoDataUrl ? b.current : b.default}</p>
      </div>
      <ActionForm action={saveLogoAction} className="flex flex-wrap items-end gap-3">
        <Field label={b.file}>
          <Input name="logo" type="file" accept="image/png,image/jpeg,image/webp" required />
        </Field>
        <Button type="submit">{b.upload}</Button>
        {settings.logoDataUrl && (
          <ActionButton variant="ghost" action={removeLogoAction}>
            {b.remove}
          </ActionButton>
        )}
      </ActionForm>
    </Card>
  );
}
