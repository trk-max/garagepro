import Link from "next/link";
import { CalendarClock, ChevronRight, Images, Play, Timer, Trash2 } from "lucide-react";
import { deleteMediaAction, workshopStatusAction, workshopStatusFormAction } from "@/actions/workshop";
import { startLaborAction, stopLaborAction } from "@/actions/follow-up";
import { ActionButton } from "@/components/action-form";
import { StatusDialog } from "@/components/garage/status-dialog";
import { PlateChip, PriorityBadge, StatusBadge } from "@/components/garage/badges";
import { MediaUploader } from "@/components/garage/media-uploader";
import { LiveRefresh } from "@/components/live-refresh";
import { fmt, formatDateTime, formatTime } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { requirePageAccess } from "@/lib/session";
import { cn } from "@/lib/utils";
import { runningLabor } from "@/server/labor";
import { getSettings } from "@/server/settings";
import { workshopOrders } from "@/server/work-orders";
import { NEXT_STEP, availableTransitions } from "@/server/workflow";
import { SkillAssignCard, SupervisedBadge } from "@/components/skills/assign-card";
import { assignmentOptions, listSkills } from "@/server/skills";

type PageProps = { searchParams: Promise<{ view?: string }> };

/**
 * Phone/tablet screen for mechanics: one card per vehicle, big buttons to move
 * to the next step, camera button. Every tap updates the customer's tracker live.
 */
