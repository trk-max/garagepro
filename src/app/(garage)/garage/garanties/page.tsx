import Link from "next/link";
import { PlateChip } from "@/components/garage/badges";
import { ValidityText, WarrantyBadge } from "@/components/garage/warranty";
import { Card, PageHeader, Table, Td, Th } from "@/components/ui/field";
import { fmt, formatDay, woNumber } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { prisma } from "@/lib/prisma";
import { requirePageAccess } from "@/lib/session";
import { cn } from "@/lib/utils";
import { listWarranties, type WarrantyFilter } from "@/server/warranties";

type PageProps = { searchParams: Promise<{ f?: string; vehicle?: string }> };

const FILTERS: WarrantyFilter[] = ["all", "active", "expired", "claims"];

/** Warranties on repairs and parts, with their validity and open claims (no amounts here). */
export default async function WarrantiesPage({ searchParams }: PageProps) {
  const staff = await requirePageAccess("manageWarranties");
  const sp = await searchParams;
  const filter = (FILTERS as string[]).includes(sp.f ?? "") ? (sp.f as WarrantyFilter) : "active";
  const vehicleId = sp.vehicle && /^[a-z0-9]{20,40}$/.test(sp.vehicle) ? sp.vehicle : undefined;
  const [{ t, lang }, rows, vehicle] = await Promise.all([
    getI18n(),
    listWarranties(staff, { filter, vehicleId }),
    vehicleId ? prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { plate: true } }) : null,
  ]);
  const w = t.v7.warranty;
  const qs = (f: WarrantyFilter) => `/garage/garanties?f=${f}${vehicleId ? `&vehicle=${vehicleId}` : ""}`;

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6">
      <PageHeader title={vehicle ? fmt(w.forVehicle, { plate: vehicle.plate }) : w.title}>
        {vehicleId && (
          <Link href="/garage/garanties" className="text-sm underline-offset-4 hover:underline">
            {w.showAll}
          </Link>
        )}
      </PageHeader>
      <p className="text-sm text-muted-foreground">{w.intro}</p>
      <nav className="flex flex-wrap gap-1" aria-label={w.title}>
        {FILTERS.map((f) => (
          <Link
            key={f}
            href={qs(f)}
            aria-current={f === filter ? "page" : undefined}
            className={cn("f-label border px-3 py-2", f === filter ? "border-foreground text-foreground" : "border-border text-muted-foreground hover:text-foreground")}
          >
            {w.filters[f]}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <p className="border border-dashed p-10 text-center text-sm text-muted-foreground">{w.none}</p>
      ) : (
        <Card className="p-0 sm:p-0">
          <Table>
            <thead>
              <tr>
                <Th>{w.covered}</Th>
                <Th>{w.vehicle}</Th>
                <Th>{w.customer}</Th>
                <Th>{w.start}</Th>
                <Th>{w.end}</Th>
                <Th>{w.claims}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((x) => (
                <tr key={x.id} className="hover:bg-accent/30">
                  <Td>
                    <div className="flex flex-wrap items-center gap-2">
                      <WarrantyBadge v={x.validity} t={t} />
                      <span className="f-label text-[0.625rem] text-muted-foreground">{w.kind[x.kind as "REPAIR" | "PART"]}</span>
                    </div>
                    <Link href={`/garage/garanties/${x.id}`} className="mt-1 block font-medium underline-offset-4 hover:underline">
                      {x.label}
                    </Link>
                    {x.supplier && <span className="text-xs text-muted-foreground">{x.supplier.name}</span>}
                    {x.workOrder && (
                      <Link href={`/garage/work-orders/${x.workOrder.id}`} className="ms-2 font-mono text-xs text-muted-foreground hover:underline">
                        {woNumber(x.workOrder.number)}
                      </Link>
                    )}
                  </Td>
                  <Td>
                    <PlateChip plate={x.vehicle.plate} />
                    <span className="ms-2 text-xs text-muted-foreground">
                      {x.vehicle.make} {x.vehicle.model}
                    </span>
                  </Td>
                  <Td>
                    <Link href={`/garage/customers/${x.customer.id}`} className="underline-offset-4 hover:underline">
                      {x.customer.name}
                    </Link>
                  </Td>
                  <Td className="text-xs">{formatDay(x.startDay, lang, { day: "numeric", month: "short", year: "numeric" })}</Td>
                  <Td>
                    <ValidityText endDay={x.endDay} endKm={x.endKm} v={x.validity} t={t} lang={lang} />
                  </Td>
                  <Td className="text-xs">{x.openClaims > 0 ? <span className="font-semibold text-brand-500">{fmt(w.openClaims, { n: x.openClaims })}</span> : x.claims.length || "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}
