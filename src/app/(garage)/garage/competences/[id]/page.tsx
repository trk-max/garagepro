import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { FileText } from "lucide-react";
import { addGoalAction, closeGoalAction, closeReviewAction, requestReviewAction, setLevelAction, voidCertificateAction } from "@/actions/skills";
import { ActionButton, ActionForm } from "@/components/action-form";
import { CertificateForm } from "@/components/skills/certificate-form";
import { CertChip, LevelChip, skillLabel } from "@/components/skills/skills-ui";
import { ReasonButton } from "@/components/team/prompt-action";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, Field, NativeSelect, PageHeader } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { minutesToHours } from "@/lib/attendance";
import { fmt, formatDate, formatDateTime } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { getStaff } from "@/lib/session";
import { GOAL_KINDS, isSkillLevel, SKILL_LEVELS } from "@/lib/skills";
import { canSeeSkillsOf, employeeSkillSheet, evaluateGoals } from "@/server/skills";

type PageProps = { params: Promise<{ id: string }>; searchParams: Promise<{ p?: string }> };

const PERIODS = ["90", "365", "all"] as const;

/**
 * V14 — one employee's skills: levels (+ change with a reason), history, certificates, goals, read-only
 * indices, re-evaluation requests. The person himself sees his own sheet read-only; viewSkills sees all.
 */
