import Link from "next/link";
import { BarChart3, Monitor, PhoneCall, Settings, SkipForward, Tablet, Ticket } from "lucide-react";
import {
  deskCallAction,
  deskCancelAction,
  deskCheckInAction,
  deskConnectAction,
  deskConnectFormAction,
  deskMoveAction,
  deskNextAction,
  deskPriorityAction,
  deskRecallAction,
  deskTransferAction,
} from "@/actions/accueil";
import { ActionButton, ActionForm } from "@/components/action-form";
import { LiveRefresh } from "@/components/live-refresh";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, Field, NativeSelect, PageHeader } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Chip, type ChipTone } from "@/components/ui/redesign/chip";
import type { PriorityGroup } from "@/lib/accueil";
import { displayPlate, fmt, formatMoney, formatTime, woNumber, type Lang } from "@/lib/format";
import type { Dictionary } from "@/lib/i18n/fr";
import { getI18n } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { requirePageAccess, type StaffUser } from "@/lib/session";
import { deskState, openInvoicesFor, openOrderFor } from "@/server/accueil";

export const dynamic = "force-dynamic";

type Desk = Awaited<ReturnType<typeof deskState>>;
type View = Desk["waiting"][number];

const GROUP_TONE: Record<PriorityGroup, ChipTone> = { MANUAL: "danger", APPOINTMENT: "accent", FAST: "success", ARRIVAL: "neutral" };
const reasonName = (r: View["reason"], lang: Lang) => (r ? (lang === "ar" ? r.nameAr || r.nameFr : lang === "en" ? r.nameEn || r.nameFr : r.nameFr) : "—");
const minutesSince = (from: Date, now: Date) => Math.max(0, Math.round((now.getTime() - from.getTime()) / 60_000));

