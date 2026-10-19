import Link from "next/link";
import { decideLeaveAction } from "@/actions/team";
import { ActionForm } from "@/components/action-form";
import { LeaveRequestForm } from "@/components/team/leave-request-form";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, NativeSelect, PageHeader } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { parseOpeningHours } from "@/lib/booking";
import { fmt, formatDate, formatDateTime, formatTime } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { spanHours, workingDays } from "@/lib/leaves";
import { localToday } from "@/lib/periods";
import { requirePageAccess } from "@/lib/session";
import { cn } from "@/lib/utils";
import { prisma } from "@/lib/prisma";
import { listLeaves } from "@/server/leaves";
import { getSettings } from "@/server/settings";
import { teamPresence } from "@/server/timeclock";

/** Managers: who is here, requests to decide, employees' files. */
export default async function TeamPage() {
  const staff = await requirePageAccess("manageTeam");
  const [{ t, lang }, presence, pending, settings, employees] = await Promise.all([
    getI18n(),
    teamPresence(),
    listLeaves({ status: "PENDING" }),
    getSettings(),
    prisma.user.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, role: true, jobTitle: true } }),
  ]);
  const v = t.v7;
  const hours = parseOpeningHours(settings.openingHours);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <PageHeader title={v.team.title} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle>{v.team.presence}</CardTitle>
          <ul className="divide-y text-sm">
            {presence.map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-2">
                <span className={cn("size-2.5 shrink-0 rounded-full", p.state === "IN" ? "bg-emerald-500" : p.state === "BREAK" ? "bg-amber-500" : "bg-zinc-400")} aria-hidden />
                <Link href={`/garage/equipe/${p.id}`} className="font-medium underline-offset-4 hover:underline">
                  {p.name}
                </Link>
                <span className="text-xs text-muted-foreground">{t.roles[p.role]}</span>
                <span className="ms-auto text-xs text-muted-foreground">
                  {v.clock.state[p.state]}
                  {p.state !== "OUT" && p.lastAt ? ` · ${fmt(v.team.since, { time: formatTime(p.lastAt, lang, settings.timezone) })}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardTitle>{v.leave.pending}</CardTitle>
          {pending.length === 0 ? (
            <p className="text-sm text-muted-foreground">{v.leave.nonePending}</p>
          ) : (
            <ul className="space-y-4">
              {pending.map((r) => (
                <li key={r.id} className="border-b pb-4 last:border-0 last:pb-0">
                  <p className="text-sm">
                    <span className="font-semibold">{r.user.name}</span> · {v.leave.type[r.type]}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {r.allDay
                      ? `${formatDate(r.startAt, lang, settings.timezone)} → ${formatDate(new Date(r.endAt.getTime() - 1), lang, settings.timezone)} · ${fmt(v.leave.days, { n: workingDays(r, settings.timezone, hours) })}`
                      : `${formatDateTime(r.startAt, lang, settings.timezone)} → ${formatTime(r.endAt, lang, settings.timezone)} · ${fmt(v.leave.hours, { n: spanHours(r) })}`}
                  </p>
                  {r.reason && <p className="mt-1 border-s-2 ps-2 text-sm">{r.reason}</p>}
                  {r.userId === staff.id && staff.role !== "ADMIN" ? (
                    <p className="mt-2 text-xs text-muted-foreground">{t.errors.notOwnDecision}</p>
                  ) : (
                    <ActionForm action={decideLeaveAction.bind(null, r.id)} className="mt-2 flex flex-wrap gap-2">
                      <NativeSelect name="decision" className="w-36" aria-label={v.leave.approve}>
                        <option value="approve">{v.leave.approve}</option>
                        <option value="reject">{v.leave.reject}</option>
                      </NativeSelect>
                      <Input name="note" maxLength={500} placeholder={v.leave.decisionNote} className="min-w-40 flex-1" />
                      <Button type="submit" size="sm" className="h-9">
                        {t.common.save}
                      </Button>
                    </ActionForm>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle>{v.team.employees}</CardTitle>
          <ul className="divide-y text-sm">
            {employees.map((e) => (
              <li key={e.id} className="flex items-center gap-3 py-2">
                <span className="font-medium">{e.name}</span>
                <span className="text-xs text-muted-foreground">{e.jobTitle ?? t.roles[e.role]}</span>
                <Link href={`/garage/equipe/${e.id}`} className="f-label ms-auto border px-2 py-1 text-[0.625rem] hover:border-foreground">
                  {v.team.open}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardTitle>{v.leave.recordFor}</CardTitle>
          <LeaveRequestForm employees={employees.filter((e) => e.id !== staff.id || staff.role === "ADMIN")} defaultDay={localToday(settings.timezone)} />
        </Card>
      </div>
    </div>
  );
}
