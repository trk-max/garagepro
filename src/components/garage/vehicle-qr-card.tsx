import Link from "next/link";
import QRCode from "qrcode";
import { QrCode } from "lucide-react";
import { issueVehicleQrAction } from "@/actions/vehicle-qr";
import { ActionButton } from "@/components/action-form";
import { Card, CardTitle } from "@/components/ui/field";
import { getBaseUrl } from "@/lib/base-url";
import type { Dictionary } from "@/lib/i18n/fr";

/** Repair page: the vehicle's QR Code (created at check-in), with a link to print the label. */
export async function VehicleQrCard({ vehicle, t }: { vehicle: { id: string; qrToken: string | null }; t: Dictionary }) {
  const q = t.v7.qr;
  const base: string | null = await getBaseUrl().catch(() => null);
  const svg = vehicle.qrToken && base ? await QRCode.toString(`${base}/v/${vehicle.qrToken}`, { type: "svg", margin: 1, errorCorrectionLevel: "M" }) : null;
  return (
    <Card>
      <CardTitle>{q.title}</CardTitle>
      {svg ? (
        <div className="flex flex-wrap items-center gap-4">
          <div className="w-28 shrink-0 bg-white p-1 [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
          <div className="space-y-2 text-sm">
            <p className="text-xs text-muted-foreground">{q.cardHint}</p>
            <Link href={`/garage/vehicules/${vehicle.id}/qr`} className="inline-flex items-center gap-2 border px-3 py-1.5 text-sm hover:border-foreground">
              <QrCode className="size-4" aria-hidden /> {q.printLabel}
            </Link>
          </div>
        </div>
      ) : vehicle.qrToken ? (
        <p className="text-sm text-muted-foreground">{q.noBaseUrl}</p>
      ) : (
        <ActionButton size="sm" action={issueVehicleQrAction.bind(null, vehicle.id)}>
          {q.create}
        </ActionButton>
      )}
    </Card>
  );
}
