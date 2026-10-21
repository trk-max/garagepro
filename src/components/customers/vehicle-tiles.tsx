import Link from "next/link";
import type { ReactNode } from "react";
import { Activity, CarFront, FileSignature, Plus, QrCode, ShieldCheck, Wrench } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { addVehicleAction } from "@/actions/catalog";
import { ActionForm } from "@/components/action-form";
import { PlateChip } from "@/components/garage/badges";
import { VehicleFields } from "@/components/garage/vehicle-fields";
import { Button } from "@/components/ui/button";
import { EmptyState, Surface, SurfaceHeader } from "@/components/ui/redesign/surface";
import { canContract } from "@/lib/contracts";
import type { Dictionary } from "@/lib/i18n/fr";
import { formatKm, type Lang } from "@/lib/format";
import { can, type PermSubject } from "@/lib/permissions";
import type { getCustomer } from "@/server/customers";

type Customer = NonNullable<Awaited<ReturnType<typeof getCustomer>>>;

const action = "gp-lift inline-flex h-9 items-center gap-1.5 rounded-full border border-gp-line bg-gp-card px-3 text-xs font-medium hover:bg-gp-hover";

function Act({ href, icon: Icon, children }: { href: string; icon: LucideIcon; children: ReactNode }) {
  return (
    <Link href={href} className={action}>
      <Icon className="size-3.5" aria-hidden /> {children}
    </Link>
  );
}

/** The customer's vehicles with every former shortcut (new order, contracts, maintenance, QR, warranties, OBD) and the add-vehicle form. */
export function VehicleTiles({ customer, who, t, lang }: { customer: Customer; who: PermSubject; t: Dictionary; lang: Lang }) {
  return (
    <Surface aria-labelledby="cu-vehicles">
      <SurfaceHeader id="cu-vehicles" title={t.customers.vehicles} />
      {customer.vehicles.length === 0 ? (
        <EmptyState icon={CarFront} title={t.customers.noVehicles} />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {customer.vehicles.map((v) => (
            <li key={v.id} id={`vehicule-${v.id}`} className="scroll-mt-28 rounded-[18px] bg-gp-panel p-4 ring-gp-accent target:ring-2">
              <div className="flex flex-wrap items-center gap-2">
                <PlateChip plate={v.plate} />
                <span className="font-semibold">
                  {v.make} {v.model}
                </span>
                {v.year && <span className="text-xs text-gp-muted">{v.year}</span>}
              </div>
              <p className="mt-1 text-xs text-gp-muted">
                {v.fuel ? t.fuel[v.fuel] : ""} · <span dir="ltr">{formatKm(v.mileage, lang)}</span>
                {v.vin && <span className="ms-1 font-mono" dir="ltr">· {v.vin}</span>}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href={`/garage/work-orders/new?customerId=${customer.id}&vehicleId=${v.id}`} className="gp-lift inline-flex h-9 items-center gap-1.5 rounded-full bg-gp-primary px-3 text-xs font-medium text-gp-primary-ink">
                  <Plus className="size-3.5" aria-hidden /> {t.customers.newWorkOrder}
                </Link>
                {canContract(who, "REPAIR", "view") && <Act href={`/garage/contrats?vehicle=${v.id}`} icon={FileSignature}>{t.ctr.nav}</Act>}
                {can(who, "manageMaintenance") && <Act href={`/garage/vehicules/${v.id}/entretien`} icon={Wrench}>{t.v7.maintenance.button}</Act>}
                {can(who, "manageVehicleQr") && <Act href={`/garage/vehicules/${v.id}/qr`} icon={QrCode}>{t.v7.qr.button}</Act>}
                {can(who, "manageWarranties") && <Act href={`/garage/garanties?f=all&vehicle=${v.id}`} icon={ShieldCheck}>{t.v7.warranty.button}</Act>}
                {can(who, "obdDiagnose") && <Act href={`/garage/vehicules/${v.id}/obd`} icon={Activity}>{t.v7.obd.button}</Act>}
              </div>
            </li>
          ))}
        </ul>
      )}

      <details className="mt-4 rounded-[18px] border border-dashed border-gp-muted/40 p-4">
        <summary className="cursor-pointer text-sm font-medium">{t.customers.addVehicle}</summary>
        <ActionForm action={addVehicleAction.bind(null, customer.id)} className="mt-3 space-y-3">
          <VehicleFields t={t} />
          <Button type="submit">{t.common.add}</Button>
        </ActionForm>
      </details>
    </Surface>
  );
}
