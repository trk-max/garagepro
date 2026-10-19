import Link from "next/link";
import { Card, CardTitle, PageHeader } from "@/components/ui/field";
import { StatusBadge } from "@/components/garage/badges";
import { fmt, formatDate, formatDateTime, woNumber } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { requirePageAccess } from "@/lib/session";
import { delays, INSURANCE_WAIT_ALERT_DAYS } from "@/server/follow-up";
import { getSettings } from "@/server/settings";

function lateLabel(since: Date, now: Date, lang: "fr" | "ar" | "en") {
  const hours = Math.max(0, Math.round((now.getTime() - since.getTime()) / 3_600_000));
  const days = Math.floor(hours / 24);
  if (lang === "ar") return days ? `${days} يوم` : `${hours} س`;
  if (lang === "en") return days ? `${days} d` : `${hours} h`;
  return days ? `${days} j` : `${hours} h`;
}

/** Repairs late or blocked, with who to call and what to do. */
export default async function DelaysPage() {
  await requirePageAccess("manageRepairFollowUp");
  const [{ t, lang }, d, settings] = await Promise.all([getI18n(), delays(), getSettings()]);
  const v = t.v7.delays;
  const tz = settings.timezone;
  const now = new Date();
  const tel = (p?: string | null) =>
    p ? (
      <a href={`tel:${p.replace(/\s/g, "")}`} dir="ltr" className="underline-offset-4 hover:underline">
        {p}
      </a>
    ) : null;
  const empty = d.lateOrders.length + d.lateParts.length + d.waitingParts.length + d.insurance.length === 0;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <PageHeader title={v.title} />
      {empty && <p className="border border-dashed p-10 text-center text-muted-foreground">{v.nothing}</p>}

      {d.lateOrders.length > 0 && (
        <Card>
          <CardTitle>
            {v.lateOrders} ({d.lateOrders.length})
          </CardTitle>
          <p className="mb-3 text-xs text-muted-foreground">
            {v.action} : {v.actions.order}
          </p>
          <ul className="divide-y text-sm">
            {d.lateOrders.map((w) => (
              <li key={w.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <Link href={`/garage/work-orders/${w.id}`} className="font-mono underline-offset-4 hover:underline">
                  {woNumber(w.number)}
                </Link>
                <span>{w.vehicle.plate}</span>
                <StatusBadge status={w.status} t={t} />
                <span className="font-semibold text-red-600 dark:text-red-400">{fmt(v.lateBy, { d: lateLabel(w.promisedAt!, now, lang) })}</span>
                <span className="text-muted-foreground">{formatDateTime(w.promisedAt!, lang, tz)}</span>
                <span className="ms-auto text-xs">
                  {v.contact} : {w.customer.name} {tel(w.customer.phone)}
                  {w.mechanic && ` · ${v.responsible} : ${w.mechanic.name}`}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {d.waitingParts.length > 0 && (
        <Card>
          <CardTitle>
            {v.waitingParts} ({d.waitingParts.length})
          </CardTitle>
          <p className="mb-3 text-xs text-muted-foreground">
            {v.action} : {v.actions.part}
          </p>
          <ul className="divide-y text-sm">
            {d.waitingParts.map((p) => {
              const late = p.expectedAt && p.expectedAt < now;
              return (
                <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                  <Link href={`/garage/work-orders/${p.workOrder.id}`} className="font-mono underline-offset-4 hover:underline">
                    {woNumber(p.workOrder.number)}
                  </Link>
                  <span>{p.workOrder.vehicle.plate}</span>
                  <span className="font-medium">{p.description}</span>
                  <span className="text-xs text-muted-foreground">{t.v7.parts.status[p.status]}</span>
                  {p.expectedAt && (
                    <span className={late ? "font-semibold text-red-600 dark:text-red-400" : "text-muted-foreground"}>
                      {formatDate(p.expectedAt, lang, tz)}
                      {late && ` · ${fmt(v.lateBy, { d: lateLabel(p.expectedAt, now, lang) })}`}
                    </span>
                  )}
                  {p.supplier && (
                    <span className="ms-auto text-xs">
                      {v.contact} : {p.supplier.name} {tel(p.supplier.phone)}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {d.insurance.length > 0 && (
        <Card>
          <CardTitle>
            {v.insurance} ({d.insurance.length})
          </CardTitle>
          <p className="mb-3 text-xs text-muted-foreground">
            {v.action} : {v.actions.insurance}
          </p>
          <ul className="divide-y text-sm">
            {d.insurance.map((w) => {
              const since = w.insuranceRequestedAt ?? w.updatedAt;
              const late = d.insuranceLate.some((x) => x.id === w.id);
              return (
                <li key={w.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                  <Link href={`/garage/work-orders/${w.id}`} className="font-mono underline-offset-4 hover:underline">
                    {woNumber(w.number)}
                  </Link>
                  <span>{w.vehicle.plate}</span>
                  <span>{w.insurerName ?? "—"}</span>
                  {w.insuranceClaimRef && <span className="font-mono text-xs">{w.insuranceClaimRef}</span>}
                  <span className={late ? "font-semibold text-red-600 dark:text-red-400" : "text-muted-foreground"}>
                    {fmt(t.v7.insurance.waitingSince, { n: Math.floor((now.getTime() - since.getTime()) / 86_400_000) })}
                    {late && ` (${fmt(v.insuranceLate, { n: INSURANCE_WAIT_ALERT_DAYS })})`}
                  </span>
                  <span className="ms-auto text-xs">
                    {v.contact} : {w.customer.name} {tel(w.customer.phone)}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
