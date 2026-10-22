import {
  BadgeCheck, Boxes, CalendarCheck, CalendarClock, CarFront, ClipboardCheck, DatabaseBackup, FilePen, FileSignature, FileText, FileWarning, Hourglass,
  IdCard, Mail, MessageSquareWarning, PackagePlus, PackageSearch, ShieldAlert, ShieldCheck, ShoppingCart, TriangleAlert, Umbrella,
  Ticket,
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
  agendaDue: CalendarClock,
  agendaParts: PackagePlus,
  // V15 — accueil : clients qui attendent trop longtemps.
  receptionWaiting: Ticket,
};
