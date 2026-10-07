import Link from "next/link";
import { CalendarClock, ChevronRight, Images } from "lucide-react";
import { workshopStatusAction } from "@/actions/workshop";
import { ActionButton } from "@/components/action-form";
import { PlateChip, PriorityBadge, StatusBadge } from "@/components/garage/badges";
import { MediaUploader } from "@/components/garage/media-uploader";
import { LiveRefresh } from "@/components/live-refresh";
import { fmt, formatDateTime } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { requirePageAccess } from "@/lib/session";
import { cn } from "@/lib/utils";
import { workshopOrders } from "@/server/work-orders";
import { NEXT_STEP, TRANSITIONS } from "@/server/workflow";

type PageProps = { searchParams: Promise<{ view?: string }> };

/**
 * Phone/tablet screen for mechanics: one card per vehicle, big buttons to move
 * to the next step, camera button. Every tap updates the customer's tracker live.
 */
export default async function WorkshopPage({ searchParams }: PageProps) {
  const staff = await requirePageAccess("useWorkshop");
  const { view } = await searchParams;
  const mineOnly = view ? view === "mine" : staff.role === "MECHANIC";
  const [{ t, lang }, orders] = await Promise.all([getI18n(), workshopOrders(mineOnly ? staff.id : undefined)]);

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-3 sm:p-6">
      <header className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold">{t.workshop.title}</h1>
        <LiveRefresh url="/api/staff/stream?topic=workshop" liveLabel={t.portal.live} reconnectingLabel={t.portal.reconnecting} />
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
          const next = NEXT_STEP[wo.status];
          const alternatives = TRANSITIONS[wo.status].filter((s) => s !== next && s !== "CANCELLED" && s !== "DELIVERED");
          return (
            <li key={wo.id} className="rounded-xl border bg-card p-4 shadow-xs">
              <div className="flex flex-wrap items-center gap-2">
                <PlateChip plate={wo.vehicle.plate} />
                <span className="font-semibold">
                  {wo.vehicle.make} {wo.vehicle.model}
                </span>
                <PriorityBadge priority={wo.priority} t={t} />
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

              <div className="mt-3 flex flex-wrap gap-2">
                {next && next !== "DELIVERED" && (
                  <ActionButton action={workshopStatusAction.bind(null, wo.id, next)} className="h-12 flex-[2] text-base">
                    {fmt(t.workshop.moveTo, { status: t.status[next] })}
                  </ActionButton>
                )}
                <MediaUploader workOrderId={wo.id} compact />
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                  {alternatives.map((s) => (
                    <ActionButton key={s} size="sm" variant="secondary" action={workshopStatusAction.bind(null, wo.id, s)}>
                      {fmt(t.workshop.moveTo, { status: t.status[s] })}
                    </ActionButton>
                  ))}
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
