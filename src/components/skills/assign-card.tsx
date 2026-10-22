import { CheckCircle2, ShieldAlert, UserCog } from "lucide-react";
import { ackWarningsAction, assignSkillsAction, orderSkillsAction, resetOrderSkillsAction } from "@/actions/skills";
import { ActionButton, ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, Field, NativeSelect } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Chip } from "@/components/ui/redesign/chip";
import { fmt, type Lang } from "@/lib/format";
import type { Dictionary } from "@/lib/i18n/fr";
import { can } from "@/lib/permissions";
import type { StaffUser } from "@/lib/session";
import type { RankedCandidate } from "@/lib/skills";
import type { AssignmentOptions, SkillRow } from "@/server/skills";
import { LevelChip, skillLabel, warningText } from "@/components/skills/skills-ui";

/** One line of the picker: name — level · presence · load. */
function optionLabel(c: RankedCandidate, t: Dictionary) {
  const a = t.v14.assign;
  const bits = [a.suggestionLabel[c.suggestion], c.onLeave ? a.onLeave : c.present ? a.present : a.absent, fmt(a.load, { n: c.activeOrders })];
  if (c.chronoRunning) bits.push(a.chrono);
  return `${c.name} — ${bits.join(" · ")}`;
}

/** « supervisé par … » badge (work order header, mobile workshop card). */
export function SupervisedBadge({ name, t }: { name: string; t: Dictionary }) {
  return (
    <Chip tone="accent">
      <UserCog className="size-3.5" aria-hidden /> {fmt(t.v14.assign.supervisedBy, { name })}
    </Chip>
  );
}

/**
 * V14 — assisted assignment: required skills (deduced, editable), mechanics sorted by level / leave /
 * presence / load, suggestion, supervisor, habilitation override (reason). The server checks again.
 */
