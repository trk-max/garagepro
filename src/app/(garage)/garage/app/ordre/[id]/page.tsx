import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarClock, ExternalLink, Play, Timer } from "lucide-react";
import { addLineAction } from "@/actions/work-orders";
import { startLaborAction, stopLaborAction } from "@/actions/follow-up";
import { workshopStatusAction, workshopStatusFormAction } from "@/actions/workshop";
import { ActionButton } from "@/components/action-form";
import { PlateChip, StatusBadge } from "@/components/garage/badges";
import { InspectionCard } from "@/components/garage/lot5-cards";
import { LineAdder } from "@/components/garage/line-adder";
import { MediaUploader } from "@/components/garage/media-uploader";
import { StatusDialog } from "@/components/garage/status-dialog";
import { LiveRefresh } from "@/components/live-refresh";
import { minutesToHHMM } from "@/lib/booking";
import { displayPlate, fmt, formatDateTime, formatQty, formatTime, woNumber } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { isReworkMove } from "@/lib/lot5";
import { can } from "@/lib/permissions";
import { requirePageAccess } from "@/lib/session";
import { workshopMoves } from "@/lib/workshop-moves";
import { cn } from "@/lib/utils";
import { inspectionsFor, listTemplates } from "@/server/inspections";
import { laborSummary, runningLabor } from "@/server/labor";
import { partOptions } from "@/server/parts";
import { getSettings } from "@/server/settings";
import { getWorkOrder } from "@/server/work-orders";
import { markAssignmentSeen } from "@/server/assignment-alerts";
import { isFinal } from "@/server/workflow";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

/**
 * PWA team app — one car on the phone, for the mechanic: status (next step + the V16 status dialog),
 * time spent (start / stop), works and parts (list + the order page's line adder), inspection
 * (the Lot 5 card) and photos. Same components and Server Actions as the order page and the mobile
 * workshop, so the same permissions apply (per move, per action, per user).
 */
