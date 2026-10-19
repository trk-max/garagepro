import type { InvoiceStatus, Priority, WorkOrderStatus } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import type { Dictionary } from "@/lib/i18n/fr";
import { cn } from "@/lib/utils";

const STATUS_CLASS: Record<WorkOrderStatus, string> = {
  RECEIVED: "bg-slate-500/10 text-slate-700 border-slate-500/20 dark:text-slate-300",
  DIAGNOSIS: "bg-violet-500/10 text-violet-700 border-violet-500/20 dark:text-violet-300",
  QUOTE_SENT: "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-300",
  WAITING_INSURANCE: "bg-fuchsia-500/10 text-fuchsia-700 border-fuchsia-500/30 dark:text-fuchsia-300",
  WAITING_PARTS: "bg-orange-500/10 text-orange-700 border-orange-500/30 dark:text-orange-300",
  IN_PROGRESS: "bg-blue-500/10 text-blue-700 border-blue-500/20 dark:text-blue-300",
  QUALITY_CONTROL: "bg-cyan-500/10 text-cyan-700 border-cyan-500/30 dark:text-cyan-300",
  WASHING: "bg-sky-500/10 text-sky-700 border-sky-500/30 dark:text-sky-300",
  READY: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-300",
  DELIVERED: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20",
  CANCELLED: "bg-red-500/10 text-red-700 border-red-500/20 dark:text-red-300",
};

export function StatusBadge({ status, t, className }: { status: WorkOrderStatus; t: Dictionary; className?: string }) {
  return (
    <Badge variant="outline" className={cn(STATUS_CLASS[status], className)}>
      {t.status[status]}
    </Badge>
  );
}

export function PriorityBadge({ priority, t }: { priority: Priority; t: Dictionary }) {
  if (priority === "NORMAL") return null;
  return (
    <Badge variant="outline" className={priority === "URGENT" ? "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300" : "text-muted-foreground"}>
      {t.priority[priority]}
    </Badge>
  );
}

const INVOICE_CLASS: Record<InvoiceStatus, string> = {
  ISSUED: "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-300",
  PARTIAL: "bg-orange-500/10 text-orange-700 border-orange-500/30 dark:text-orange-300",
  PAID: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-300",
};

export function InvoiceBadge({ status, t }: { status: InvoiceStatus; t: Dictionary }) {
  return (
    <Badge variant="outline" className={INVOICE_CLASS[status]}>
      {t.invoiceStatus[status]}
    </Badge>
  );
}

/** Tunisian-style plate chip. */
export function PlateChip({ plate }: { plate: string }) {
  const m = /^(\d{1,3})(TU|RS)(\d{1,4})$/.exec(plate);
  return (
    <span dir="ltr" className="inline-flex shrink-0 items-center whitespace-nowrap rounded-sm border border-white/25 bg-black px-1.5 py-0.5 font-mono text-xs font-semibold tracking-wide text-white">
      {m ? `${m[1]} ${m[2] === "TU" ? "تونس" : m[2]} ${m[3]}` : plate}
    </span>
  );
}
