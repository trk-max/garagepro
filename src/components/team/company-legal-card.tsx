import type { Setting } from "@prisma/client";
import { updateCompanyLegalAction } from "@/actions/team";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, Field, Textarea } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { Dictionary } from "@/lib/i18n/fr";

/** Équipe: the company's identity printed on work certificates (only real, typed data). */
export function CompanyLegalCard({ t, settings }: { t: Dictionary; settings: Setting }) {
  const s = t.v7.settingsV7;
  return (
    <Card>
      <CardTitle>{s.legalTitle}</CardTitle>
      <p className="mb-3 text-xs text-muted-foreground">{s.legalIntro}</p>
      <ActionForm action={updateCompanyLegalAction} reset={false} className="grid gap-3 sm:grid-cols-2">
        <Field label={s.legalName}>
          <Input name="legalName" maxLength={200} defaultValue={settings.legalName ?? ""} placeholder={settings.garageName} />
        </Field>
        <Field label={s.legalCapital} hint={s.optionalHint}>
          <Input name="legalCapital" maxLength={60} defaultValue={settings.legalCapital ?? ""} placeholder="50 000 DT" />
        </Field>
        <Field label={s.legalAddress} hint={s.legalAddressHint} className="sm:col-span-2">
          <Textarea name="legalAddress" rows={2} maxLength={300} defaultValue={settings.legalAddress ?? ""} placeholder={settings.address ?? ""} />
        </Field>
        <Field label={s.city}>
          <Input name="city" maxLength={80} defaultValue={settings.city ?? ""} />
        </Field>
        <div />
        <Field label={s.registryNumber} hint={s.optionalHint}>
          <Input name="registryNumber" maxLength={60} defaultValue={settings.registryNumber ?? ""} dir="ltr" />
        </Field>
        <Field label={s.registryCity} hint={s.registryCityHint}>
          <Input name="registryCity" maxLength={80} defaultValue={settings.registryCity ?? ""} />
        </Field>
        <Field label={s.legalRepName}>
          <Input name="legalRepName" maxLength={120} defaultValue={settings.legalRepName ?? ""} />
        </Field>
        <Field label={s.legalRepTitle}>
          <Input name="legalRepTitle" maxLength={80} defaultValue={settings.legalRepTitle ?? ""} />
        </Field>
        <p className="text-xs text-muted-foreground sm:col-span-2">{s.taxIdHint}</p>
        <div className="sm:col-span-2">
          <Button type="submit">{t.common.save}</Button>
        </div>
      </ActionForm>
    </Card>
  );
}
