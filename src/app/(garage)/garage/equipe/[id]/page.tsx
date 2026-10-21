import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, FileText } from "lucide-react";
import { correctPunchAction, issueCertificateAction, updateEmployeeProfileAction, voidPunchAction } from "@/actions/team";
import { ActionForm } from "@/components/action-form";
import { PrintButton } from "@/components/garage/print-button";
import { LeaveBadge } from "@/components/team/badges";
import { ReasonButton } from "@/components/team/prompt-action";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, Field, NativeSelect, PageHeader, Table, Td, Th } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { utcToZoned, zonedToUtc, addDays } from "@/lib/booking";
import { minutesToHours } from "@/lib/attendance";
import { fmt, formatDate, formatDateTime, formatTime, woNumber } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { isIsoDay, monthRange, yearRange } from "@/lib/periods";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { requirePageAccess } from "@/lib/session";
import { cn } from "@/lib/utils";
import { listCertificates } from "@/server/certificates";
import { getSettings } from "@/server/settings";
import { employeeReport } from "@/server/team-reports";
import { listPunches } from "@/server/timeclock";
import { LeaveBalanceLine } from "@/components/team/leave-balance";
import { getLeaveBalance } from "@/server/leaves";
import { setHourlyCostAction } from "@/actions/profit";

type PageProps = { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string; to?: string }> };

const h = (m: number) => `${minutesToHours(m).toLocaleString("fr-FR")} h`;

