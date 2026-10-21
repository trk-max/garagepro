import { CarFront, ChevronRight } from "lucide-react";
import { SearchForm } from "@/components/garage/search-form";
import { LiveRefresh } from "@/components/live-refresh";
import { PageHeader } from "@/components/ui/redesign/page-header";
import { EmptyState, PillLink } from "@/components/ui/redesign/surface";
import { VehicleCard } from "@/components/vehicles/vehicle-card";
import { getI18n } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { requirePageAccess } from "@/lib/session";
import { vehicleCards } from "@/server/vehicle-list";

type PageProps = { searchParams: Promise<{ q?: string; cursor?: string }> };

/** V10.2 — every customer vehicle on its own page: search, owner, open repair and the vehicle's tools. */
export default async function VehiclesPage({ searchParams }: PageProps) {
  const staff = await requirePageAccess("viewCustomers");
  const sp = await searchParams;
  const q = sp.q?.trim() || undefined;
  const [{ t, lang }, page] = await Promise.all([getI18n(), vehicleCards({ q, take: 20, cursor: sp.cursor ?? null })]);
  const p = t.v10.pages.vehicles;
  const c = t.v10.pages.customers;
  const rights = {
    newOrder: can(staff, "viewWorkOrders"),
    qr: can(staff, "manageVehicleQr"),
    obd: can(staff, "obdDiagnose"),
    maintenance: can(staff, "manageMaintenance"),
  };
  const href = (cursor?: string) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (cursor) params.set("cursor", cursor);
    const s = params.toString();
    return s ? `/garage/vehicules?${s}` : "/garage/vehicules";
  };
  const title = t.v10.nav.vehicles;

  return (
    <div className="mx-auto max-w-[1440px] px-3 pt-4 pb-6 sm:px-5 xl:ps-2 xl:pe-5">
      <PageHeader title={title} subtitle={p.subtitle}>
        <LiveRefresh url="/api/staff/live?topic=customers" liveLabel={t.portal.live} reconnectingLabel={t.portal.reconnecting} />
      </PageHeader>

      <div className="gp-stagger space-y-5">
        <div className="flex">
          <div className="ms-auto w-full sm:w-96 [&_form]:max-w-none [&_input]:h-11 [&_input]:rounded-full [&_input]:bg-gp-card [&_input]:ps-9">
            <SearchForm placeholder={p.search} defaultValue={q} />
          </div>
        </div>

        {page.items.length === 0 ? (
          <EmptyState icon={CarFront} title={p.empty} />
        ) : (
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {page.items.map((v) => (
              <VehicleCard key={v.id} v={v} t={t} lang={lang} rights={rights} />
            ))}
          </ul>
        )}

        {(sp.cursor || page.nextCursor) && (
          <nav className="flex justify-center gap-2" aria-label={title}>
            {sp.cursor && (
              <PillLink href={href()} variant="outline">
                {c.first}
              </PillLink>
            )}
            {page.nextCursor && (
              <PillLink href={href(page.nextCursor)} variant="primary" icon={ChevronRight}>
                {c.next}
              </PillLink>
            )}
          </nav>
        )}
      </div>
    </div>
  );
}
