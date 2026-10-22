import Link from "next/link";
import { saveSkillAction, saveSkillSettingsAction, starterSkillsAction } from "@/actions/skills";
import { ActionButton, ActionForm } from "@/components/action-form";
import { skillLabel } from "@/components/skills/skills-ui";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, Field, PageHeader, Textarea } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { getI18n } from "@/lib/i18n/server";
import { requirePageAccess } from "@/lib/session";
import { stringList } from "@/lib/skills";
import { packageOptions } from "@/server/admin";
import { getSettings } from "@/server/settings";
import { listSkills, type SkillRow } from "@/server/skills";

/** V14 — catalogue (fr / ar / en, keywords, packages, rules, public labels) and the skills settings. */
export default async function SkillSettingsPage() {
  await requirePageAccess("manageSkills");
  const [{ t, lang }, skills, packages, settings] = await Promise.all([getI18n(), listSkills(), packageOptions(), getSettings()]);
  const v = t.v14;
  const s = v.settings;

  const form = (k: SkillRow | null) => (
    <ActionForm action={saveSkillAction} reset={!k} className="grid gap-3 sm:grid-cols-2">
      {k && <input type="hidden" name="id" value={k.id} />}
      <Field label={s.code} hint={k ? undefined : s.codeHint}>
        <Input name="code" required pattern="[A-Za-z0-9_\-]{1,30}" maxLength={30} defaultValue={k?.code ?? ""} readOnly={!!k} dir="ltr" />
      </Field>
      <Field label={s.position}>
        <Input type="number" name="position" min={0} max={10000} defaultValue={k?.position ?? (skills.length + 1) * 10} inputMode="numeric" />
      </Field>
      <Field label={s.nameFr}>
        <Input name="nameFr" required minLength={2} maxLength={80} defaultValue={k?.nameFr ?? ""} />
      </Field>
      <Field label={s.nameAr}>
        <Input name="nameAr" maxLength={80} defaultValue={k?.nameAr ?? ""} dir="rtl" />
      </Field>
      <Field label={s.nameEn}>
        <Input name="nameEn" maxLength={80} defaultValue={k?.nameEn ?? ""} />
      </Field>
      <Field label={s.keywords} hint={s.keywordsHint}>
        <Input name="keywords" maxLength={1000} defaultValue={k ? stringList(k.keywords).join(", ") : ""} />
      </Field>
      <Field label={s.description} className="sm:col-span-2">
        <Textarea name="description" rows={2} maxLength={500} defaultValue={k?.description ?? ""} />
      </Field>
      {packages.length > 0 && (
        <fieldset className="sm:col-span-2">
          <legend className="mb-1 text-sm font-medium">{s.packages}</legend>
          <div className="grid gap-1 sm:grid-cols-2">
            {packages.map((p) => (
              <label key={p.id} className="flex min-h-9 items-center gap-2 text-sm">
                <input type="checkbox" name="packageIds" value={p.id} defaultChecked={k ? stringList(k.packageIds).includes(p.id) : false} className="size-4" />
                {p.name}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <label className="flex items-start gap-2 text-sm sm:col-span-2">
        <input type="checkbox" name="supervisionRequired" defaultChecked={k?.supervisionRequired ?? false} className="mt-0.5 size-4" /> {s.supervisionRequired}
      </label>
      <label className="flex items-start gap-2 text-sm sm:col-span-2">
        <input type="checkbox" name="habilitationRequired" defaultChecked={k?.habilitationRequired ?? false} className="mt-0.5 size-4" /> {s.habilitationRequired}
      </label>
      <Field label={`${s.publicLabel} — FR`} hint={s.publicLabelHint}>
        <Input name="publicLabelFr" maxLength={120} defaultValue={k?.publicLabelFr ?? ""} />
      </Field>
      <Field label={`${s.publicLabel} — AR`}>
        <Input name="publicLabelAr" maxLength={120} defaultValue={k?.publicLabelAr ?? ""} dir="rtl" />
      </Field>
      <Field label={`${s.publicLabel} — EN`}>
        <Input name="publicLabelEn" maxLength={120} defaultValue={k?.publicLabelEn ?? ""} />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isActive" defaultChecked={k?.isActive ?? true} className="size-4" /> {s.active}
      </label>
      <div className="sm:col-span-2">
        <Button type="submit">{s.save}</Button>
      </div>
    </ActionForm>
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <PageHeader title={s.title}>
        <Link href="/garage/competences" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          {v.sheet.back}
        </Link>
      </PageHeader>

      <Card>
        <CardTitle>{s.rules}</CardTitle>
        <ActionForm action={saveSkillSettingsAction} reset={false} className="grid gap-3">
          <Field label={s.reminderDays}>
            <Input type="number" name="certReminderDays" min={0} max={365} defaultValue={settings.skillCertReminderDays} className="w-32" inputMode="numeric" />
          </Field>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="supervisorVerifies" defaultChecked={settings.skillSupervisorVerifies} className="mt-0.5 size-4" /> {s.supervisorVerifies}
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="publicLabels" defaultChecked={settings.skillPublicLabels} className="mt-0.5 size-4" />
            <span>
              {s.publicLabels}
              <span className="block text-xs text-muted-foreground">{s.publicLabelsHint}</span>
            </span>
          </label>
          <div>
            <Button type="submit">{s.save}</Button>
          </div>
        </ActionForm>
      </Card>

      <Card>
        <CardTitle>{s.catalogue}</CardTitle>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <ActionButton variant="outline" action={starterSkillsAction}>
            {s.starter}
          </ActionButton>
          <p className="min-w-60 flex-1 text-xs text-muted-foreground">{s.starterHint}</p>
        </div>
        <ul className="divide-y">
          {skills.map((k) => (
            <li key={k.id} className="py-2">
              <details>
                <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm">
                  <span className="font-mono text-xs text-muted-foreground">{k.code}</span>
                  <span className="font-medium">{skillLabel(k, lang)}</span>
                  {k.habilitationRequired && <span className="text-xs text-red-700 dark:text-red-400">{s.habilitationRequired.split("(")[0]}</span>}
                  {!k.isActive && <span className="text-xs text-muted-foreground">({t.common.deactivate})</span>}
                </summary>
                <div className="mt-3">{form(k)}</div>
              </details>
            </li>
          ))}
        </ul>
        <details className="mt-4 border-t pt-3">
          <summary className="cursor-pointer text-sm font-medium">{s.new}</summary>
          <div className="mt-3">{form(null)}</div>
        </details>
      </Card>
    </div>
  );
}
