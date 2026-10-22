import Link from "next/link";
import { redirect } from "next/navigation";
import { Download, Settings, ShieldAlert } from "lucide-react";
import { CertChip, LevelDot, skillLabel, warningText } from "@/components/skills/skills-ui";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, Field, NativeSelect, PageHeader } from "@/components/ui/field";
import { fmt, formatDate, woNumber } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getStaff } from "@/lib/session";
import { isSkillLevel, SKILL_LEVELS, type SkillWarning } from "@/lib/skills";
import { evaluateGoals, expiringCertificates, SKILL_TODO_WHERE, skillMatrix } from "@/server/skills";

type PageProps = { searchParams: Promise<{ skill?: string; level?: string; verify?: string; q?: string }> };

/** V14 — Équipe › Compétences: matrix employees × skills, gaps, certificates to renew, warnings, re-evaluations. */
export default async function SkillsPage({ searchParams }: PageProps) {
  const staff = await getStaff();
  if (!staff) redirect("/login");
  if (!can(staff, "viewSkills")) redirect("/garage/competences/moi");
  const now = new Date();
  // Goals reached since the last visit → « à réévaluer » (never a level change).
  await evaluateGoals(undefined, now).catch(() => 0);
  const manage = can(staff, "manageSkills");
  const [{ t, lang }, sp, m, expiring, warned, reviews] = await Promise.all([
    getI18n(),
    searchParams,
    skillMatrix(staff, now),
    expiringCertificates(now),
    manage
      ? prisma.workOrder.findMany({ where: SKILL_TODO_WHERE.warnings, orderBy: { skillWarningsAt: "desc" }, take: 50, select: { id: true, number: true, skillWarnings: true, mechanic: { select: { name: true } }, vehicle: { select: { plate: true } } } })
      : [],
    prisma.skillReviewRequest.findMany({ where: SKILL_TODO_WHERE.reviews, orderBy: { createdAt: "asc" }, take: 50, include: { user: { select: { name: true } }, skill: { select: { nameFr: true, nameAr: true, nameEn: true } } } }),
  ]);
  const v = t.v14;
  const nameOf = (id: string) => {
    const s = m.skills.find((x) => x.id === id);
    return s ? skillLabel(s, lang) : id;
  };
  const skillFilter = m.skills.find((s) => s.id === sp.skill) ?? null;
  const levelFilter = sp.level === "NONE" ? "NONE" : isSkillLevel(sp.level) ? sp.level : null;
  const q = (sp.q ?? "").trim().toLowerCase();
  const columns = skillFilter ? [skillFilter] : m.skills.filter((s) => s.isActive);
  const rows = m.rows.filter((r) => {
    if (q && !r.name.toLowerCase().includes(q)) return false;
    if (sp.verify === "1" && !(skillFilter ? r.toVerify.includes(skillFilter.id) : r.toVerify.length > 0)) return false;
    if (levelFilter) {
      const ids = columns.map((c) => c.id);
      return ids.some((id) => (levelFilter === "NONE" ? !r.levels[id] : r.levels[id] === levelFilter));
    }
    return true;
  });

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <PageHeader title={v.title}>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <a href="/api/skills/matrix">
              <Download className="size-4" aria-hidden /> {v.matrix.exportCsv}
            </a>
          </Button>
          {manage && (
            <Button asChild variant="outline" size="sm">
              <Link href="/garage/competences/reglages">
                <Settings className="size-4" aria-hidden /> {v.settingsLink}
              </Link>
            </Button>
          )}
          <Button asChild variant="ghost" size="sm">
            <Link href="/garage/competences/moi">{v.sheet.myLink}</Link>
          </Button>
        </div>
      </PageHeader>
      <p className="max-w-3xl text-sm text-muted-foreground">{v.intro}</p>

      {m.skills.length === 0 ? (
        <Card>
          <p className="text-sm">{v.matrix.empty}</p>
          {manage && (
            <Link href="/garage/competences/reglages" className="mt-2 inline-block text-sm underline underline-offset-4">
              {v.matrix.emptyHint}
            </Link>
          )}
        </Card>
      ) : (
        <>
          {/* Gaps */}
          <Card>
            <CardTitle>{v.matrix.gaps}</CardTitle>
            {m.gaps.length === 0 ? (
              <p className="text-sm text-muted-foreground">{v.matrix.noGap}</p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {m.gaps.map((g) => (
                  <li key={g.skillId} className="border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm">
                    <p className="font-medium">{fmt(v.matrix.gapLine, { skill: nameOf(g.skillId) })}</p>
                    <p className="text-xs text-muted-foreground">{fmt(v.matrix.gapDetail, { supervised: g.supervised, training: g.training })}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Matrix */}
          <Card>
            <CardTitle>{v.matrix.title}</CardTitle>
            <form method="get" className="mb-4 flex flex-wrap items-end gap-3">
              <Field label={v.matrix.employee}>
                <input name="q" defaultValue={sp.q ?? ""} className="h-9 w-44 rounded-md border bg-background px-2 text-sm" />
              </Field>
              <Field label={v.matrix.skill}>
                <NativeSelect name="skill" defaultValue={skillFilter?.id ?? ""} className="w-48">
                  <option value="">{v.matrix.all}</option>
                  {m.skills.map((s) => (
                    <option key={s.id} value={s.id}>
                      {skillLabel(s, lang)}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label={v.matrix.level}>
                <NativeSelect name="level" defaultValue={levelFilter ?? ""} className="w-44">
                  <option value="">{v.matrix.allLevels}</option>
                  {SKILL_LEVELS.map((l) => (
                    <option key={l} value={l}>
                      {v.levels[l]}
                    </option>
                  ))}
                  <option value="NONE">{v.noLevel}</option>
                </NativeSelect>
              </Field>
              <label className="flex h-9 items-center gap-2 text-sm">
                <input type="checkbox" name="verify" value="1" defaultChecked={sp.verify === "1"} className="size-4" /> {v.matrix.toVerifyOnly}
              </label>
              <Button type="submit" variant="outline">
                {v.matrix.apply}
              </Button>
              <Link href="/garage/competences" className="self-center text-sm text-muted-foreground underline-offset-4 hover:underline">
                {v.matrix.reset}
              </Link>
            </form>
            <p className="mb-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
              {SKILL_LEVELS.map((l) => (
                <span key={l} className="inline-flex items-center gap-1">
                  <LevelDot level={l} t={t} /> {v.levels[l]}
                </span>
              ))}
              <span className="inline-flex items-center gap-1">
                <ShieldAlert className="size-3.5 text-amber-600" aria-hidden /> {v.toVerifyHint}
              </span>
            </p>
            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">{v.matrix.noEmployee}</p>
            ) : (
              <>
                {/* Phone: one card per employee. */}
                <ul className="space-y-3 md:hidden">
                  {rows.map((r) => (
                    <li key={r.id} className="border p-3">
                      <Link href={`/garage/competences/${r.id}`} className="font-medium underline-offset-4 hover:underline">
                        {r.name}
                      </Link>
                      <span className="ms-2 text-xs text-muted-foreground">{r.jobTitle ?? t.roles[r.role]}</span>
                      <ul className="mt-2 grid grid-cols-1 gap-1.5">
                        {columns.map((s) => (
                          <li key={s.id} className="flex items-center gap-2 text-sm">
                            <LevelDot level={r.levels[s.id]} t={t} toVerify={r.toVerify.includes(s.id)} />
                            <span className="min-w-0 flex-1 truncate">{skillLabel(s, lang)}</span>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
                {/* Tablet / PC: table. */}
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr>
                        <th className="sticky start-0 bg-card p-2 text-start font-medium">{v.matrix.employee}</th>
                        {columns.map((s) => (
                          <th key={s.id} className="min-w-20 p-2 text-center text-xs font-medium" title={s.description ?? undefined}>
                            {skillLabel(s, lang)}
                            {s.habilitationRequired && <ShieldAlert className="ms-1 inline size-3 text-red-600" aria-hidden />}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.id} className="border-t">
                          <td className="sticky start-0 bg-card p-2">
                            <Link href={`/garage/competences/${r.id}`} className="font-medium underline-offset-4 hover:underline">
                              {r.name}
                            </Link>
                            <span className="block text-xs text-muted-foreground">{r.jobTitle ?? t.roles[r.role]}</span>
                          </td>
                          {columns.map((s) => (
                            <td key={s.id} className="p-2 text-center">
                              <LevelDot level={r.levels[s.id]} t={t} toVerify={r.toVerify.includes(s.id)} />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </Card>
        </>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Certificates to renew */}
        <Card id="certificats" className="scroll-mt-20">
          <CardTitle>{v.matrix.certificates}</CardTitle>
          {expiring.length === 0 ? (
            <p className="text-sm text-muted-foreground">{v.matrix.noCertificate}</p>
          ) : (
            <ul className="divide-y text-sm">
              {expiring.map((c) => {
                const state = c.expiresOn && c.expiresOn.getTime() + 86_400_000 <= now.getTime() ? "EXPIRED" : "EXPIRING";
                return (
                  <li key={c.id} className="flex flex-wrap items-center gap-2 py-2">
                    <Link href={`/garage/competences/${c.userId}`} className="font-medium underline-offset-4 hover:underline">
                      {c.user.name}
                    </Link>
                    <span>{c.type}</span>
                    {c.skillId && <span className="text-xs text-muted-foreground">{nameOf(c.skillId)}</span>}
                    <span className="ms-auto inline-flex items-center gap-2">
                      <CertChip state={state} t={t} />
                      {c.expiresOn && <span className="text-xs">{fmt(v.cert.expires, { date: formatDate(c.expiresOn, lang, "UTC") })}</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* Re-evaluations requested / goals reached */}
        <Card id="reevaluations" className="scroll-mt-20">
          <CardTitle>{v.matrix.reviews}</CardTitle>
          {reviews.length === 0 ? (
            <p className="text-sm text-muted-foreground">{v.matrix.noReview}</p>
          ) : (
            <ul className="divide-y text-sm">
              {reviews.map((r) => (
                <li key={r.id} className="py-2">
                  <Link href={`/garage/competences/${r.userId}#reevaluations`} className="font-medium underline-offset-4 hover:underline">
                    {r.user.name}
                  </Link>{" "}
                  · {v.sheet.reviewSource[r.source as "EMPLOYEE" | "GOAL"] ?? r.source}
                  {r.skill && <span className="text-muted-foreground"> · {skillLabel(r.skill, lang)}</span>}
                  {r.message && <p className="mt-1 border-s-2 ps-2 text-xs">{r.message}</p>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {manage && (
        <Card id="avertissements" className="scroll-mt-20">
          <CardTitle>{v.matrix.warnings}</CardTitle>
          {warned.length === 0 ? (
            <p className="text-sm text-muted-foreground">{v.matrix.noWarning}</p>
          ) : (
            <ul className="divide-y text-sm">
              {warned.map((w) => (
                <li key={w.id} className="py-2">
                  <Link href={`/garage/work-orders/${w.id}`} className="font-mono underline-offset-4 hover:underline">
                    {woNumber(w.number)}
                  </Link>{" "}
                  <span className="text-muted-foreground">{w.vehicle.plate}</span> · {w.mechanic?.name ?? t.workOrders.unassigned}
                  <ul className="mt-1 list-disc ps-5 text-xs">
                    {((Array.isArray(w.skillWarnings) ? w.skillWarnings : []) as SkillWarning[]).map((x, i) => (
                      <li key={i}>{warningText(x, t, nameOf)}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}