export function SkillAssignCard({ o, skills, staff, t, lang, compact = false }: { o: AssignmentOptions; skills: SkillRow[]; staff: StaffUser; t: Dictionary; lang: Lang; compact?: boolean }) {
  const a = t.v14.assign;
  const nameOf = (id: string) => {
    const s = skills.find((x) => x.id === id);
    return s ? skillLabel(s, lang) : id;
  };
  const people = new Map(o.ranked.map((c) => [c.id, c]));
  const sug = o.suggestion;
  const defaultMechanic = o.mechanicId ?? sug?.mechanicId ?? "";
  const defaultSupervisor = o.supervisor?.id ?? (!o.mechanicId && sug?.supervisorId ? sug.supervisorId : "");
  const canOverride = can(staff, "overrideSkillBlock");
  const formId = `assign-${o.workOrderId}${compact ? "-m" : ""}`;

  return (
    <Card className={compact ? "border-0 p-0 shadow-none" : undefined}>
      {!compact && <CardTitle>{a.title}</CardTitle>}
      <div className="space-y-3 text-sm">
        <div>
          <p className="label-tech mb-1">
            {a.required}
            {o.manual && <span className="ms-2 text-xs normal-case text-muted-foreground">({a.manual})</span>}
          </p>
          {o.required.length === 0 ? (
            <p className="text-muted-foreground">{a.none}</p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {o.required.map((s) => {
                const d = o.deduced.find((x) => x.skillId === s.id);
                return (
                  <li key={s.id}>
                    <Chip tone={s.habilitationRequired ? "danger" : "neutral"}>
                      {s.habilitationRequired && <ShieldAlert className="size-3.5" aria-hidden />}
                      {skillLabel(s, lang)}
                      {!o.manual && d ? ` · ${d.via.map((v) => a.via[v]).join(", ")}` : ""}
                    </Chip>
                  </li>
                );
              })}
            </ul>
          )}
          {!o.final && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-muted-foreground">{a.edit}</summary>
              <ActionForm action={orderSkillsAction.bind(null, o.workOrderId)} reset={false} className="mt-2 space-y-2">
                <div className="grid gap-1 sm:grid-cols-2">
                  {skills
                    .filter((s) => s.isActive)
                    .map((s) => (
                      <label key={s.id} className="flex min-h-9 items-center gap-2">
                        <input type="checkbox" name="skillIds" value={s.id} defaultChecked={o.required.some((r) => r.id === s.id)} className="size-4" />
                        {skillLabel(s, lang)}
                      </label>
                    ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" size="sm" variant="secondary">
                    {a.saveSkills}
                  </Button>
                  {o.manual && (
                    <ActionButton type="button" size="sm" variant="ghost" action={resetOrderSkillsAction.bind(null, o.workOrderId)}>
                      {a.resetSkills}
                    </ActionButton>
                  )}
                </div>
              </ActionForm>
            </details>
          )}
        </div>

        {o.required.length > 0 && (
          <p className="rounded-md bg-muted px-3 py-2">
            {sug
              ? sug.supervisorId
                ? fmt(a.suggestionSupervised, { name: people.get(sug.mechanicId)?.name ?? "?", supervisor: people.get(sug.supervisorId)?.name ?? "?" })
                : fmt(a.suggestion, { name: people.get(sug.mechanicId)?.name ?? "?" })
              : a.noSuggestion}
          </p>
        )}

        {!o.final && (
          <ActionForm action={assignSkillsAction.bind(null, o.workOrderId)} reset={false} className="grid gap-3 sm:grid-cols-2">
            <Field label={a.mechanic}>
              <NativeSelect name="mechanicId" defaultValue={defaultMechanic} id={`${formId}-m`}>
                <option value="">{a.unassigned}</option>
                {o.ranked.map((c) => (
                  <option key={c.id} value={c.id}>
                    {optionLabel(c, t)}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label={a.supervisor}>
              <NativeSelect name="supervisorId" defaultValue={defaultSupervisor} id={`${formId}-s`}>
                <option value="">{a.noSupervisor}</option>
                {o.ranked.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            {canOverride && o.required.some((s) => s.habilitationRequired) && (
              <Field label={a.override} hint={a.overrideHint} className="sm:col-span-2">
                <Input name="overrideReason" maxLength={500} autoComplete="off" />
              </Field>
            )}
            <div className="sm:col-span-2">
              <Button type="submit" className="h-11 w-full sm:w-auto">
                {a.assign}
              </Button>
            </div>
          </ActionForm>
        )}

        {o.warnings.length > 0 && (
          <div className={o.warningsAcked ? "border p-3" : "border border-amber-500/40 bg-amber-500/10 p-3"}>
            <p className="font-medium">{a.warnings}</p>
            <ul className="mt-1 list-disc ps-5">
              {o.warnings.map((w, i) => (
                <li key={i}>{warningText(w, t, nameOf)}</li>
              ))}
            </ul>
            {o.override && <p className="mt-1 text-xs">{fmt(a.overrideDone, { reason: o.override.reason ?? "" })}</p>}
            {o.warningsAcked ? (
              <p className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
                <CheckCircle2 className="size-3.5" aria-hidden /> {a.acked}
              </p>
            ) : (
              can(staff, "manageSkills") && (
                <ActionButton size="sm" variant="outline" className="mt-2" action={ackWarningsAction.bind(null, o.workOrderId)}>
                  {a.ack}
                </ActionButton>
              )
            )}
          </div>
        )}

        {!compact && o.required.length > 0 && (
          <div>
            <p className="label-tech mb-1">{a.candidates}</p>
            <ul className="divide-y">
              {o.ranked.slice(0, 12).map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-2 py-2">
                  <span className="font-medium">{c.name}</span>
                  {c.suggestion === "BLOCKED" ? <Chip tone="danger">{a.suggestionLabel.BLOCKED}</Chip> : <LevelChip level={c.worst} t={t} />}
                  {c.suggestion === "ASSISTANT" && <Chip tone="neutral">{a.suggestionLabel.ASSISTANT}</Chip>}
                  <span className="text-xs text-muted-foreground">
                    {c.onLeave ? a.onLeave : c.present ? a.present : a.absent} · {fmt(a.load, { n: c.activeOrders })}
                    {c.chronoRunning ? ` · ${a.chrono}` : ""}
                  </span>
                  {c.supervisors.length > 0 && (
                    <span className="w-full text-xs text-muted-foreground">{fmt(a.supervisors, { names: c.supervisors.slice(0, 3).map((s) => s.name).join(", ") })}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        {!compact && <p className="text-xs text-muted-foreground">{a.planning}</p>}
      </div>
    </Card>
  );
}
