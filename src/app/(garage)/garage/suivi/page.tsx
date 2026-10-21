import Link from "next/link";
import { alertAction } from "@/actions/reminders";
import { ActionForm } from "@/components/action-form";
import { StatusBadge } from "@/components/garage/badges";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, NativeSelect } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/field";
import { fmt, formatDate, formatDateTime, formatDay, formatMoney, woNumber } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { prisma } from "@/lib/prisma";
import { requirePageAccess } from "@/lib/session";
import { listAlerts, type AlertItem, type AlertType } from "@/server/alerts";

const ORDER: AlertType[] = ["cashLow", "lateOrder", "deliveryRisk", "stuck", "latePart", "insurance", "lowStock", "contractExpiry"];
/** Alerts without a "late by" duration and timestamp (their own detail line says it all). */
const NO_DELAY: AlertType[] = ["lowStock", "cashLow", "contractExpiry"];

function ago(since: Date, now: Date, lang: "fr" | "ar" | "en") {
  const hours = Math.max(0, Math.round(Math.abs(now.getTime() - since.getTime()) / 3_600_000));
  const days = Math.floor(hours / 24);
  if (lang === "ar") return days ? `${days} يوم` : `${hours} س`;
  if (lang === "en") return days ? `${days} d` : `${hours} h`;
  return days ? `${days} j` : `${hours} h`;
}

