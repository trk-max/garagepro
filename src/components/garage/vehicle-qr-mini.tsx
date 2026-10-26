import Link from "next/link";
import { Printer, QrCode } from "lucide-react";
import { issueVehicleQrAction } from "@/actions/vehicle-qr";
import { ActionButton } from "@/components/action-form";
import type { Dictionary } from "@/lib/i18n/fr";
import { vehicleQrImage } from "@/server/vehicle-qr-image";

/**
 * staff-ux — the vehicle's QR inside a « Véhicule » card (order page, vehicle tiles of the customer file): small
 * code + « Carnet du véhicule », and for those who manage QR codes the label page (print, renew, revoke) or the
 * button that creates it.
 */
export async function VehicleQrMini({ vehicle, canManage, t }: { vehicle: { id: string; qrToken: string | null }; canManage: boolean; t: Dictionary }) {
  const img = await vehicleQrImage(vehicle.qrToken);
  const q = t.v7.qr;
  if (!img) {
    if (!canManage) return null;
    return vehicle.qrToken ? (
      <p className="mt-3 text-xs text-muted-foreground">{q.noBaseUrl}</p>
    ) : (
      <ActionButton size="sm" variant="outline" className="mt-3" action={issueVehicleQrAction.bind(null, vehicle.id)}>
        <QrCode className="size-4" aria-hidden /> {q.create}
      </ActionButton>
    );
  }
  return (
    <div className="mt-3 flex items-center gap-3 border-t border-gp-line pt-3" data-testid="vehicle-qr">
      <a href={img.link} target="_blank" rel="noopener" className="w-20 shrink-0 rounded-md bg-white p-1 [&_svg]:h-auto [&_svg]:w-full" aria-label={t.staffUx.qr.scan} dangerouslySetInnerHTML={{ __html: img.svg }} />
      <div className="min-w-0 space-y-1.5 text-sm">
        <p className="font-medium">{t.staffUx.qr.carnet}</p>
        <p className="text-xs text-muted-foreground">{t.staffUx.qr.scan}</p>
        {canManage && (
          <Link href={`/garage/vehicules/${vehicle.id}/qr`} className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-gp-line px-3 text-xs font-medium hover:bg-gp-hover">
            <Printer className="size-3.5" aria-hidden /> {q.printLabel}
          </Link>
        )}
      </div>
    </div>
  );
}

/** Printed quote / invoice: the small QR in the vehicle block (same token, made when the page is shown). */
export async function vehicleQrForDocument(token: string | null | undefined, t: Dictionary) {
  const img = await vehicleQrImage(token);
  return img ? { svg: img.svg, label: t.staffUx.qr.carnet } : null;
}
