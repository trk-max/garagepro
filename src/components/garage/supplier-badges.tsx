import type { PurchaseOrderStatus, SupplierInvoiceStatus } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import type { Dictionary } from "@/lib/i18n/fr";

const PO_CLASS: Record<PurchaseOrderStatus, string> = {
  PENDING_APPROVAL: "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-300",
  APPROVED: "bg-blue-500/10 text-blue-700 border-blue-500/20 dark:text-blue-300",
  PARTIAL: "bg-orange-500/10 text-orange-700 border-orange-500/30 dark:text-orange-300",
  RECEIVED: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-300",
  REJECTED: "bg-red-500/10 text-red-700 border-red-500/20 dark:text-red-300",
  CANCELLED: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20",
};

export function PoBadge({ status, t }: { status: PurchaseOrderStatus; t: Dictionary }) {
  return (
    <Badge variant="outline" className={PO_CLASS[status]}>
      {t.purchase.statuses[status]}
    </Badge>
  );
}

const SI_CLASS: Record<SupplierInvoiceStatus, string> = {
  UNPAID: "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-300",
  PARTIAL: "bg-orange-500/10 text-orange-700 border-orange-500/30 dark:text-orange-300",
  PAID: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-300",
};

export function SupplierInvoiceBadge({ status, t }: { status: SupplierInvoiceStatus; t: Dictionary }) {
  return (
    <Badge variant="outline" className={SI_CLASS[status]}>
      {t.supplierInvoices.statuses[status]}
    </Badge>
  );
}
