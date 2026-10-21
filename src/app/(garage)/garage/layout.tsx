import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import type { NavBadges } from "@/components/shell/nav";
import { getI18n } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { getStaff } from "@/lib/session";
import { countUpcomingToday } from "@/server/booking";
import { getSettings } from "@/server/settings";
import { getTodo } from "@/server/todo";

export const dynamic = "force-dynamic";

export default async function GarageLayout({ children }: { children: ReactNode }) {
  const staff = await getStaff();
  if (!staff) redirect("/login");

  // Menu counters: small COUNT queries in parallel (no rows loaded). The "À traiter" counts
  // (bell) are filtered by role on the server and shared with the /garage/a-traiter page.
  const [{ t }, settings, appointmentsToday, todo] = await Promise.all([
    getI18n(),
    getSettings(),
    can(staff.role, "viewAppointments") ? countUpcomingToday().catch(() => 0) : 0,
    getTodo(staff.id, staff.role),
  ]);

  // Counters on the rail, in the "More" panel and in the account menu: today's remaining bookings,
  // late customer invoices, orders waiting for the admin, unread messages…
  const c = todo.counts;
  const badges: NavBadges = {
    appointments: appointmentsToday || undefined,
    clientInvoices: c.overdueInvoices || undefined,
    purchaseOrders: c.purchaseOrders || undefined,
    claims: c.openClaims || undefined,
    team: c.leaves || undefined,
    delays: c.lateRepairs || undefined,
    backups: c.backup || undefined,
    messages: c.unreadMessages || undefined,
    contracts: c.contractsExpiring || undefined,
  };

  return (
    // V10 shell: pill top bar + icon rail (bottom bar below 1280 px). The whole page scrolls.
    <AppShell
      user={{ id: staff.id, name: staff.name, email: staff.email, role: staff.role }}
      garage={{ name: settings.garageName, logo: settings.logoDataUrl }}
      badges={badges}
      todo={todo.list}
      skipLabel={t.v10.nav.skip}
    >
      {children}
    </AppShell>
  );
}
