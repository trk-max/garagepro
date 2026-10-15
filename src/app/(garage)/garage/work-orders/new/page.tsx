import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckInForm } from "@/components/garage/check-in-form";
import { PlateChip, StatusBadge } from "@/components/garage/badges";
import { PlateSearch } from "@/components/garage/plate-search";
import { Card, CardTitle, PageHeader } from "@/components/ui/field";
import { displayPlate, fmt, formatDate, formatKm, formatMoney, woNumber } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { requirePageAccess } from "@/lib/session";
import { customerOption } from "@/server/customers";
import { listMechanics, lookupVehicleByPlate } from "@/server/work-orders";
import { isFinal } from "@/server/workflow";

type PageProps = { searchParams: Promise<{ customerId?: string; vehicleId?: string; plate?: string }> };

/**
 * Vehicle check-in starts with the plate:
 * - the car is in the workshop → its open order opens directly;
 * - the car is known → its history, then the form with owner + car selected;
 * - first visit → the form for a new customer and a new car (everything mandatory).
 * Opened from a customer page (customerId[/vehicleId]) it skips the plate step.
 */
export default async function NewWorkOrderPage({ searchParams }: PageProps) {
  await requirePageAccess("viewWorkOrders");
  const preset = await searchParams;
  const { t, lang } = await getI18n();
  const p = t.plateLookup;

  const lookup = preset.plate && !preset.customerId ? await lookupVehicleByPlate(preset.plate) : null;
  const vehicle = lookup?.vehicle ?? null;
  const open = vehicle?.workOrders.find((w) => !isFinal(w.status));
  if (open) redirect(`/garage/work-orders/${open.id}`);

  const customerId = preset.customerId ?? vehicle?.customer.id;
  const vehicleId = preset.vehicleId ?? vehicle?.id;
  const [initialCustomer, staff] = await Promise.all([customerId ? customerOption(customerId) : null, listMechanics()]);
  const mechanics = staff.filter((s) => s.role === "MECHANIC" || s.role === "ADMIN");
  const showForm = Boolean(preset.customerId || lookup);

  return (
    <div className="mx-auto max-w-6xl p-6">
      <PageHeader title={t.workOrders.createTitle} />

      {!preset.customerId && (
        <section className="mb-6 border bg-card p-5 sm:p-6">
          <h2 className="f-label text-muted-foreground">{p.title}</h2>
          <PlateSearch size="lg" className="mt-3 max-w-xl" placeholder={t.customers.platePlaceholder} label={p.submit} defaultValue={lookup ? displayPlate(lookup.plate) : undefined} />
          <p className="mt-3 max-w-2xl text-sm text-muted-foreground">{p.hint}</p>
        </section>
      )}

      {lookup && !vehicle && (
        <p className="mb-6 border-s-2 border-brand-500 ps-3 text-sm">{fmt(p.unknown, { plate: displayPlate(lookup.plate) })}</p>
      )}

      {vehicle && (
        <Card className="mb-6">
          <div className="flex flex-wrap items-center gap-3">
            <PlateChip plate={vehicle.plate} />
            <span className="font-semibold">
              {vehicle.make} {vehicle.model} {vehicle.year ?? ""}
            </span>
            <span className="text-sm text-muted-foreground">
              {p.owner} :{" "}
              <Link href={`/garage/customers/${vehicle.customer.id}`} className="text-foreground underline-offset-4 hover:underline">
                {vehicle.customer.name}
              </Link>{" "}
              · <span dir="ltr">{vehicle.customer.phone}</span>
            </span>
            <span className="ms-auto text-sm text-muted-foreground">
              {fmt(p.visits, { n: vehicle.workOrders.length })} · {p.lastKm} : {formatKm(vehicle.mileage, lang)} · {p.totalSpent} :{" "}
              {formatMoney(vehicle.workOrders.reduce((s, w) => s + (w.invoice?.totalTtc ?? 0), 0), lang)}
            </span>
          </div>
          <CardTitle className="mt-5">{p.history}</CardTitle>
          {vehicle.workOrders.length === 0 ? (
            <p className="text-sm text-muted-foreground">{p.noHistory}</p>
          ) : (
            <ol className="divide-y text-sm">
              {vehicle.workOrders.map((w) => (
                <li key={w.id} className="grid gap-1 py-3 sm:grid-cols-[7rem_6rem_1fr_auto] sm:items-start sm:gap-4">
                  <time className="text-muted-foreground">{formatDate(w.createdAt, lang)}</time>
                  <Link href={`/garage/work-orders/${w.id}`} className="font-mono text-xs underline-offset-4 hover:underline">
                    {woNumber(w.number)}
                  </Link>
                  <div className="min-w-0">
                    <p>{w.complaint}</p>
                    {w.diagnosis && (
                      <p className="mt-0.5 text-muted-foreground">
                        {p.diagnosis} : {w.diagnosis}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 sm:justify-end">
                    <span className="tabular-nums text-muted-foreground">{formatKm(w.mileageIn, lang)}</span>
                    {w.invoice && <span className="tabular-nums">{formatMoney(w.invoice.totalTtc, lang)}</span>}
                    <StatusBadge status={w.status} t={t} />
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Card>
      )}

      {showForm && (
        <CheckInForm
          key={`${customerId ?? "new"}-${vehicleId ?? "new"}-${lookup?.plate ?? ""}`}
          initialCustomer={initialCustomer}
          mechanics={mechanics}
          preset={{ vehicleId, plate: lookup && !vehicle ? displayPlate(lookup.plate) : undefined }}
        />
      )}
    </div>
  );
}
