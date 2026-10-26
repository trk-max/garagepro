import {
  BadgeCheck, Boxes, CalendarCheck, CalendarClock, CarFront, ClipboardCheck, DatabaseBackup, FilePen, FileSignature, FileText, FileWarning, Hourglass,
  IdCard, Mail, MessageSquareWarning, PackagePlus, PackageSearch, ShieldAlert, ShieldCheck, ShoppingCart, TriangleAlert, Umbrella,
  Ticket, UserRoundSearch, HandCoins,
} from "lucide-react";
import { Award, CalendarX, GraduationCap, UserCog, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { TodoKey } from "@/lib/todo";

/** Icon of each "À traiter" line (bell and /garage/a-traiter). */
export const TODO_ICONS: Record<TodoKey, LucideIcon> = {
  vehicleInfo: FileWarning,
  quoteWaiting: Hourglass,
  readyNotDelivered: CarFront,
  // V16
  waitingCustomer: UserRoundSearch,
  deliveredUnpaid: HandCoins,
  lateRepairs: TriangleAlert,
  missingParts: PackageSearch,
  insuranceWaiting: Umbrella,
  overdueInvoices: FileText,
  // Paiements partiels
  paymentPromisesDue: CalendarX,
  partialPayments: Wallet,
  openClaims: MessageSquareWarning,
  // V16 Lot 5
  lowRatings: MessageSquareWarning,
  newAssignments: CarFront,
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
  // V14 — compétences
  skillCertificates: Award,
  skillWarnings: UserCog,
  skillReviews: GraduationCap,
  // V15 — accueil : clients qui attendent trop longtemps.
  receptionWaiting: Ticket,
};