/** V15 — reception desk: live queue, « Suivant », call / recall / absent / transfer / finish, check-in, today's figures. */
export default async function ReceptionDeskPage() {
  const staff = await requirePageAccess("useReception");
  const [{ t, lang }, desk] = await Promise.all([getI18n(), deskState(staff)]);
  const v = t.v15;
  const now = desk.now;
  const mine = desk.myCounter;
  const others = desk.counters.filter((c) => c.id !== mine?.id);

  // Context of the tickets at MY counter: check-in, open order, invoices to collect.
  const context = await Promise.all(
    desk.mine.map(async (tk) => ({
      id: tk.id,
      order: tk.vehicleId ? await openOrderFor(tk.vehicleId) : null,
      invoices: tk.customerId && (tk.reasonKind === "PAYMENT" || tk.reasonKind === "PICKUP") && can(staff, "viewClientInvoices") ? await openInvoicesFor(tk.customerId) : null,
    })),
  );
  const ctxOf = new Map(context.map((c) => [c.id, c]));

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6">
      <PageHeader title={v.desk.title} subtitle={v.desk.subtitle}>
        <LiveRefresh url="/api/staff/live?topic=reception" liveLabel={t.portal.live} reconnectingLabel={t.portal.reconnecting} />
        {/* staff-ux: the manual ticket has its own page (send to the customer's phone, big number + QR). */}
        <Link href="/garage/accueil/ticket" className="inline-flex h-10 items-center gap-2 rounded-full bg-gp-primary px-4 text-sm font-medium text-gp-primary-ink hover:opacity-90" data-testid="desk-manual-ticket">
          <Ticket className="size-4" aria-hidden /> {t.staffUx.ticket.open}
        </Link>
        {can(staff, "viewReceptionReports") && (
          <Link href="/garage/accueil/rapports" className="inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm hover:bg-muted">
            <BarChart3 className="size-4" aria-hidden /> {v.desk.links.reports}
          </Link>
        )}
        {can(staff, "configureReception") && (
          <Link href="/garage/accueil/reglages" className="inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm hover:bg-muted">
            <Settings className="size-4" aria-hidden /> {v.desk.links.settings}
          </Link>
        )}
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          {/* ── My counter ── */}
          <Card data-testid="my-counter">
            <div className="flex flex-wrap items-center gap-3">
              <CardTitle className="mb-0">{v.desk.myCounter}</CardTitle>
              {mine && <Chip tone="accent">{mine.name}</Chip>}
              {mine && (
                <ActionButton size="sm" variant="ghost" action={deskConnectAction.bind(null, null)} className="ms-auto">
                  {v.desk.leave}
                </ActionButton>
              )}
            </div>
            {!mine ? (
              desk.counters.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">{v.desk.noCounters}</p>
              ) : (
                <ActionForm action={deskConnectFormAction} reset={false} className="mt-3 flex flex-wrap items-end gap-2">
                  <Field label={v.desk.chooseCounter} className="min-w-48 flex-1">
                    <NativeSelect name="counterId" required defaultValue="">
                      <option value="" disabled>
                        {v.desk.chooseCounter}
                      </option>
                      {desk.counters.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                          {c.user ? ` — ${c.user.name}` : ""}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                  <Button type="submit">{v.desk.connect}</Button>
                  <p className="basis-full text-sm text-muted-foreground">{v.desk.noCounter}</p>
                </ActionForm>
              )
            ) : (
              <div className="mt-4 space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <ActionButton action={deskNextAction.bind(null, mine.id)} className="h-14 rounded-full px-8 text-lg" data-testid="next">
                    <SkipForward className="size-5" aria-hidden /> {v.desk.next}
                  </ActionButton>
                  <span className="text-sm text-muted-foreground">{v.desk.nextHint}</span>
                </div>
                {desk.mine.map((tk) => (
                  <CurrentTicket key={tk.id} t={t} lang={lang} tk={tk} desk={desk} staff={staff} counterId={mine.id} others={others} ctx={ctxOf.get(tk.id)!} />
                ))}
              </div>
            )}
          </Card>

          {/* ── Waiting list ── */}
          <Card>
            <CardTitle>{fmt(v.desk.waiting, { n: desk.waiting.length })}</CardTitle>
            {desk.waiting.length === 0 ? (
              <p className="text-sm text-muted-foreground">{v.desk.empty}</p>
            ) : (
              <ol className="divide-y" data-testid="waiting-list">
                {desk.waiting.map((tk) => (
                  <li key={tk.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                    <span className="w-16 font-mono text-xl font-bold tabular-nums" dir="ltr">
                      {tk.label}
                    </span>
                    <div className="min-w-0 flex-1 basis-48">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        {reasonName(tk.reason, lang)}
                        {tk.group && tk.group !== "ARRIVAL" && <Chip tone={GROUP_TONE[tk.group]}>{v.group[tk.group]}</Chip>}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {fmt(v.desk.since, { n: minutesSince(tk.takenAt, now) })}
                        {tk.plate && (
                          <>
                            {" · "}
                            <span dir="ltr" className="font-mono">
                              {displayPlate(tk.plate)}
                            </span>
                          </>
                        )}
                        {tk.customer && ` · ${tk.customer.name}`}
                        {tk.apptAt && ` · ${fmt(v.desk.appt, { time: formatTime(tk.apptAt, lang, desk.tz) })}`}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {mine && (
                        <ActionButton size="sm" action={deskCallAction.bind(null, tk.id, mine.id)}>
                          <PhoneCall className="size-4" aria-hidden /> {v.desk.call}
                        </ActionButton>
                      )}
                      <ActionButton size="sm" variant="outline" action={deskPriorityAction.bind(null, tk.id, tk.priority > 0 ? 0 : 1)}>
                        {tk.priority > 0 ? v.desk.unprioritize : v.desk.prioritize}
                      </ActionButton>
                      <CancelForm t={t} ticketId={tk.id} />
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>

          {desk.otherCalls.length > 0 && (
            <Card>
              <CardTitle>{v.desk.otherCounters}</CardTitle>
              <ul className="divide-y">
                {desk.otherCalls.map((tk) => (
                  <li key={tk.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                    <span className="w-16 font-mono font-bold" dir="ltr">
                      {tk.label}
                    </span>
                    <span>{tk.counterId ? desk.counterNames.get(tk.counterId) : "—"}</span>
                    <Chip tone={tk.status === "SERVING" ? "success" : "accent"}>{v.status[tk.status as keyof typeof v.status]}</Chip>
                    <span className="text-muted-foreground">{reasonName(tk.reason, lang)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card>
            <CardTitle>{v.desk.absentTitle}</CardTitle>
            {desk.absent.length === 0 ? (
              <p className="text-sm text-muted-foreground">—</p>
            ) : (
              <ul className="divide-y">
                {desk.absent.map((tk) => (
                  <li key={tk.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                    <span className="w-16 font-mono font-bold" dir="ltr">
                      {tk.label}
                    </span>
                    <span className="flex-1 text-muted-foreground">{reasonName(tk.reason, lang)}</span>
                    {mine && (
                      <ActionButton size="sm" variant="outline" action={deskRecallAction.bind(null, tk.id, mine.id)}>
                        {v.desk.recallAbsent}
                      </ActionButton>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <aside className="min-w-0 space-y-6">
          <Card>
            <CardTitle>{v.desk.counters}</CardTitle>
            <ul className="space-y-2 text-sm">
              {desk.counters.map((c) => (
                <li key={c.id} className="flex items-center gap-2">
                  <span className="font-medium">{c.name}</span>
                  <span className="ms-auto text-muted-foreground">{c.user ? c.user.name : v.desk.free}</span>
                  {c.user && <Chip tone={c.user.clock === "IN" ? "success" : c.user.clock === "BREAK" ? "accent" : "neutral"}>{v.clock[c.user.clock]}</Chip>}
                </li>
              ))}
            </ul>
          </Card>

          <StatsCard t={t} lang={lang} desk={desk} />
        </aside>
      </div>
    </div>
  );
}

function CancelForm({ t, ticketId }: { t: Dictionary; ticketId: string }) {
  const v = t.v15.desk;
  return (
    <details className="relative">
      <summary className="inline-flex h-8 cursor-pointer list-none items-center rounded-md px-3 text-sm text-muted-foreground hover:bg-muted">{v.cancel}</summary>
      <ActionForm action={deskCancelAction.bind(null, ticketId)} className="absolute end-0 z-10 mt-1 flex w-72 gap-2 rounded-md border bg-card p-2 shadow-lg">
        <Input name="reason" required maxLength={300} placeholder={v.cancelReason} aria-label={v.cancelReason} className="h-8" />
        <Button type="submit" size="sm" variant="destructive">
          OK
        </Button>
      </ActionForm>
    </details>
  );
}

function CurrentTicket({
  t,
  lang,
  tk,
  desk,
  staff,
  counterId,
  others,
  ctx,
}: {
  t: Dictionary;
  lang: Lang;
  tk: View;
  desk: Desk;
  staff: StaffUser;
  counterId: string;
  others: Desk["counters"];
  ctx: { order: Awaited<ReturnType<typeof openOrderFor>>; invoices: Awaited<ReturnType<typeof openInvoicesFor>> | null };
}) {
  const v = t.v15;
  const appt = tk.appointment;
  return (
    <div className="rounded-lg border-2 border-brand-500/60 p-4" data-testid="current-ticket">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-mono text-4xl font-bold tabular-nums" dir="ltr">
          {tk.label}
        </span>
        <Chip tone={tk.status === "SERVING" ? "success" : "accent"}>{v.status[tk.status as keyof typeof v.status]}</Chip>
        {tk.status === "CALLED" && <span className="text-sm text-muted-foreground">{fmt(v.desk.calls, { n: tk.callCount, max: desk.settings.maxCalls })}</span>}
        <span className="text-sm">{reasonName(tk.reason, lang)}</span>
      </div>

      <div className="mt-2 text-sm">
        {tk.vehicle ? (
          <p>
            <span dir="ltr" className="font-mono">
              {displayPlate(tk.vehicle.plate)}
            </span>{" "}
            · {tk.vehicle.make} {tk.vehicle.model}
            {tk.customer && <> · {tk.customer.name}</>}
          </p>
        ) : tk.plate ? (
          <p>
            <span dir="ltr" className="font-mono">
              {displayPlate(tk.plate)}
            </span>{" "}
            · <span className="text-muted-foreground">{v.desk.unknownVehicle}</span>
          </p>
        ) : (
          <p className="text-muted-foreground">{v.desk.noPlate}</p>
        )}
      </div>

      {/* Check-in / order / invoices: the screens that already exist. */}
      <div className="mt-3 flex flex-wrap gap-2">
        {appt && appt.status === "CONFIRMED" && can(staff, "manageAppointments") && (
          <ActionButton size="sm" action={deskCheckInAction.bind(null, tk.id)} data-testid="checkin-appt">
            {fmt(v.desk.checkInAppt, { time: formatTime(appt.startAt, lang, desk.tz) })}
          </ActionButton>
        )}
        {tk.workOrder && (
          <Link href={`/garage/work-orders/${tk.workOrder.id}`} className="inline-flex h-8 items-center rounded-md border px-3 text-sm hover:bg-muted">
            {fmt(v.desk.openOrder, { number: woNumber(tk.workOrder.number) })}
          </Link>
        )}
        {!tk.workOrder && ctx.order && (
          <Link href={`/garage/work-orders/${ctx.order.id}`} className="inline-flex h-8 items-center rounded-md border px-3 text-sm hover:bg-muted">
            {fmt(v.desk.openOrder, { number: woNumber(ctx.order.number) })}
          </Link>
        )}
        {!tk.workOrder && !ctx.order && !(appt && appt.status === "CONFIRMED") && (tk.reasonKind === "DROP_OFF" || tk.reasonKind === "QUOTE" || tk.plate) && can(staff, "viewWorkOrders") && (
          <Link
            href={tk.plate ? `/garage/work-orders/new?plate=${encodeURIComponent(tk.plate)}` : "/garage/work-orders/new"}
            className="inline-flex h-8 items-center rounded-md border px-3 text-sm hover:bg-muted"
            data-testid="checkin-link"
          >
            {v.desk.checkIn}
          </Link>
        )}
        {ctx.invoices?.map((inv) => (
          <Link key={inv.id} href={`/garage/invoices/${inv.id}`} className="inline-flex h-8 items-center rounded-md border border-emerald-600/50 px-3 text-sm hover:bg-muted">
            {fmt(v.desk.pay, { number: inv.number, left: formatMoney(inv.totalTtc - inv.paidAmount, lang) })}
          </Link>
        ))}
        {ctx.invoices && ctx.invoices.length === 0 && <span className="text-xs text-muted-foreground">{v.desk.noOpenInvoice}</span>}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {tk.status === "CALLED" && (
          <>
            <ActionButton size="sm" action={deskMoveAction.bind(null, tk.id, "serve")}>
              {v.desk.serve}
            </ActionButton>
            <ActionButton size="sm" variant="outline" action={deskRecallAction.bind(null, tk.id, counterId)} disabled={tk.outcome === "WAIT"} title={tk.outcome === "WAIT" ? v.desk.tooSoon : undefined}>
              {v.desk.recall}
            </ActionButton>
            <ActionButton size="sm" variant="outline" action={deskMoveAction.bind(null, tk.id, "absent")}>
              {v.desk.absent}
            </ActionButton>
          </>
        )}
        <ActionButton size="sm" variant="secondary" action={deskMoveAction.bind(null, tk.id, "finish")}>
          {v.desk.finish}
        </ActionButton>
        {others.length > 0 && (
          <ActionForm action={deskTransferAction.bind(null, tk.id)} className="flex items-center gap-2">
            <NativeSelect name="counterId" required aria-label={v.desk.transferTo} className="h-8 w-40">
              {others.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </NativeSelect>
            <Button type="submit" size="sm" variant="outline">
              {v.desk.transfer}
            </Button>
          </ActionForm>
        )}
      </div>
      {tk.status === "CALLED" && tk.callCount >= desk.settings.maxCalls && <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">{v.desk.willBeAbsent}</p>}
    </div>
  );
}

function StatsCard({ t, lang, desk }: { t: Dictionary; lang: Lang; desk: Desk }) {
  const v = t.v15;
  const s = desk.stats;
  const min = (n: number | null) => (n === null ? v.noEstimate : fmt(v.minutes, { n }));
  return (
    <Card data-testid="stats">
      <CardTitle>{v.desk.stats}</CardTitle>
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <dt className="text-muted-foreground">{v.stats.tickets}</dt>
        <dd className="text-end font-semibold tabular-nums">{s.total.count}</dd>
        <dt className="text-muted-foreground">{v.stats.avgWait}</dt>
        <dd className="text-end font-semibold tabular-nums">{min(s.total.avgWait)}</dd>
        <dt className="text-muted-foreground">{v.stats.maxWait}</dt>
        <dd className="text-end font-semibold tabular-nums">{min(s.total.maxWait)}</dd>
        <dt className="text-muted-foreground">{v.stats.absent}</dt>
        <dd className="text-end font-semibold tabular-nums">{s.total.absent}</dd>
      </dl>
      <h3 className="mt-4 mb-2 text-xs font-semibold uppercase text-muted-foreground">{v.stats.byReason}</h3>
      <table className="w-full text-sm">
        <tbody>
          {desk.reasons.map((r) => {
            const st = s.byReason.get(r.id);
            return (
              <tr key={r.id} className="border-t">
                <td className="py-1">{reasonName(r, lang)}</td>
                <td className="py-1 text-end tabular-nums">{st?.count ?? 0}</td>
                <td className="py-1 text-end tabular-nums">{min(st?.avgWait ?? null)}</td>
                <td className="py-1 text-end text-xs text-muted-foreground tabular-nums" title={`${v.stats.estimatedNow} (${v.estimated})`}>
                  ~{min(desk.waits.get(r.id) ?? null)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {s.byHour.length > 0 && (
        <>
          <h3 className="mt-4 mb-2 text-xs font-semibold uppercase text-muted-foreground">{v.stats.byHour}</h3>
          <ul className="space-y-1 text-sm">
            {s.byHour.map((h) => (
              <li key={h.hour} className="flex items-center gap-2">
                <span className="w-14 tabular-nums">{fmt(v.stats.hour, { h: h.hour })}</span>
                <span className="h-2 rounded-full bg-brand-500/70" style={{ width: `${Math.min(100, h.stat.count * 10)}%` }} aria-hidden />
                <span className="ms-auto tabular-nums">{h.stat.count}</span>
                <span className="w-14 text-end text-xs text-muted-foreground tabular-nums">{min(h.stat.avgWait)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="mt-4 flex gap-3 text-xs text-muted-foreground">
        <Tablet className="size-4" aria-hidden /> /accueil/borne
        <Monitor className="size-4" aria-hidden /> /accueil/ecran
      </p>
    </Card>
  );
}
