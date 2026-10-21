import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { MobileNav, Sidebar } from "@/components/garage/sidebar";
import { can } from "@/lib/permissions";
import { getStaff } from "@/lib/session";
import { countUpcomingToday } from "@/server/booking";
import { countOverdue } from "@/server/invoices";
import { countOpenClaims } from "@/server/claims";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/server/settings";
import { countLateRepairs } from "@/server/follow-up";

export const dynamic = "force-dynamic";

export default async function GarageLayout({ children }: { children: ReactNode }) {
  const staff = await getStaff();
  if (!staff) redirect("/login");

  // Menu counters: small COUNT queries in parallel (no rows loaded).
  const [settings, overdue, pendingApprovals, appointmentsToday, openClaims, pendingLeaves, lateRepairs] = await Promise.all([
    getSettings(),
    can(staff.role, "viewClientInvoices") ? countOverdue() : 0,
    staff.role === "ADMIN" ? prisma.purchaseOrder.count({ where: { status: "PENDING_APPROVAL" } }) : 0,
    can(staff.role, "viewAppointments") ? countUpcomingToday() : 0,
    // .catch: the menu must never break, even before the complaints table exists.
    can(staff.role, "manageClaims") ? countOpenClaims().catch(() => 0) : 0,
    // V7 counters: also .catch, so the menu works before migration 4 is applied.
    can(staff.role, "manageTeam") ? prisma.leaveRequest.count({ where: { status: "PENDING" } }).catch(() => 0) : 0,
    can(staff.role, "manageRepairFollowUp") ? countLateRepairs().catch(() => 0) : 0,
  ]);

  // Counters in the menu: today's remaining bookings, late customer invoices, orders waiting for the admin.
  const badges = {
    appointments: appointmentsToday || undefined,
    clientInvoices: overdue || undefined,
    purchaseOrders: pendingApprovals || undefined,
    claims: openClaims || undefined,
    team: pendingLeaves || undefined,
    delays: lateRepairs || undefined,
  };
  const user = { name: staff.name, role: staff.role };

  return (
    // Phones/tablets: the whole page scrolls (the browser bar can hide, pull-to-refresh works).
    // Computers (lg): fixed sidebar, only the content column scrolls.
    <div className="ferrari min-h-dvh bg-background text-foreground lg:grid lg:h-dvh lg:grid-cols-[250px_minmax(0,1fr)] lg:overflow-hidden print:block print:h-auto">
      <Sidebar user={user} garageName={settings.garageName} badges={badges} />
      <main className="min-w-0 lg:h-dvh lg:overflow-y-auto print:h-auto print:overflow-visible">
        <MobileNav user={user} garageName={settings.garageName} badges={badges} />
        {children}
      </main>
    </div>
  );
}
