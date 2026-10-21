import Link from "next/link";
import type { WorkOrderStatus } from "@prisma/client";
import { Activity as ActivityIcon, CircleCheck, FileText } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { describeEvent } from "@/components/garage/timeline";
import { STATUS_DOT } from "@/components/overview/recent-orders";
import { Chip, StatusDot } from "@/components/ui/redesign/chip";
import { EmptyState, IconBubble, PillLink, Surface, SurfaceHeader } from "@/components/ui/redesign/surface";
import type { recentActivity, recentInvoices } from "@/server/dashboard";
import type { Dictionary } from "@/lib/i18n/fr";
import { displayPlate, fmt, formatDateTime, formatMoney, woNumber, type Lang } from "@/lib/format";

export type WatchTile = { label: string; value: string; note?: string; icon: LucideIcon; href: string; tone?: "danger" | "accent" | "success" };

/** "Keep an eye on": the small figures of the former dashboard (unpaid, overdue, purchases, team…). */
export function WatchCard({ title, tiles }: { title: string; tiles: WatchTile[] }) {
  return (
    <Surface aria-labelledby="ov-watch">
      <SurfaceHeader id="ov-watch" title={title} />
      <ul className="gp-stagger grid grid-cols-[repeat(auto-fill,minmax(min(100%,15rem),1fr))] gap-2">
        {tiles.map(({ label, value, note, icon, href, tone }) => (
          <li key={label}>
            <Link href={href} className="gp-lift flex h-full items-center gap-3 rounded-[18px] bg-gp-panel p-3 hover:bg-gp-hover">
              <IconBubble icon={icon} />
              <span className="@container min-w-0 flex-1">
                <span className="block text-xs text-gp-muted">{label}</span>
                {/* Fluid size: the longest amounts ("1 227,300 DT") stay on one line, never cut. */}
                <span
                  className={`block font-semibold whitespace-nowrap tabular-nums ${tone === "danger" ? "text-gp-danger-ink" : tone === "accent" ? "text-gp-accent-ink" : ""}`}
                  style={{ fontSize: "clamp(13px, 11cqi, 18px)" }}
                  dir="ltr"
                >
                  {value}
                </span>
                {note && <span className="block text-xs text-gp-muted">{note}</span>}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Surface>
  );
}

/** Workshop by status: one pill per active status with its count. */
export function StatusCard({ t, byStatus, statuses }: { t: Dictionary; byStatus: Record<WorkOrderStatus, number>; statuses: WorkOrderStatus[] }) {
  return (
    <Surface aria-labelledby="ov-status">
      <SurfaceHeader id="ov-status" title={t.dashboard.byStatus} />
      <ul className="flex flex-wrap gap-2">
        {statuses.map((s) => (
          <li key={s}>
            <Link href={`/garage/work-orders?status=${s}`} className="gp-lift flex h-10 items-center gap-3 rounded-full bg-gp-panel ps-3 pe-1.5 hover:bg-gp-hover">
              <StatusDot color={STATUS_DOT[s]}>{t.status[s]}</StatusDot>
              <span className="grid h-7 min-w-7 place-items-center rounded-full bg-gp-card px-2 text-[13px] font-semibold tabular-nums">{byStatus[s]}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Surface>
  );
}

type Inv = Awaited<ReturnType<typeof recentInvoices>>[number];

/** Latest customer invoices + billing health (overdue). Finance roles only. */
export function InvoicesCard({ t, lang, invoices, overdue, unpaid }: { t: Dictionary; lang: Lang; invoices: Inv[]; overdue: number; unpaid: number }) {
  const db = t.v7.dash;
  return (
    <Surface aria-labelledby="ov-inv">
      <SurfaceHeader id="ov-inv" title={db.recentInvoices} hint={db.recentInvoicesHint}>
        <PillLink href="/garage/invoices" variant="outline" className="h-10">{t.v10.overview.viewAll}</PillLink>
      </SurfaceHeader>
      <div className={`mb-3 flex flex-wrap items-center gap-2 rounded-[18px] p-3 text-[13px] ${overdue ? "bg-gp-danger-bg text-gp-danger-ink" : "bg-gp-success-bg text-gp-success-ink"}`}>
        {overdue ? (
          <>
            <span className="flex-1">{fmt(db.billingLate, { n: overdue })} {t.dashboard.unpaid} : <b dir="ltr">{formatMoney(unpaid, lang)}</b></span>
            <Link href="/garage/invoices?status=OVERDUE" className="font-semibold underline underline-offset-2">{t.dashboard.overdue}</Link>
          </>
        ) : (
          <><CircleCheck className="size-4" aria-hidden /> {db.billingOk}</>
        )}
      </div>
      {invoices.length === 0 ? (
        <EmptyState icon={FileText} title="—" />
      ) : (
        <ul className="-mx-2">
          {invoices.map((i) => {
            const due = i.totalTtc - i.paidAmount;
            return (
              <li key={i.id}>
                <Link href={`/garage/invoices/${i.id}`} className="flex items-center gap-3 rounded-[14px] px-3 py-2 hover:bg-gp-hover">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">{i.customer.name}</span>
                    <span className="font-mono text-xs text-gp-muted">{i.number}</span>
                  </span>
                  <span className="text-end">
                    <span className="block text-[13px] font-semibold tabular-nums" dir="ltr">{formatMoney(i.totalTtc, lang)}</span>
                    <Chip tone={due > 0 ? "accent" : "success"} className="h-5">{due > 0 ? `${db.due} ${formatMoney(due, lang)}` : db.paid}</Chip>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Surface>
  );
}

type Ev = Awaited<ReturnType<typeof recentActivity>>[number];

/** Who did what on the repair orders, latest first. */
export function ActivityCard({ t, lang, events }: { t: Dictionary; lang: Lang; events: Ev[] }) {
  const db = t.v7.dash;
  return (
    <Surface aria-labelledby="ov-act">
      <SurfaceHeader id="ov-act" title={db.activity} hint={db.activityHint} />
      {events.length === 0 ? (
        <EmptyState icon={ActivityIcon} title={db.noActivity} />
      ) : (
        <ul className="-mx-2">
          {events.map((e) => (
            <li key={e.id}>
              <Link href={`/garage/work-orders/${e.workOrder.id}`} className="block rounded-[14px] px-3 py-2 hover:bg-gp-hover">
                <span className="block text-[13px]">
                  <span className="font-medium">{e.actor?.name ?? t.events.system}</span> <span className="text-gp-muted">{describeEvent(e, t, lang)}</span>
                </span>
                <span className="text-xs text-gp-muted">
                  <span className="font-mono">{woNumber(e.workOrder.number)}</span> · <span dir="ltr">{displayPlate(e.workOrder.vehicle.plate)}</span> · {formatDateTime(e.createdAt, lang)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Surface>
  );
}