export default async function TeamOrderScreen({ params }: PageProps) {
  const { id } = await params;
  const [staff, wo, { t, lang }, settings] = await Promise.all([requirePageAccess("useWorkshop"), getWorkOrder(id), getI18n(), getSettings()]);
  if (!wo) notFound();
  // His own car opened: the « Nouveau véhicule pour vous » alert is done.
  if (wo.mechanicId === staff.id) await markAssignmentSeen(wo.id, staff.id).catch(() => {});
  const final = isFinal(wo.status);
  const linesLocked = final || Boolean(wo.invoice);
  const canTime = can(staff, "logOwnLabor");
  const canLines = can(staff, "viewWorkOrders") && !linesLocked;
  const showInspection = can(staff, "performInspection") || can(staff, "viewWorkOrders");
  const [parts, running, labor, inspections, templates] = await Promise.all([
    canLines || showInspection ? partOptions() : Promise.resolve([]),
    canTime ? runningLabor(staff.id) : Promise.resolve(null),
    laborSummary(wo.id),
    showInspection ? inspectionsFor(wo.id) : Promise.resolve([]),
    showInspection ? listTemplates(true) : Promise.resolve([]),
  ]);
  const a = t.app.team.order;
  const { next, alternatives } = workshopMoves(wo, staff, settings);
  const lines = wo.lines.filter((l) => !l.voidedAt);
  const mine = labor.perUser.find((u) => u.userId === staff.id)?.minutes ?? 0;
  const runningHere = running?.workOrder.id === wo.id ? running : null;

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-3 pt-3 pb-8 sm:px-6" data-testid="team-order-screen">
      <nav className="flex items-center gap-2 text-sm">
        <Link href="/garage/app" className="inline-flex min-h-11 items-center gap-1.5 text-gp-muted hover:text-gp-ink">
          <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden /> {a.back}
        </Link>
        <LiveRefresh url={`/api/staff/live?topic=wo:${wo.id}`} liveLabel={t.portal.live} reconnectingLabel={t.portal.reconnecting} className="ms-auto" />
        {can(staff, "viewWorkOrders") && (
          <Link href={`/garage/work-orders/${wo.id}`} className="inline-flex min-h-11 items-center gap-1.5 text-gp-muted hover:text-gp-ink">
            {a.full} <ExternalLink className="size-3.5" aria-hidden />
          </Link>
        )}
      </nav>

      {/* ── The car ── */}
      <header className="space-y-3 rounded-[24px] border border-gp-line bg-gp-card p-5 shadow-gp">
        <div className="flex flex-wrap items-center gap-2">
          <PlateChip plate={wo.vehicle.plate} />
          <span className="font-mono text-xs text-gp-muted">{woNumber(wo.number)}</span>
          <span className="ms-auto">
            <StatusBadge status={wo.status} t={t} />
          </span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">
          {wo.vehicle.make} {wo.vehicle.model}
        </h1>
        <div>
          <p className="text-xs font-medium tracking-wider text-gp-muted uppercase">{a.complaint}</p>
          <p className="mt-1 text-sm">{wo.complaint}</p>
        </div>
        {wo.promisedAt && (
          <p className="inline-flex items-center gap-1.5 text-sm text-gp-muted">
            <CalendarClock className="size-4" aria-hidden /> {fmt(a.promised, { date: formatDateTime(wo.promisedAt, lang) })}
          </p>
        )}
      </header>

      {/* ── Status ── */}
      <section aria-labelledby="o-status" className="space-y-3 rounded-[24px] border border-gp-line bg-gp-card p-5 shadow-gp">
        <h2 id="o-status" className="font-semibold">
          {a.status}
        </h2>
        {!next && alternatives.length === 0 && <p className="text-sm text-gp-muted">{a.noMove}</p>}
        {next && (
          <ActionButton action={workshopStatusAction.bind(null, wo.id, next, null)} className="h-14 w-full text-base" data-testid="order-next">
            {fmt(t.workshop.moveTo, { status: t.status[next] })}
          </ActionButton>
        )}
        {alternatives.length > 0 && (
          <StatusDialog
            key={`status-${wo.status}`}
            action={workshopStatusFormAction.bind(null, wo.id)}
            choices={alternatives.map((o) => ({ to: o.to, label: t.status[o.to], reason: o.reason, rework: wo.workflowLot5 && isReworkMove(wo.status, o.to) }))}
            canOverride={false}
            variant="outline"
            triggerClassName="h-12 w-full text-base"
            trigger={a.otherMoves}
          />
        )}
      </section>

      {/* ── Time spent ── */}
      {canTime && (
        <section aria-labelledby="o-time" className="space-y-3 rounded-[24px] border border-gp-line bg-gp-card p-5 shadow-gp">
          <h2 id="o-time" className="flex items-baseline justify-between font-semibold">
            {a.time}
            <span className="text-sm font-normal text-gp-muted tabular-nums" dir="ltr">
              {minutesToHHMM(labor.personMinutes)}
            </span>
          </h2>
          <p className="text-sm text-gp-muted">
            {fmt(a.mine, { time: minutesToHHMM(mine) })} · {fmt(a.total, { time: minutesToHHMM(labor.personMinutes) })}
          </p>
          {runningHere ? (
            <ActionButton variant="destructive" className="h-14 w-full text-base" action={stopLaborAction.bind(null, runningHere.id, wo.id)} data-testid="order-stop">
              <Timer className="size-5" aria-hidden /> {a.stop} · {fmt(a.runningSince, { time: formatTime(runningHere.startedAt, lang) })}
            </ActionButton>
          ) : running ? (
            <div className="space-y-2">
              <p className="rounded-[14px] bg-gp-accent-tint px-3 py-2 text-sm text-gp-accent-ink">{fmt(a.runningElsewhere, { plate: displayPlate(running.workOrder.vehicle.plate) })}</p>
              <ActionButton variant="outline" className="h-12 w-full" action={stopLaborAction.bind(null, running.id, running.workOrder.id)}>
                <Timer className="size-4" aria-hidden /> {a.stop} · {displayPlate(running.workOrder.vehicle.plate)}
              </ActionButton>
            </div>
          ) : (
            !final && (
              <ActionButton className="h-14 w-full text-base" action={startLaborAction.bind(null, wo.id)} data-testid="order-start">
                <Play className="size-5" aria-hidden /> {a.start}
              </ActionButton>
            )
          )}
        </section>
      )}

      {/* ── Works and parts ── */}
      <section aria-labelledby="o-lines" className="space-y-3 rounded-[24px] border border-gp-line bg-gp-card p-5 shadow-gp">
        <h2 id="o-lines" className="font-semibold">
          {a.lines} <span className="text-gp-muted">· {lines.length}</span>
        </h2>
        {lines.length === 0 ? (
          <p className="text-sm text-gp-muted">{a.noLines}</p>
        ) : (
          <ul className="divide-y divide-gp-line text-sm" data-testid="order-lines">
            {lines.map((l) => (
              <li key={l.id} className={cn("flex items-start gap-3 py-2.5", l.approvalStatus === "REFUSED" && "text-gp-muted line-through")}>
                <span className="w-20 shrink-0 text-xs text-gp-muted">{t.lineType[l.type]}</span>
                <span className="min-w-0 flex-1">{l.description}</span>
                <span className="shrink-0 tabular-nums" dir="ltr">
                  × {formatQty(l.quantityX100, lang)}
                </span>
                {wo.workflowV16 && (
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-xs no-underline",
                      l.approvalStatus === "APPROVED" ? "bg-gp-success-bg text-gp-success-ink" : l.approvalStatus === "REFUSED" ? "bg-gp-danger-bg text-gp-danger-ink" : "bg-gp-panel text-gp-muted",
                    )}
                  >
                    {t.v16.quote.lineStatus[l.approvalStatus]}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {linesLocked ? (
          <p className="rounded-[14px] bg-gp-panel px-3 py-2 text-xs text-gp-muted">{a.locked}</p>
        ) : (
          canLines && (
            <LineAdder
              action={addLineAction.bind(null, wo.id)}
              parts={parts}
              laborRate={settings.laborRate}
              canAnnounceFee={wo.workflowV16 && (wo.status === "RECEIVED" || wo.status === "DIAGNOSIS") && can(staff, "manageQuotes")}
              comeback={!!wo.comebackOfWorkOrderId}
              canBillRework={can(staff, "manageComebacks")}
            />
          )
        )}
      </section>

      {/* ── Inspection (V16 Lot 5) ── */}
      {showInspection && (inspections.length > 0 || (!final && can(staff, "performInspection"))) && (
        <InspectionCard
          workOrderId={wo.id}
          inspections={inspections}
          templates={templates.map((tp) => ({ id: tp.id, name: tp.name }))}
          parts={parts}
          canInspect={can(staff, "performInspection")}
          canQuote={can(staff, "manageQuotes") && !linesLocked}
          final={final}
          t={t}
          lang={lang}
        />
      )}

      {/* ── Photos ── */}
      <section aria-labelledby="o-photos" className="space-y-3 rounded-[24px] border border-gp-line bg-gp-card p-5 shadow-gp">
        <h2 id="o-photos" className="font-semibold">
          {a.photos} <span className="text-gp-muted">· {wo.media.length}</span>
        </h2>
        {wo.media.length === 0 ? (
          <p className="text-sm text-gp-muted">{a.noPhotos}</p>
        ) : (
          <ul className="flex gap-2 overflow-x-auto pb-1">
            {wo.media.slice(0, 12).map((m) => (
              <li key={m.id} className="size-20 shrink-0 overflow-hidden rounded-[14px] bg-gp-panel">
                <a href={`/api/media/${m.id}`} target="_blank" rel="noopener" className="block size-full">
                  {m.kind === "PHOTO" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/media/${m.id}`} alt={m.caption ?? ""} loading="lazy" decoding="async" className="size-full object-cover" />
                  ) : (
                    <span className="grid size-full place-items-center bg-black text-white">
                      <Play className="size-5" aria-hidden />
                    </span>
                  )}
                </a>
              </li>
            ))}
          </ul>
        )}
        {can(staff, "uploadMedia") && !final && <MediaUploader workOrderId={wo.id} status={wo.status} />}
      </section>
    </div>
  );
}
