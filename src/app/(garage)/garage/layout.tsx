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

export const dynamic = "force-dynamic";

export default async function GarageLayout({ children }: { children: ReactNode }) {
  const staff = await getStaff();
  if (!staff) redirect("/login");

  // Menu counters: small COUNT queries in parallel (no rows loaded).
  const [settings, overdue, pendingApprovals, appointmentsToday, openClaims] = await Promise.all([
    getSettings(),
    can(staff.role, "viewClientInvoices") ? countOverdue() : 0,
    staff.role === "ADMIN" ? prisma.purchaseOrder.count({ where: { status: "PENDING_APPROVAL" } }) : 0,
    can(staff.role, "viewAppointments") ? countUpcomingToday() : 0,
    // .catch: the menu must never break, even before the complaints table exists.
    can(staff.role, "manageClaims") ? countOpenClaims().catch(() => 0) : 0,
  ]);

  // Counters in the menu: today's remaining bookings, late customer invoices, orders waiting for the admin.
  const badges = {
    appointments: appointmentsToday || undefined,
    clientInvoices: overdue || undefined,
    purchaseOrders: pendingApprovals || undefined,
    claims: openClaims || undefined,
  };
  const user = { name: staff.name, role: staff.role };

  return (
    <div className="ferrari h-dvh overflow-hidden bg-background text-foreground lg:grid lg:grid-cols-[250px_minmax(0,1fr)] print:block print:h-auto">
      <Sidebar user={user} garageName={settings.garageName} badges={badges} />
      <main className="h-dvh min-w-0 overflow-y-auto print:h-auto print:overflow-visible">
        <MobileNav user={user} garageName={settings.garageName} badges={badges} />
        {children}
      </main>
    </div>
  );
}