export default async function EmployeeSkillsPage({ params, searchParams }: PageProps) {
  const staff = await getStaff();
  if (!staff) redirect("/login");
  const [{ id }, sp, { t, lang }] = await Promise.all([params, searchParams, getI18n()]);
  if (!canSeeSkillsOf(staff, id)) notFound();
  const period = (PERIODS as readonly string[]).includes(sp.p ?? "") ? (sp.p as (typeof PERIODS)[number]) : "365";
  const now = new Date();
  await evaluateGoals(id, now).catch(() => 0);
  const from = period === "all" ? null : new Date(now.getTime() - Number(period) * 86_400_000);
  const sheet = await employeeSkillSheet(staff, id, { from, now }).catch(() => null);
  if (!sheet) notFound();
  const v = t.v14;
  const self = staff.id === id;
  const manage = can(staff, "manageSkills") && (!self || staff.role === "ADMIN");
  const nameOf = (skillId: string | null) => {
    const s = skillId ? sheet.skills.find((x) => x.id === skillId) : null;
    return s ? skillLabel(s, lang) : "—";
  };
  const levelName = (l: string | null) => (l && isSkillLevel(l) ? v.levels[l] : v.noLevel);
  const active = sheet.skills.filter((s) => s.isActive || sheet.levels[s.id]);
  const indices = active.map((s) => ({ s, i: sheet.indices[s.id]! })).filter((x) => x.i.jobs > 0);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <PageHeader title={sheet.user.name}>
        <span className="text-sm text-muted-foreground">{sheet.user.jobTitle ?? t.roles[sheet.user.role]}</span>
        {can(staff, "viewSkills") && (
          <Link href="/garage/competences" className="ms-auto text-sm text-muted-foreground underline-offset-4 hover:underline">
            {v.sheet.back}
          </Link>
        )}
      </PageHeader>
      {self && <p className="border bg-muted px-3 py-2 text-sm">{v.sheet.selfHint}</p>}

      {/* Levels */}
      <Card>
        <CardTitle>{v.sheet.levels}</CardTitle>
        {active.length === 0 ? (
          <p className="text-sm text-muted-foreground">{v.matrix.empty}</p>
        ) : (
          <ul className="divide-y text-sm">
            {active.map((s) => {
              const level = sheet.levels[s.id];
              return (
                <li key={s.id} className="py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="min-w-40 flex-1 font-medium">{skillLabel(s, lang)}</span>
                    <LevelChip level={level} t={t} />
                    {sheet.toVerify.includes(s.id) && <span className="text-xs font-medium text-amber-700 dark:text-amber-400">{v.toVerify}</span>}
                  </div>
                  {manage && (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-xs text-muted-foreground">{v.sheet.change}</summary>
                      <ActionForm action={setLevelAction.bind(null, id)} className="mt-2 grid gap-2 sm:grid-cols-[12rem_1fr_auto] sm:items-end">
                        <input type="hidden" name="skillId" value={s.id} />
                        <Field label={v.matrix.level}>
                          <NativeSelect name="level" defaultValue={level ?? "AUTONOMOUS"}>
                            {SKILL_LEVELS.map((l) => (
                              <option key={l} value={l}>
                                {v.levels[l]}
                              </option>
                            ))}
                          </NativeSelect>
                        </Field>
                        <Field label={v.sheet.reason}>
                          <Input name="reason" required minLength={3} maxLength={500} placeholder={v.sheet.reasonPlaceholder} />
                        </Field>
                        <Button type="submit" size="sm" className="h-9">
                          {v.sheet.saveLevel}
                        </Button>
                      </ActionForm>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {self && !manage && can(staff, "manageSkills") && <p className="mt-2 text-xs text-muted-foreground">{v.sheet.notOwn}</p>}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Certificates */}
        <Card id="certificats" className="scroll-mt-20">
          <CardTitle>{v.cert.title}</CardTitle>
          {sheet.certificates.length === 0 ? (
            <p className="text-sm text-muted-foreground">{v.cert.none}</p>
          ) : (
            <ul className="divide-y text-sm">
              {sheet.certificates.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-2 py-2">
                  <span className="font-medium">{c.type}</span>
                  <CertChip state={c.state} t={t} />
                  <span className="w-full text-xs text-muted-foreground">
                    {[c.issuer, c.skillId ? nameOf(c.skillId) : null, c.issuedOn ? formatDate(c.issuedOn, lang, "UTC") : null, c.expiresOn ? fmt(v.cert.expires, { date: formatDate(c.expiresOn, lang, "UTC") }) : v.cert.noExpiry].filter(Boolean).join(" · ")}
                  </span>
                  {c.voidReason && <span className="w-full text-xs">{fmt(v.cert.voided, { reason: c.voidReason })}</span>}
                  {c.hasFile && (
                    <a href={`/api/skills/certificates/${c.id}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-xs underline underline-offset-4">
                      <FileText className="size-3.5" aria-hidden /> {v.cert.view}
                    </a>
                  )}
                  {manage && c.state !== "VOID" && (
                    <ReasonButton className="ms-auto h-7" question={v.cert.voidQuestion} action={voidCertificateAction.bind(null, c.id, id)}>
                      {v.cert.void}
                    </ReasonButton>
                  )}
                </li>
              ))}
            </ul>
          )}
          {manage && (
            <details className="mt-4 border-t pt-3">
              <summary className="cursor-pointer text-sm font-medium">{v.cert.add}</summary>
              <div className="mt-3">
                <CertificateForm userId={id} skills={sheet.skills.filter((s) => s.isActive).map((s) => ({ id: s.id, name: skillLabel(s, lang) }))} />
              </div>
            </details>
          )}
        </Card>

        {/* Goals */}
        <Card>
          <CardTitle>{v.goal.title}</CardTitle>
          <p className="mb-2 text-xs text-muted-foreground">{v.goal.hint}</p>
          {sheet.goals.length === 0 ? (
            <p className="text-sm text-muted-foreground">{v.goal.none}</p>
          ) : (
            <ul className="divide-y text-sm">
              {sheet.goals.map((g) => (
                <li key={g.id} className="flex flex-wrap items-center gap-2 py-2">
                  <span className="min-w-0 flex-1">{fmt(v.goal.line, { target: g.target, kind: v.goal.kind[g.kind as keyof typeof v.goal.kind] ?? g.kind, skill: nameOf(g.skillId) })}</span>
                  <span className="font-semibold tabular-nums">{fmt(v.goal.progress, { count: g.progress.count, target: g.target })}</span>
                  <span className={g.status === "REACHED" ? "text-xs font-medium text-emerald-700 dark:text-emerald-400" : "text-xs text-muted-foreground"}>{v.goal.status[g.status as keyof typeof v.goal.status] ?? g.status}</span>
                  {manage && g.status !== "CLOSED" && (
                    <ActionButton size="sm" variant="ghost" className="h-7" action={closeGoalAction.bind(null, g.id, id)}>
                      {v.goal.close}
                    </ActionButton>
                  )}
                  <span className="w-full text-xs text-muted-foreground">
                    {v.goal.since} {formatDate(g.since, lang)}
                    {g.note ? ` · ${g.note}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {manage && (
            <details className="mt-4 border-t pt-3">
              <summary className="cursor-pointer text-sm font-medium">{v.goal.add}</summary>
              <ActionForm action={addGoalAction.bind(null, id)} className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label={v.matrix.skill}>
                  <NativeSelect name="skillId" required defaultValue="">
                    <option value="" disabled>
                      —
                    </option>
                    {sheet.skills
                      .filter((s) => s.isActive)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {skillLabel(s, lang)}
                        </option>
                      ))}
                  </NativeSelect>
                </Field>
                <Field label={v.goal.target}>
                  <Input type="number" name="target" min={1} max={500} required defaultValue={5} inputMode="numeric" />
                </Field>
                <Field label={v.goal.title} className="sm:col-span-2">
                  <NativeSelect name="kind" defaultValue="SUPERVISED_NO_RETURN">
                    {GOAL_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {v.goal.kind[k]}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field label={v.goal.since}>
                  <Input type="date" name="since" />
                </Field>
                <Field label={v.goal.note}>
                  <Input name="note" maxLength={300} />
                </Field>
                <div>
                  <Button type="submit">{v.goal.add}</Button>
                </div>
              </ActionForm>
            </details>
          )}
        </Card>
      </div>

      {/* Indices (read-only) */}
      <Card>
        <CardTitle>{v.sheet.indices}</CardTitle>
        <p className="mb-3 text-xs text-muted-foreground">{v.sheet.indicesHint}</p>
        <nav className="mb-3 flex flex-wrap gap-1 text-sm" aria-label={v.sheet.period}>
          {PERIODS.map((p) => (
            <Link key={p} href={`?p=${p}`} className={p === period ? "f-label border border-foreground px-2 py-1.5 text-[0.625rem]" : "f-label border px-2 py-1.5 text-[0.625rem] hover:border-foreground"}>
              {v.sheet.periods[p]}
            </Link>
          ))}
        </nav>
        {indices.length === 0 ? (
          <p className="text-sm text-muted-foreground">{v.sheet.noJobs}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th className="p-2 text-start font-medium">{v.matrix.skill}</th>
                  <th className="p-2 text-end font-medium">{v.sheet.jobs}</th>
                  <th className="p-2 text-end font-medium">{v.sheet.hours}</th>
                  <th className="p-2 text-end font-medium">{v.sheet.returns}</th>
                  <th className="p-2 text-end font-medium">{v.sheet.supervised}</th>
                </tr>
              </thead>
              <tbody>
                {indices.map(({ s, i }) => (
                  <tr key={s.id} className="border-t">
                    <td className="p-2">{skillLabel(s, lang)}</td>
                    <td className="p-2 text-end tabular-nums">{i.jobs}</td>
                    <td className="p-2 text-end tabular-nums">{minutesToHours(i.minutes).toLocaleString("fr-FR")} h</td>
                    <td className="p-2 text-end tabular-nums">{i.returns}</td>
                    <td className="p-2 text-end tabular-nums">{i.supervised}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* History */}
        <Card>
          <CardTitle>{v.sheet.history}</CardTitle>
          {sheet.history.length === 0 ? (
            <p className="text-sm text-muted-foreground">{v.sheet.noHistory}</p>
          ) : (
            <ul className="max-h-96 divide-y overflow-y-auto text-sm">
              {sheet.history.map((h) => (
                <li key={h.id} className="py-2">
                  <p>
                    <span className="font-medium">{nameOf(h.skillId)}</span> : {fmt(v.sheet.historyLine, { from: levelName(h.fromLevel), to: levelName(h.toLevel) })}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(h.createdAt, lang)} · {fmt(v.sheet.by, { name: h.actorName })}
                  </p>
                  <p className="mt-0.5 border-s-2 ps-2 text-xs">{h.reason}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Re-evaluation requests */}
        <Card id="reevaluations" className="scroll-mt-20">
          <CardTitle>{v.sheet.reviews}</CardTitle>
          {sheet.reviews.length === 0 ? (
            <p className="text-sm text-muted-foreground">{v.sheet.noReviews}</p>
          ) : (
            <ul className="divide-y text-sm">
              {sheet.reviews.map((r) => (
                <li key={r.id} className="py-2">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{v.sheet.reviewSource[r.source as "EMPLOYEE" | "GOAL"] ?? r.source}</span>
                    {r.skillId && <span className="text-muted-foreground">{nameOf(r.skillId)}</span>}
                    <span className="ms-auto text-xs">{v.sheet.reviewStatus[r.status as "OPEN" | "DONE"] ?? r.status}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(r.createdAt, lang)}</p>
                  {r.message && <p className="mt-1 border-s-2 ps-2 text-xs">{r.message}</p>}
                  {r.handledNote && <p className="mt-1 text-xs">→ {r.handledNote}</p>}
                  {manage && r.status === "OPEN" && (
                    <ActionForm action={closeReviewAction.bind(null, r.id, id)} className="mt-2 flex flex-wrap gap-2">
                      <Input name="note" maxLength={300} placeholder={v.sheet.reviewNote} className="min-w-40 flex-1" />
                      <Button type="submit" size="sm" variant="outline" className="h-9">
                        {v.sheet.closeReview}
                      </Button>
                    </ActionForm>
                  )}
                </li>
              ))}
            </ul>
          )}
          {self && (
            <details className="mt-4 border-t pt-3" open={sheet.reviews.length === 0}>
              <summary className="cursor-pointer text-sm font-medium">{v.sheet.requestReview}</summary>
              <ActionForm action={requestReviewAction} className="mt-3 grid gap-3">
                <Field label={v.sheet.anySkill}>
                  <NativeSelect name="skillId" defaultValue="">
                    <option value="">—</option>
                    {sheet.skills
                      .filter((s) => s.isActive)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {skillLabel(s, lang)}
                        </option>
                      ))}
                  </NativeSelect>
                </Field>
                <Field label={v.sheet.message}>
                  <Input name="message" required minLength={3} maxLength={500} />
                </Field>
                <div>
                  <Button type="submit">{v.sheet.send}</Button>
                </div>
              </ActionForm>
            </details>
          )}
        </Card>
      </div>
    </div>
  );
}
