import type { WorkOrderStatus } from "@prisma/client";
import { ClipboardList } from "lucide-react";
import { PlateChip } from "@/components/garage/badges";
import { DataTable, type DataColumn } from "@/components/ui/redesign/data-table";
import { StatusDot } from "@/components/ui/redesign/chip";
import { EmptyState, PillLink, Surface, SurfaceHeader } from "@/components/ui/redesign/surface";
import type { Dictionary } from "@/lib/i18n/fr";
import { displayPlate, formatDate, formatDateTime, formatMoney, woNumber, type Lang } from "@/lib/format";
import type { recentOrderRows } from "@/server/overview-orders";
import { ACTIVE_STATUSES } from "@/server/workflow";

/** Dot colour per repair status (the label carries the meaning; the colour only helps scanning). */
export const STATUS_DOT: Record<WorkOrderStatus, string> = {
  RECEIVED: "#8a8a90",
  DIAGNOSIS: "#7c5cd6",
  QUOTE_SENT: "#d9a21b",
  WAITING_INSURANCE: "#c04fc0",
  WAITING_PARTS: "#e2603a",
  IN_PROGRESS: "#3b82f6",
  QUALITY_CONTROL: "#0ea5b7",
  WASHING: "#38bdf8",
  READY: "#2e9e5b",
  DELIVERED: "#a1a1aa",
  CANCELLED: "#d64545",
  QUOTE_REFUSED: "#c2416b",
  WAITING_CUSTOMER: "#c9a227",
  CLOSED: "#71717a",
};

type Row = Awaited<ReturnType<typeof recentOrderRows>>[number];

/** "Recent repair orders" card: semantic table, search + status filter, clickable rows; price only for finance roles. */
export function RecentOrders({ t, lang, rows, finance }: { t: Dictionary; lang: Lang; rows: Row[]; finance: boolean }) {
  const o = t.v10.overview;
  const columns: DataColumn[] = [
    { key: "order", header: o.order },
    { key: "vehicle", header: o.vehicle },
    { key: "customer", header: o.customer, hideBelow: "sm" },
    { key: "service", header: o.service, className: "max-w-56", hideBelow: "2xl" },
    ...(finance ? [{ key: "price", header: o.price, className: "text-end", hideBelow: "sm" as const }] : []),
    { key: "status", header: o.status },
    { key: "date", header: o.date, hideBelow: "lg" },
  ];
  const statuses = [...new Set(rows.map((r) => r.status))];
  return (
    <Surface aria-labelledby="ov-orders">
      <SurfaceHeader id="ov-orders" title={o.recentOrders}>
        <PillLink href="/garage/work-orders" variant="outline" className="h-10">
          {o.viewAll}
        </PillLink>
      </SurfaceHeader>
      {rows.length === 0 ? (
        <EmptyState icon={ClipboardList} title={o.noOrders} />
      ) : (
        <DataTable
          caption={o.recentOrders}
          columns={columns}
          filters={[...ACTIVE_STATUSES, "DELIVERED", "CLOSED", "CANCELLED"].filter((s) => statuses.includes(s as WorkOrderStatus)).map((s) => ({ value: s, label: t.status[s as WorkOrderStatus] }))}
          labels={{ search: o.filterRows, filter: o.filter, all: o.allStatuses, empty: o.noMatch }}
          rows={rows.map((r) => ({
            id: r.id,
            href: `/garage/work-orders/${r.id}`,
            linkLabel: woNumber(r.number),
            filter: r.status,
            search: [woNumber(r.number), r.vehicle.plate, displayPlate(r.vehicle.plate), r.vehicle.make, r.vehicle.model, r.customer.name, r.service].join(" "),
            cells: {
              order: <span className="font-mono text-[13px] whitespace-nowrap">{woNumber(r.number)}</span>,
              vehicle: (
                <span className="flex flex-col items-start gap-1 whitespace-nowrap">
                  <PlateChip plate={r.vehicle.plate} />
                  <span className="text-xs text-gp-muted">{[r.vehicle.make, r.vehicle.model].filter(Boolean).join(" ")}</span>
                </span>
              ),
              customer: <span className="whitespace-nowrap">{r.customer.name}</span>,
              service: <span className="line-clamp-1 text-[13px]" title={r.service}>{r.service}</span>,
              price: r.price === null ? null : <span className="font-medium whitespace-nowrap tabular-nums" dir="ltr">{formatMoney(r.price, lang)}</span>,
              status: <StatusDot color={STATUS_DOT[r.status]}>{t.status[r.status]}</StatusDot>,
              date: <time dateTime={r.updatedAt.toISOString()} title={formatDateTime(r.updatedAt, lang)} className="text-[13px] whitespace-nowrap text-gp-muted">{formatDate(r.updatedAt, lang)}</time>,
            },
          }))}
        />
      )}
    </Surface>
  );
}
