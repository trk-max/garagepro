import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import type { NavBadges } from "@/components/shell/nav";
import { getI18n } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { getStaff } from "@/lib/session";
import { countUpcomingToday } from "@/server/booking";
import { countOverdue } from "@/server/invoices";
import { countOpenClaims } from "@/server/claims";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/server/settings";
import { countLateRepairs } from "@/server/follow-up";
import { backupProblem } from "@/server/backups";
import { unreadForStaff } from "@/server/messaging";
import { countExpiringContracts } from "@/server/contracts";

export const dynamic = "force-dynamic";

export default async function GarageLayout({ children }: { children: ReactNode }) {
  const staff = await getStaff();
  if (!staff) redirect("/login");

  // Menu counters: small COUNT queries in parallel (no rows loaded).
  const [{ t }, settings, overdue, pendingApprovals, appointmentsToday, openClaims, pendingLeaves, lateRepairs, backupAlert, unreadMessages, expiringContracts] = await Promise.all([
    getI18n(),
    getSettings(),
    can(staff.role, "viewClientInvoices") ? countOverdue() : 0,
    staff.role === "ADMIN" ? prisma.purchaseOrder.count({ where: { status: "PENDING_APPROVAL" } }) : 0,
    can(staff.role, "viewAppointments") ? countUpcomingToday() : 0,
    // .catch: the menu must never break, even before the complaints table exists.
    can(staff.role, "manageClaims") ? countOpenClaims().catch(() => 0) : 0,
    // V7 counters: also .catch, so the menu works before migration 4 is applied.
    can(staff.role, "manageTeam") ? prisma.leaveRequest.count({ where: { status: "PENDING" } }).catch(() => 0) : 0,
    can(staff.role, "manageRepairFollowUp") ? countLateRepairs().catch(() => 0) : 0,
    // Backups run on the garage PC: warn the administrator when the last one failed, is too old or was not restore-tested.
    staff.role === "ADMIN" ? backupProblem() : 0,
    // Showroom (V9): unread buyer messages in this person's conversations only. .catch: menu never breaks before migration 18.
    can(staff.role, "useShowroomMessages") ? unreadForStaff(staff).catch(() => 0) : 0,
    // V9: contracts ending soon, only for the categories this role may see (.catch: menu never breaks).
    can(staff.role, "viewContracts") ? countExpiringContracts(staff.role).catch(() => 0) : 0,
  ]);

  // Counters on the rail, in the "More" panel and behind the bell: today's remaining bookings,
  // late customer invoices, orders waiting for the admin, unread messages…
  const badges: NavBadges = {
    appointments: appointmentsToday || undefined,
    clientInvoices: overdue || undefined,
    purchaseOrders: pendingApprovals || undefined,
    claims: openClaims || undefined,
    team: pendingLeaves || undefined,
    delays: lateRepairs || undefined,
    backups: backupAlert || undefined,
    messages: unreadMessages || undefined,
    contracts: expiringContracts || undefined,
  };

  return (
    // V10 shell: pill top bar + icon rail (bottom bar below 1280 px). The whole page scrolls.
    <AppShell
      user={{ id: staff.id, name: staff.name, email: staff.email, role: staff.role }}
      garage={{ name: settings.garageName, logo: settings.logoDataUrl }}
      badges={badges}
      skipLabel={t.v10.nav.skip}
    >
      {children}
    </AppShell>
  );
}
