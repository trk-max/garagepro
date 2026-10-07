import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { MobileNav, Sidebar } from "@/components/garage/sidebar";
import { can } from "@/lib/permissions";
import { getStaff } from "@/lib/session";
import { countUpcomingToday } from "@/server/booking";
import { overdueSummary } from "@/server/invoices";
import { purchasingSummary } from "@/server/purchasing";
import { getSettings } from "@/server/settings";

export const dynamic = "force-dynamic";

export default async function GarageLayout({ children }: { children: ReactNode }) {
  const staff = await getStaff();
  if (!staff) redirect("/login");

  const [settings, overdue, purchasing, appointmentsToday] = await Promise.all([
    getSettings(),
    can(staff.role, "viewClientInvoices") ? overdueSummary() : null,
    can(staff.role, "requestPurchase") ? purchasingSummary() : null,
    can(staff.role, "viewAppointments") ? countUpcomingToday() : 0,
  ]);

  // Counters in the menu: today's remaining bookings, late customer invoices, orders waiting for the admin.
  const badges = {
    appointments: appointmentsToday || undefined,
    clientInvoices: overdue?.count,
    purchaseOrders: staff.role === "ADMIN" ? purchasing?.pendingApprovals : undefined,
  };
  const user = { name: staff.name, role: staff.role };

  return (
    <div className="h-dvh overflow-hidden bg-background text-foreground lg:grid lg:grid-cols-[250px_minmax(0,1fr)] print:block print:h-auto">
      <Sidebar user={user} garageName={settings.garageName} badges={badges} />
      <main className="h-dvh min-w-0 overflow-y-auto print:h-auto print:overflow-visible">
        <MobileNav user={user} garageName={settings.garageName} badges={badges} />
        {children}
      </main>
    </div>
  );
}
