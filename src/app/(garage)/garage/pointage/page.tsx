import Link from "next/link";
import { MonitorSmartphone } from "lucide-react";
import { cancelLeaveAction } from "@/actions/team";
import { ActionButton } from "@/components/action-form";
import { LeaveRequestForm } from "@/components/team/leave-request-form";
import { PunchForm } from "@/components/team/punch-form";
import { LeaveBadge } from "@/components/team/badges";
import { Card, CardTitle, PageHeader } from "@/components/ui/field";
import { parseOpeningHours } from "@/lib/booking";
import { fmt, formatDate, formatDateTime, formatTime } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { spanHours, workingDays } from "@/lib/leaves";
import { localToday } from "@/lib/periods";
import { can } from "@/lib/permissions";
import { requirePageAccess } from "@/lib/session";
import { cn } from "@/lib/utils";
import { getLeaveBalance, listLeaves } from "@/server/leaves";
import { LeaveBalanceLine } from "@/components/team/leave-balance";
import { getSettings } from "@/server/settings";
import { myClockStatus } from "@/server/timeclock";

type PageProps = { searchParams: Promise<{ code?: string }> };

/** Every employee: clock in / out, own punches, own leave requests. */
export default async function TimeClockPage({ searchParams }: PageProps) {
  const staff = await requirePageAccess("useTimeClock");
  const { code } = await searchParams;
  const [{ t, lang }, status, leaves, settings, balance] = await Promise.all([
    getI18n(),
    myClockStatus(staff.id),
    listLeaves({ userId: staff.id }),
    getSettings(),
    getLeaveBalance(staff.id),
  ]);
  const c = t.v7.clock;
  const l = t.v7.leave;
  const hours = parseOpeningHours(settings.openingHours);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <PageHeader title={t.v7.nav.timeClock}>
        {can(staff, "showClockKiosk") && (
          <Link href="/garage/pointage/borne" className="f-label inline-flex items-center gap-2 border px-3 py-2 hover:border-foreground">
            <MonitorSmartphone className="size-4" aria-hidden /> {c.kioskOpen}
          </Link>
        )}
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle>{c.title}</CardTitle>
          <p className="mb-4 flex items-center gap-2 text-lg font-semibold">
            <span className={cn("size-2.5 rounded-full", status.state === "IN" ? "bg-emerald-500" : status.state === "BREAK" ? "bg-amber-500" : "bg-zinc-400")} aria-hidden />
            {c.state[status.state]}
          </p>
          <PunchForm allowed={status.allowed} needsCode={status.mode !== "NETWORK"} initialCode={code?.replace(/\D/g, "").slice(0, 6)} />
        </Card>

        <Card>
          <CardTitle>{c.last24h}</CardTitle>
          {status.recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">{c.none}</p>
          ) : (
            <ol className="space-y-1.5 text-sm">
              {status.recent.map((e) => (
                <li key={e.id} className={cn("flex items-center gap-3", e.voidedAt && "text-muted-foreground line-through")}>
                  <time className="w-14 font-mono tabular-nums">{formatTime(e.at, lang, settings.timezone)}</time>
                  <span className="font-medium">{c.kind[e.kind]}</span>
                  <span className="text-xs text-muted-foreground">{c.method[e.method]}</span>
                  {e.voidedAt && <span className="text-xs no-underline">({c.voided})</span>}
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle>{l.request}</CardTitle>
          {balance && <LeaveBalanceLine balance={balance} t={t} className="mb-4" />}
          <LeaveRequestForm defaultDay={localToday(settings.timezone)} />
        </Card>
        <Card>
          <CardTitle>{l.mine}</CardTitle>
          {leaves.length === 0 ? (
            <p className="text-sm text-muted-foreground">{l.noneMine}</p>
          ) : (
            <ul className="divide-y text-sm">
              {leaves.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2 py-2.5">
                  <span className="font-medium">{l.type[r.type]}</span>
                  <LeaveBadge status={r.status} label={l.status[r.status]} />
                  <span className="text-muted-foreground">
                    {r.allDay
                      ? `${formatDate(r.startAt, lang, settings.timezone)} → ${formatDate(new Date(r.endAt.getTime() - 1), lang, settings.timezone)} · ${fmt(l.days, { n: workingDays(r, settings.timezone, hours) })}`
                      : `${formatDateTime(r.startAt, lang, settings.timezone)} → ${formatTime(r.endAt, lang, settings.timezone)} · ${fmt(l.hours, { n: spanHours(r) })}`}
                  </span>
                  {r.decidedBy && <span className="w-full text-xs text-muted-foreground">{fmt(l.decidedBy, { name: r.decidedBy.name })}{r.decisionNote ? ` — ${r.decisionNote}` : ""}</span>}
                  {r.status === "PENDING" && (
                    <ActionButton size="sm" variant="outline" className="ms-auto" action={cancelLeaveAction.bind(null, r.id)} confirm={l.cancelConfirm}>
                      {l.cancel}
                    </ActionButton>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