export default async function WorkshopPage({ searchParams }: PageProps) {
  const staff = await requirePageAccess("useWorkshop");
  const { view } = await searchParams;
  const mineOnly = view ? view === "mine" : staff.role === "MECHANIC";
  const [{ t, lang }, orders, running, settings] = await Promise.all([getI18n(), workshopOrders(mineOnly ? staff.id : undefined), runningLabor(staff.id), getSettings()]);
  const canTime = can(staff, "logOwnLabor");
  // V14: assisted assignment on each card (same server rule as the work order page).
  const canAssign = can(staff, "viewWorkOrders");
  const [assign, skills] = canAssign && orders.length ? await Promise.all([assignmentOptions(orders.map((o) => o.id)), listSkills()]) : [null, []];

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-3 sm:p-6">
      <header className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold">{t.workshop.title}</h1>
        <LiveRefresh url="/api/staff/live?topic=workshop" liveLabel={t.portal.live} reconnectingLabel={t.portal.reconnecting} />
        <nav className="ms-auto inline-flex rounded-md border p-0.5 text-sm">
          {(["mine", "all"] as const).map((v) => (
            <Link
              key={v}
              href={`/garage/atelier?view=${v}`}
              className={cn("rounded px-3 py-1.5", (v === "mine") === mineOnly ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
            >
              {v === "mine" ? t.workshop.mine : t.workshop.all}
            </Link>
          ))}
        </nav>
      </header>

      {orders.length === 0 && <p className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">{t.workshop.empty}</p>}

      <ul className="space-y-3">
        {orders.map((wo) => {
          // V16: only the moves this person may make (a mechanic: the technical steps); delivery and cancelling
          // are done from the order page. A move that needs a reason opens the reason dialog.
          const options = availableTransitions(wo.status, staff, {
            workflowV16: wo.workflowV16,
            quoteApproved: !!wo.quoteApprovedAt,
            allowWorkWithoutQuote: settings.allowWorkWithoutQuote,
            invoiced: false,
          }).filter((o) => o.to !== "CANCELLED" && o.to !== "DELIVERED" && !o.needsApproval);
          const nextOption = options.find((o) => o.to === NEXT_STEP[wo.status]);
          const next = nextOption && !nextOption.reason ? nextOption.to : undefined;
          const alternatives = options.filter((o) => o.to !== next);
          return (
            <li key={wo.id} className="rounded-xl border bg-card p-4 shadow-xs">
              <div className="flex flex-wrap items-center gap-2">
                <PlateChip plate={wo.vehicle.plate} />
                <span className="font-semibold">
                  {wo.vehicle.make} {wo.vehicle.model}
                </span>
                <PriorityBadge priority={wo.priority} t={t} />
                {wo.supervisor && <SupervisedBadge name={wo.supervisor.name} t={t} />}
                <span className="ms-auto">
                  <StatusBadge status={wo.status} t={t} />
                </span>
              </div>
              <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{wo.complaint}</p>
              <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>{wo.customer.name}</span>
                {wo.promisedAt && (
                  <span className="inline-flex items-center gap-1">
                    <CalendarClock className="size-3.5" aria-hidden /> {formatDateTime(wo.promisedAt, lang)}
                  </span>
                )}
                {!mineOnly && <span>{wo.mechanic?.name ?? t.workOrders.unassigned}</span>}
                {wo._count.media > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <Images className="size-3.5" aria-hidden /> {wo._count.media}
                  </span>
                )}
              </p>

              {wo.media.length > 0 && (
                <ul className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label={t.tracking.media}>
                  {wo.media.map((m) => (
                    <li key={m.id} className="relative size-20 shrink-0 overflow-hidden border bg-muted">
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
                      {can(staff, "uploadMedia") && (
                        <ActionButton
                          size="icon-sm"
                          variant="secondary"
                          className="absolute end-1 top-1 size-7 bg-black/70 text-white hover:bg-brand-500 hover:text-white"
                          aria-label={t.common.delete}
                          confirm={`${t.common.delete} ?`}
                          action={deleteMediaAction.bind(null, m.id)}
                        >
                          <Trash2 className="size-3.5" aria-hidden />
                        </ActionButton>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                {next && (
                  <ActionButton action={workshopStatusAction.bind(null, wo.id, next, null)} className="h-12 flex-[2] text-base">
                    {fmt(t.workshop.moveTo, { status: t.status[next] })}
                  </ActionButton>
                )}
                <MediaUploader workOrderId={wo.id} compact />
              </div>
              {assign?.get(wo.id) && (
                <details className="mt-3 rounded-lg border px-3 py-2">
                  <summary className="flex min-h-10 cursor-pointer items-center text-sm font-medium">{t.v14.assign.open}</summary>
                  <div className="pt-2">
                    <SkillAssignCard o={assign.get(wo.id)!} skills={skills} staff={staff} t={t} lang={lang} compact />
                  </div>
                </details>
              )}
              {canTime &&
                (running?.workOrder.id === wo.id ? (
                  <ActionButton variant="destructive" className="mt-2 h-11 w-full" action={stopLaborAction.bind(null, running.id, wo.id)}>
                    <Timer className="size-4" aria-hidden /> {t.v7.labor.stop} · {fmt(t.v7.labor.running, { time: formatTime(running.startedAt, lang) })}
                  </ActionButton>
                ) : (
                  <ActionButton variant="outline" className="mt-2 h-11 w-full" action={startLaborAction.bind(null, wo.id)}>
                    <Timer className="size-4" aria-hidden /> {t.v7.labor.start}
                  </ActionButton>
                ))}
              <div className="mt-2 flex flex-wrap gap-2">
                  {alternatives.map((o) =>
                    o.reason ? (
                      <StatusDialog
                        key={o.to}
                        action={workshopStatusFormAction.bind(null, wo.id)}
                        choices={[{ to: o.to, label: t.status[o.to], reason: true }]}
                        canOverride={false}
                        variant="secondary"
                        triggerClassName="h-8 px-3 text-sm"
                        trigger={fmt(t.workshop.moveTo, { status: t.status[o.to] })}
                      />
                    ) : (
                      <ActionButton key={o.to} size="sm" variant="secondary" action={workshopStatusAction.bind(null, wo.id, o.to, null)}>
                        {fmt(t.workshop.moveTo, { status: t.status[o.to] })}
                      </ActionButton>
                    ),
                  )}
                  <Link href={`/garage/work-orders/${wo.id}`} className="ms-auto inline-flex items-center gap-1 self-center text-sm text-muted-foreground hover:text-foreground">
                    {t.workshop.details} <ChevronRight className="size-4 rtl:rotate-180" aria-hidden />
                  </Link>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
