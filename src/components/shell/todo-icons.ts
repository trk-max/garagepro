import {
  BadgeCheck, Boxes, CalendarCheck, CarFront, ClipboardCheck, DatabaseBackup, FilePen, FileSignature, FileText, FileWarning, Hourglass,
  IdCard, Mail, MessageSquareWarning, PackageSearch, ShieldAlert, ShieldCheck, ShoppingCart, TriangleAlert, Umbrella,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { TodoKey } from "@/lib/todo";

/** Icon of each "À traiter" line (bell and /garage/a-traiter). */
export const TODO_ICONS: Record<TodoKey, LucideIcon> = {
  vehicleInfo: FileWarning,
  quoteWaiting: Hourglass,
  readyNotDelivered: CarFront,
  lateRepairs: TriangleAlert,
  missingParts: PackageSearch,
  insuranceWaiting: Umbrella,
  overdueInvoices: FileText,
  openClaims: MessageSquareWarning,
  unreadMessages: Mail,
  warrantyOpen: ShieldAlert,
  contractDrafts: FilePen,
  contractsExpiring: FileSignature,
  certificateFields: IdCard,
  lowStock: Boxes,
  backup: DatabaseBackup,
  leaves: CalendarCheck,
  purchaseOrders: ShoppingCart,
  qualityChecks: ClipboardCheck,
  contractsToApprove: BadgeCheck,
  contractsToSign: FileSignature,
  warrantyDecisions: ShieldCheck,
};