/** Repairs late or blocked, with who to call, what to do, and who handles it. */
export default async function DelaysPage() {
  const me = await requirePageAccess("manageRepairFollowUp");
  const [{ t, lang }, a, staff] = await Promise.all([
    getI18n(),
    listAlerts(undefined, me),
    prisma.user.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const v = t.v7.delays;
  const al = t.v7.alerts;
  const tz = a.settings.timezone;
  const now = new Date();
  const tel = (p?: string | null) =>
    p ? (
      <a href={`tel:${p.replace(/\s/g, "")}`} dir="ltr" className="underline-offset-4 hover:underline">
        {p}
      </a>
    ) : null;

  const Row = ({ x, quiet }: { x: AlertItem; quiet?: boolean }) => (
    <li className="space-y-2 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        {x.workOrder && (
          <Link href={`/garage/work-orders/${x.workOrder.id}`} className="font-mono underline-offset-4 hover:underline">
            {woNumber(x.workOrder.number)}
          </Link>
        )}
        {x.workOrder && <span>{x.workOrder.plate}</span>}
        {x.workOrder?.status && <StatusBadge status={x.workOrder.status as never} t={t} />}
        {x.label && !x.contract && <span className="font-medium">{x.label}</span>}
        {x.contract && (
          <Link href={`/garage/contrats/${x.contract.id}`} className="font-medium underline-offset-4 hover:underline">
            {x.label} — {formatDay(x.contract.endDay, lang, { day: "numeric", month: "short", year: "numeric" })}
          </Link>
        )}
        {x.cash && (
          <Link href={`/garage/tresorerie?s=${x.cash.scenario}&h=90`} className="font-medium underline-offset-4 hover:underline">
            {fmt(al.cashDetail, {
              balance: formatMoney(x.cash.balance, lang),
              date: formatDay(x.cash.day, lang, { day: "numeric", month: "short" }),
              threshold: formatMoney(x.cash.threshold, lang),
              scenario: t.v7.cash.scenarios[x.cash.scenario as keyof typeof t.v7.cash.scenarios] ?? x.cash.scenario,
              lowest: formatMoney(x.cash.lowest, lang),
              lowestDate: formatDay(x.cash.lowestDay, lang, { day: "numeric", month: "short" }),
            })}
          </Link>
        )}
        <span className={quiet ? "text-muted-foreground" : "font-semibold text-red-600 dark:text-red-400"}>
          {x.type === "deliveryRisk" ? fmt(al.dueIn, { d: ago(x.since, now, lang) }) : NO_DELAY.includes(x.type) ? "" : fmt(v.lateBy, { d: ago(x.since, now, lang) })}
        </span>
        {!NO_DELAY.includes(x.type) && <span className="text-xs text-muted-foreground">{formatDateTime(x.since, lang, tz)}</span>}
        <span className="ms-auto text-xs">
          {x.contact && (
            <>
              {v.contact} : {x.contact.name} {tel(x.contact.phone)}
            </>
          )}
          {x.responsible && ` · ${v.responsible} : ${x.responsible}`}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <ActionForm action={alertAction} reset={false} silent className="flex items-center gap-1">
          <input type="hidden" name="key" value={x.key} />
          <input type="hidden" name="op" value="assign" />
          <NativeSelect name="userId" defaultValue={x.state?.assignedToId ?? ""} aria-label={al.assign} className="h-7 text-xs">
            <option value="">{al.unassigned}</option>
            {staff.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </NativeSelect>
          <Button type="submit" size="sm" variant="outline" className="h-7">
            {al.assign}
          </Button>
        </ActionForm>
        {quiet ? (
          <ActionForm action={alertAction} reset={false} silent>
            <input type="hidden" name="key" value={x.key} />
            <input type="hidden" name="op" value="reopen" />
            <Button type="submit" size="sm" variant="outline" className="h-7">
              {al.reopen}
            </Button>
          </ActionForm>
        ) : (
          <>
            <ActionForm action={alertAction} reset={false} silent>
              <input type="hidden" name="key" value={x.key} />
              <input type="hidden" name="op" value="handle" />
              <Button type="submit" size="sm" variant="outline" className="h-7">
                {al.handled}
              </Button>
            </ActionForm>
            {[1, 3].map((days) => (
              <ActionForm key={days} action={alertAction} reset={false} silent>
                <input type="hidden" name="key" value={x.key} />
                <input type="hidden" name="op" value="snooze" />
                <input type="hidden" name="days" value={days} />
                <Button type="submit" size="sm" variant="ghost" className="h-7">
                  {fmt(al.snooze, { n: days })}
                </Button>
              </ActionForm>
            ))}
          </>
        )}
        {x.state?.handledAt && <span className="text-muted-foreground">{fmt(al.handledOn, { date: formatDateTime(x.state.handledAt, lang, tz) })}</span>}
        {x.state?.snoozedUntil && x.state.snoozedUntil > now && !x.state.handledAt && (
          <span className="text-muted-foreground">{fmt(al.snoozedUntil, { date: formatDateTime(x.state.snoozedUntil, lang, tz) })}</span>
        )}
      </div>
    </li>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <PageHeader title={v.title} />
      <p className="text-xs text-muted-foreground">
        {fmt(al.thresholds, { stuck: a.settings.alertStuckDays, risk: a.settings.alertDeliveryRiskHours, insurance: a.settings.alertInsuranceDays })}
      </p>
      {a.open.length === 0 && a.waitingParts.length === 0 && <p className="border border-dashed p-10 text-center text-muted-foreground">{v.nothing}</p>}

      {ORDER.map((type) => {
        const list = a.open.filter((x) => x.type === type);
        if (list.length === 0) return null;
        return (
          <Card key={type}>
            <CardTitle>
              {al.types[type]} ({list.length})
            </CardTitle>
            <p className="mb-1 text-xs text-muted-foreground">
              {v.action} : {al.actions[type]}
            </p>
            <ul className="divide-y">
              {list.map((x) => (
                <Row key={x.key} x={x} />
              ))}
            </ul>
          </Card>
        );
      })}

      {a.waitingParts.length > 0 && (
        <Card>
          <CardTitle>
            {v.waitingParts} ({a.waitingParts.length})
          </CardTitle>
          <ul className="divide-y text-sm">
            {a.waitingParts.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <Link href={`/garage/work-orders/${p.workOrder.id}`} className="font-mono underline-offset-4 hover:underline">
                  {woNumber(p.workOrder.number)}
                </Link>
                <span>{p.workOrder.vehicle.plate}</span>
                <span className="font-medium">{p.description}</span>
                <span className="text-xs text-muted-foreground">{t.v7.parts.status[p.status]}</span>
                {p.expectedAt && <span className="text-muted-foreground">{formatDate(p.expectedAt, lang, tz)}</span>}
                {p.supplier && (
                  <span className="ms-auto text-xs">
                    {v.contact} : {p.supplier.name} {tel(p.supplier.phone)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {a.quiet.length > 0 && (
        <details className="border p-4">
          <summary className="cursor-pointer text-sm font-medium">
            {al.quiet} ({a.quiet.length})
          </summary>
          <ul className="mt-2 divide-y">
            {a.quiet.map((x) => (
              <Row key={x.key} x={x} quiet />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
