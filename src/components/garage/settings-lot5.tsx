import type { Setting } from "@prisma/client";
import { saveLot5SettingsAction, saveTemplateAction } from "@/actions/lot5";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, Field, Textarea } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { fmt } from "@/lib/format";
import type { Dictionary } from "@/lib/i18n/fr";
import { parseQualityPoints } from "@/lib/lot5";

type Template = { id: string; name: string; isActive: boolean; points: { key: string; label: string }[] };

/**
 * V16 Lot 5 — Paramètres: quality check points on top of the 6 fixed ones, satisfaction survey, refused work
 * reminders (Parcours atelier); inspection templates (permission manageInspections).
 */
export function SettingsLot5({ t, settings, templates, canTemplates }: { t: Dictionary; settings: Setting; templates: Template[]; canTemplates: boolean }) {
  const s = t.v16.lot5.settings;
  const tp = t.v16.lot5.templates;
  const points = parseQualityPoints(settings.qualityPoints);
  return (
    <>
      <Card id="qualite" data-testid="settings-lot5">
        <CardTitle>{t.v7.quality.title}</CardTitle>
        <ActionForm action={saveLot5SettingsAction} reset={false} className="grid gap-3">
          <Field label={s.qualityPoints} hint={s.qualityPointsHint}>
            <Textarea name="qualityPoints" rows={4} maxLength={3000} defaultValue={points.map((p) => p.label).join("\n")} />
          </Field>
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" name="autoSatisfactionSurvey" defaultChecked={settings.autoSatisfactionSurvey} className="mt-0.5 size-4" />
            <span>{s.survey}</span>
          </label>
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" name="autoRefusedLineReminders" defaultChecked={settings.autoRefusedLineReminders} className="mt-0.5 size-4" />
            <span>{s.refusedReminders}</span>
          </label>
          <div>
            <Button type="submit">{t.common.save}</Button>
          </div>
        </ActionForm>
      </Card>

      {canTemplates && (
        <Card id="inspections" data-testid="settings-inspections">
          <CardTitle>{tp.title}</CardTitle>
          <p className="mb-3 text-sm text-muted-foreground">{tp.intro}</p>
          <div className="space-y-3">
            {templates.map((x) => (
              <details key={x.id} className="rounded-[14px] border border-gp-line px-3 py-2">
                <summary className="cursor-pointer text-sm font-medium">
                  {x.name} · {fmt(tp.count, { n: x.points.length })} · {x.isActive ? tp.active : tp.inactive}
                </summary>
                <TemplateForm t={t} template={x} />
              </details>
            ))}
            <details className="rounded-[14px] border border-dashed border-gp-line px-3 py-2">
              <summary className="cursor-pointer text-sm font-medium">{tp.add}</summary>
              <TemplateForm t={t} />
            </details>
          </div>
        </Card>
      )}
    </>
  );
}

function TemplateForm({ t, template }: { t: Dictionary; template?: Template }) {
  const tp = t.v16.lot5.templates;
  return (
    <ActionForm action={saveTemplateAction} reset={!template} className="mt-2 grid gap-2">
      {template && <input type="hidden" name="id" value={template.id} />}
      <Field label={tp.name}>
        <Input name="name" required maxLength={120} defaultValue={template?.name ?? ""} />
      </Field>
      <Field label={tp.points}>
        <Textarea name="points" required rows={6} maxLength={4000} defaultValue={template?.points.map((p) => p.label).join("\n") ?? ""} />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isActive" defaultChecked={template?.isActive ?? true} className="size-4" /> {tp.active}
      </label>
      <div>
        <Button type="submit" size="sm">
          {tp.save}
        </Button>
      </div>
    </ActionForm>
  );
}
