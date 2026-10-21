import Link from "next/link";
import { notFound } from "next/navigation";
import { ObdPanel } from "@/components/garage/obd-panel";
import { PlateChip } from "@/components/garage/badges";
import { Card, CardTitle, PageHeader } from "@/components/ui/field";
import { formatDateTime, formatKm, woNumber } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import type { Dtc, LiveValue } from "@/lib/obd/elm327";
import { prisma } from "@/lib/prisma";
import { requirePageAccess } from "@/lib/session";
import { cn } from "@/lib/utils";
import { listReadings } from "@/server/obd";

type PageProps = { params: Promise<{ id: string }>; searchParams: Promise<{ wo?: string }> };

/** OBD-II diagnostic of one vehicle: read now, and the history of readings. */
export default async function VehicleObdPage({ params, searchParams }: PageProps) {
  await requirePageAccess("obdDiagnose");
  const [{ id }, { wo }] = await Promise.all([params, searchParams]);
  const [vehicle, readings, { t, lang }] = await Promise.all([
    prisma.vehicle.findUnique({ where: { id }, select: { id: true, plate: true, make: true, model: true, vin: true, mileage: true, customerId: true, customer: { select: { name: true } } } }),
    listReadings(id),
    getI18n(),
  ]);
  if (!vehicle) notFound();
  const workOrder = wo ? await prisma.workOrder.findUnique({ where: { id: wo }, select: { id: true, number: true, vehicleId: true } }) : null;
  const o = t.v7.obd;

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 sm:p-6">
      <PageHeader title={o.title}>
        <Link href={`/garage/customers/${vehicle.customerId}#vehicule-${vehicle.id}`} className="text-sm underline-offset-4 hover:underline">
          {vehicle.customer.name}
        </Link>
      </PageHeader>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <PlateChip plate={vehicle.plate} />
        <span className="font-medium">
          {vehicle.make} {vehicle.model}
        </span>
        <span className="font-mono text-xs" dir="ltr">
          {vehicle.vin ?? "VIN —"}
        </span>
        <span className="text-muted-foreground" dir="ltr">
          {vehicle.mileage === null ? "—" : formatKm(vehicle.mileage, lang)}
        </span>
        {workOrder?.vehicleId === vehicle.id && (
          <Link href={`/garage/work-orders/${workOrder.id}`} className="font-mono underline-offset-4 hover:underline">
            {woNumber(workOrder.number)}
          </Link>
        )}
      </div>
      <p className="text-sm text-muted-foreground">{o.intro}</p>

      <Card>
        <CardTitle>{o.newReading}</CardTitle>
        <ObdPanel vehicleId={vehicle.id} workOrderId={workOrder?.vehicleId === vehicle.id ? workOrder.id : null} recordedKm={vehicle.mileage} />
      </Card>

      <Card>
        <CardTitle>{o.history}</CardTitle>
        {readings.length === 0 ? (
          <p className="text-sm text-muted-foreground">{o.none}</p>
        ) : (
          <ul className="divide-y text-sm">
            {readings.map((r) => {
              const dtcs = r.dtcs as unknown as Dtc[];
              const live = r.live as unknown as LiveValue[];
              return (
                <li key={r.id} className={cn("space-y-1 py-3", r.source === "SIMULATED" && "opacity-70")}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="tabular-nums">{formatDateTime(r.recordedAt, lang)}</span>
                    <span className={cn("f-label border px-1.5 py-0.5 text-[0.625rem]", r.source === "SIMULATED" ? "border-amber-500 text-amber-700 dark:text-amber-400" : "border-emerald-600 text-emerald-700 dark:text-emerald-400")}>
                      {r.source === "SIMULATED" ? o.simulatedBadge : o.realBadge}
                    </span>
                    <span className="text-xs text-muted-foreground">{r.adapter}</span>
                  </div>
                  <p>
                    {o.dtcs} : {dtcs.length ? dtcs.map((d) => `${d.code} (${o.kinds[d.kind]})`).join(", ") : o.noDtc}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {o.odometer} : {r.odometerKm === null ? o.notProvided : `${formatKm(r.odometerKm, lang)} — ${o.odometerStatus[r.odometerStatus as keyof typeof o.odometerStatus] ?? r.odometerStatus}`}
                    {live.length > 0 && ` · ${live.map((v) => `${v.name} ${v.value} ${v.unit}`).join(" · ")}`}
                  </p>
                  {r.note && <p className="text-xs">{r.note}</p>}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <p className="text-xs text-muted-foreground">{o.limits}</p>
    </div>
  );
}