/** Employee file: profile, period report (presence, repairs, leave), punches + corrections, certificates. */
export default async function EmployeePage({ params, searchParams }: PageProps) {
  const staff = await requirePageAccess("manageTeam");
  const [{ id }, sp, settings, { t, lang }] = await Promise.all([params, searchParams, getSettings(), getI18n()]);
  const tz = settings.timezone;
  const month = monthRange(tz);
  const fromDay = isIsoDay(sp.from) ? sp.from : month.from;
  const toDay = isIsoDay(sp.to) && sp.to >= fromDay ? sp.to : month.to;
  const from = zonedToUtc(fromDay, "00:00", tz);
  const to = zonedToUtc(addDays(toDay, 1), "00:00", tz);

  const [employee, report, punches, certificates, balance] = await Promise.all([
    prisma.user.findUnique({ where: { id }, select: { id: true, name: true, role: true, isActive: true, jobTitle: true, hireDate: true, nationalId: true, annualLeaveDays: true, hourlyCost: true } }),
    employeeReport(id, from, to),
    listPunches(id, from, to),
    listCertificates(id),
    getLeaveBalance(id),
  ]);
  if (!employee || !report) notFound();
  const v = t.v7;
  const last = monthRange(tz, -1);
  const year = yearRange(tz);
  const companyReady = settings.legalName || settings.garageName;
  const canFix = employee.id !== staff.id || staff.role === "ADMIN";
  const nowLocal = utcToZoned(new Date(), tz);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <PageHeader title={employee.name}>
        <span className="text-sm text-muted-foreground">{employee.jobTitle ?? t.roles[employee.role]}</span>
      </PageHeader>

      {/* Period */}
      <Card className="print:hidden">
        <form className="flex flex-wrap items-end gap-3" method="get">
          <Field label={v.leave.from}>
            <Input type="date" name="from" defaultValue={fromDay} />
          </Field>
          <Field label={v.leave.to}>
            <Input type="date" name="to" defaultValue={toDay} />
          </Field>
          <Button type="submit" variant="outline">
            {v.team.show}
          </Button>
          <nav className="flex flex-wrap gap-1 text-sm">
            {[
              [v.team.thisMonth, month],
              [v.team.lastMonth, last],
              [v.team.thisYear, year],
            ].map(([label, r]) => (
              <Link key={label as string} href={`?from=${(r as { from: string }).from}&to=${(r as { to: string }).to}`} className="f-label border px-2 py-1.5 text-[0.625rem] hover:border-foreground">
                {label as string}
              </Link>
            ))}
          </nav>
          <div className="ms-auto flex gap-2">
            <a href={`/api/team/${employee.id}/report?from=${fromDay}&to=${toDay}`} className="inline-flex h-9 items-center gap-2 border px-3 text-sm hover:border-foreground">
              <Download className="size-4" aria-hidden /> {v.team.exportXlsx}
            </a>
            <a href={`/api/team/${employee.id}/report?from=${fromDay}&to=${toDay}&format=csv`} className="inline-flex h-9 items-center border px-3 text-xs text-muted-foreground hover:border-foreground">
              {v.team.exportCsv}
            </a>
            <PrintButton />
          </div>
        </form>
      </Card>

      <p className="hidden text-sm print:block">
        {v.team.period} : {formatDate(from, lang, tz)} → {formatDate(new Date(to.getTime() - 1), lang, tz)}
      </p>

      {/* Totals */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          [v.team.presenceHours, h(report.presenceMinutes)],
          [v.team.laborHours, h(report.laborMinutes)],
          [v.team.daysWorked, String(report.daysWorked)],
          [v.team.breaks, h(report.breakMinutes)],
        ].map(([label, value]) => (
          <Card key={label}>
            <p className="label-tech">{label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
          </Card>
        ))}
      </div>
      {balance && <LeaveBalanceLine balance={balance} t={t} />}
      {report.incompleteDays.length > 0 && (
        <p className="border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          <strong>{v.team.incomplete} :</strong> {report.incompleteDays.join(", ")} — {v.team.incompleteHint}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle>{v.team.daily}</CardTitle>
          {report.days.length === 0 ? (
            <p className="text-sm text-muted-foreground">{v.team.noData}</p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>{v.leave.date}</Th>
                  <Th>{v.team.arrival}</Th>
                  <Th>{v.team.departure}</Th>
                  <Th className="text-end">{v.team.presenceHours}</Th>
                </tr>
              </thead>
              <tbody>
                {report.days.map((d) => (
                  <tr key={d.date} className={cn(d.incomplete && "text-amber-700 dark:text-amber-400")}>
                    <Td>{formatDate(zonedToUtc(d.date, "12:00", tz), lang, tz)}</Td>
                    <Td className="tabular-nums">{d.firstIn ? formatTime(d.firstIn, lang, tz) : "—"}</Td>
                    <Td className="tabular-nums">{d.lastOut ? formatTime(d.lastOut, lang, tz) : "—"}</Td>
                    <Td className="text-end tabular-nums">{h(d.presenceMinutes)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <div className="space-y-6">
          <Card>
            <CardTitle>{v.team.byOrder}</CardTitle>
            {report.laborByOrder.length === 0 ? (
              <p className="text-sm text-muted-foreground">{v.team.noData}</p>
            ) : (
              <ul className="divide-y text-sm">
                {report.laborByOrder.map((o) => (
                  <li key={o.id} className="flex items-center gap-3 py-2">
                    <Link href={`/garage/work-orders/${o.id}`} className="font-mono underline-offset-4 hover:underline">
                      {woNumber(o.number)}
                    </Link>
                    <span className="text-muted-foreground">{o.plate}</span>
                    <span className="ms-auto tabular-nums">{h(o.minutes)}{o.running ? " +" : ""}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardTitle>{v.team.leavesInPeriod}</CardTitle>
            {report.leaves.length === 0 ? (
              <p className="text-sm text-muted-foreground">{v.team.noData}</p>
            ) : (
              <ul className="divide-y text-sm">
                {report.leaves.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-2 py-2">
                    <span className="font-medium">{v.leave.type[r.type]}</span>
                    <LeaveBadge status={r.status} label={v.leave.status[r.status]} />
                    <span className="text-muted-foreground">
                      {r.allDay ? `${formatDate(r.startAt, lang, tz)} → ${formatDate(new Date(r.endAt.getTime() - 1), lang, tz)}` : `${formatDateTime(r.startAt, lang, tz)} → ${formatTime(r.endAt, lang, tz)}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {report.leaveTotals.length > 0 && (
              <p className="mt-3 text-sm">
                {report.leaveTotals.map((x) => `${v.leave.type[x.type]} : ${x.days ? fmt(v.leave.days, { n: x.days }) : ""}${x.hours ? ` ${fmt(v.leave.hours, { n: x.hours })}` : ""}`).join(" · ")}
              </p>
            )}
          </Card>
        </div>
      </div>

      {/* Punches & corrections */}
      <div className="grid gap-6 print:hidden lg:grid-cols-2">
        <Card>
          <CardTitle>{v.team.punches}</CardTitle>
          {punches.length === 0 ? (
            <p className="text-sm text-muted-foreground">{v.clock.none}</p>
          ) : (
            <ul className="max-h-96 divide-y overflow-y-auto text-sm">
              {punches.map((p) => (
                <li key={p.id} className={cn("flex flex-wrap items-center gap-2 py-1.5", p.voidedAt && "text-muted-foreground")}>
                  <time className={cn("tabular-nums", p.voidedAt && "line-through")}>{formatDateTime(p.at, lang, tz)}</time>
                  <span className={cn("font-medium", p.voidedAt && "line-through")}>{v.clock.kind[p.kind]}</span>
                  <span className="text-xs text-muted-foreground">{v.clock.method[p.method]}</span>
                  {p.reason && <span className="w-full text-xs">« {p.reason} »</span>}
                  {p.voidedAt ? (
                    <span className="w-full text-xs">
                      {v.clock.voided} : {p.voidReason}
                    </span>
                  ) : (
                    canFix && (
                      <ReasonButton className="ms-auto h-7" question={v.team.voidReason} action={voidPunchAction.bind(null, p.id, employee.id)}>
                        {v.team.void}
                      </ReasonButton>
                    )
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardTitle>{v.team.correction}</CardTitle>
          {canFix ? (
            <ActionForm action={correctPunchAction} className="grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="userId" value={employee.id} />
              <Field label={v.team.replaces} className="sm:col-span-2">
                <NativeSelect name="replaceEventId" defaultValue="">
                  <option value="">{v.team.newPunch}</option>
                  {punches
                    .filter((p) => !p.voidedAt)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {formatDateTime(p.at, lang, tz)} · {v.clock.kind[p.kind]}
                      </option>
                    ))}
                </NativeSelect>
              </Field>
              <Field label={v.clock.title}>
                <NativeSelect name="kind" defaultValue="IN">
                  {(["IN", "BREAK_START", "BREAK_END", "OUT"] as const).map((k) => (
                    <option key={k} value={k}>
                      {v.clock.kind[k]}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label={v.team.at}>
                <Input type="datetime-local" name="at" required defaultValue={`${nowLocal.date}T${nowLocal.time}`} />
              </Field>
              <Field label={v.team.reason} className="sm:col-span-2">
                <Input name="reason" required minLength={3} maxLength={300} />
              </Field>
              <p className="text-xs text-muted-foreground sm:col-span-2">{v.team.correctionHint}</p>
              <div>
                <Button type="submit">{t.common.save}</Button>
              </div>
            </ActionForm>
          ) : (
            <p className="text-sm text-muted-foreground">{t.errors.notOwnCorrection}</p>
          )}
        </Card>
      </div>

      {/* Profile & certificates */}
      <div className="grid gap-6 print:hidden lg:grid-cols-2">
        <Card>
          <CardTitle>{v.team.profile}</CardTitle>
          <ActionForm action={updateEmployeeProfileAction.bind(null, employee.id)} reset={false} className="grid gap-3 sm:grid-cols-2">
            <Field label={v.team.jobTitle} className="sm:col-span-2">
              <Input name="jobTitle" maxLength={120} defaultValue={employee.jobTitle ?? ""} />
            </Field>
            <Field label={v.team.hireDate}>
              <Input type="date" name="hireDate" defaultValue={employee.hireDate ? employee.hireDate.toISOString().slice(0, 10) : ""} />
            </Field>
            <Field label={v.team.nationalId}>
              <Input name="nationalId" maxLength={12} defaultValue={employee.nationalId ?? ""} autoComplete="off" dir="ltr" />
            </Field>
            <Field label={v.team.annualLeaveDays} hint={v.team.annualLeaveHint}>
              <Input type="number" name="annualLeaveDays" min={0} max={60} step={1} inputMode="numeric" defaultValue={employee.annualLeaveDays ?? ""} />
            </Field>
            <div>
              <Button type="submit">{t.common.save}</Button>
            </div>
          </ActionForm>
          {can(staff.role, "manageSettings") && (
            <ActionForm action={setHourlyCostAction.bind(null, employee.id)} reset={false} className="mt-4 flex flex-wrap items-end gap-2 border-t pt-4">
              <Field label={`${t.v7.profit.hourlyCost} (DT)`} hint={t.v7.profit.hourlyCostHint}>
                <Input name="hourlyCost" inputMode="decimal" dir="ltr" defaultValue={employee.hourlyCost === null ? "" : (employee.hourlyCost / 1000).toFixed(3)} />
              </Field>
              <Button type="submit" variant="outline">
                {t.common.save}
              </Button>
            </ActionForm>
          )}
        </Card>
        {can(staff.role, "issueCertificates") && (
          <Card>
            <CardTitle>{v.team.certificates}</CardTitle>
            {!companyReady && <p className="mb-3 text-sm text-amber-700 dark:text-amber-400">{v.team.missingCompany}</p>}
            <ActionForm action={issueCertificateAction.bind(null, employee.id)} className="grid gap-3 sm:grid-cols-2">
              <Field label={v.team.purpose}>
                <Input name="purpose" maxLength={120} />
              </Field>
              {!employee.isActive && (
                <Field label={v.team.endDate}>
                  <Input type="date" name="endDate" required />
                </Field>
              )}
              <div className="sm:col-span-2">
                <Button type="submit">
                  <FileText className="size-4" aria-hidden /> {v.team.issue}
                </Button>
              </div>
            </ActionForm>
            <p className="mt-3 text-xs text-muted-foreground">{v.team.certificateHint}</p>
            <ul className="mt-3 divide-y text-sm">
              {certificates.length === 0 && <li className="py-2 text-muted-foreground">{v.team.noCertificates}</li>}
              {certificates.map((c) => (
                <li key={c.id} className="flex items-center gap-3 py-2">
                  <a href={`/api/team/certificates/${c.id}`} target="_blank" rel="noopener" className="font-mono underline-offset-4 hover:underline">
                    {c.number}
                  </a>
                  <span className="text-muted-foreground">{formatDate(c.issuedAt, lang, tz)}</span>
                  {c.purpose && <span className="text-xs text-muted-foreground">{c.purpose}</span>}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}
