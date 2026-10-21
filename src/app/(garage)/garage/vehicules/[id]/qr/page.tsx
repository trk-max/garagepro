import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { issueVehicleQrAction, revokeVehicleQrAction } from "@/actions/vehicle-qr";
import { ActionButton } from "@/components/action-form";
import { PlateChip } from "@/components/garage/badges";
import { PrintButton } from "@/components/garage/print-button";
import { Card, PageHeader } from "@/components/ui/field";
import { getBaseUrl } from "@/lib/base-url";
import { formatDateTime } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { prisma } from "@/lib/prisma";
import { requirePageAccess } from "@/lib/session";
import { getSettings } from "@/server/settings";

type PageProps = { params: Promise<{ id: string }> };

/** Staff: the vehicle's QR Code (create, print the label, renew, revoke). */
export default async function VehicleQrAdminPage({ params }: PageProps) {
  await requirePageAccess("manageVehicleQr");
  const { id } = await params;
  const [vehicle, { t, lang }, settings] = await Promise.all([
    prisma.vehicle.findUnique({ where: { id }, select: { id: true, plate: true, make: true, model: true, qrToken: true, qrIssuedAt: true, customerId: true, customer: { select: { name: true } } } }),
    getI18n(),
    getSettings(),
  ]);
  if (!vehicle) notFound();
  const q = t.v7.qr;
  const base: string | null = await getBaseUrl().catch(() => null);
  const link = vehicle.qrToken && base ? `${base}/v/${vehicle.qrToken}` : null;
  const svg = link ? await QRCode.toString(link, { type: "svg", margin: 1, errorCorrectionLevel: "M" }) : null;

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
      <PageHeader title={q.title}>
        <Link href={`/garage/customers/${vehicle.customerId}#vehicule-${vehicle.id}`} className="text-sm underline-offset-4 hover:underline">
          {vehicle.customer.name}
        </Link>
      </PageHeader>
      <p className="text-sm text-muted-foreground print:hidden">{q.intro}</p>
      {!base && <p className="border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">{t.errors.appUrlMissing}</p>}

      <Card className="print:border-0 print:shadow-none">
        {svg && link ? (
          /* Printed label: QR + plate + garage. */
          <div className="mx-auto flex max-w-xs flex-col items-center gap-3 border p-5 text-center print:border-black">
            <p className="label-tech">{settings.garageName}</p>
            <div className="w-56 bg-white p-2 [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
            <PlateChip plate={vehicle.plate} />
            <p className="text-sm">
              {vehicle.make} {vehicle.model}
            </p>
            <p className="text-[0.625rem] text-muted-foreground">{q.labelHint}</p>
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">{vehicle.qrToken ? q.noBaseUrl : q.none}</p>
        )}
        {vehicle.qrIssuedAt && (
          <p className="mt-3 text-center text-xs text-muted-foreground print:hidden">
            {q.issuedAt} : {formatDateTime(vehicle.qrIssuedAt, lang)}
          </p>
        )}
      </Card>

      <div className="flex flex-wrap gap-2 print:hidden">
        {vehicle.qrToken ? (
          <>
            {svg && <PrintButton />}
            <ActionButton variant="outline" action={issueVehicleQrAction.bind(null, vehicle.id)} confirm={q.renewConfirm}>
              {q.renew}
            </ActionButton>
            <ActionButton variant="outline" action={revokeVehicleQrAction.bind(null, vehicle.id)} confirm={q.revokeConfirm}>
              {q.revoke}
            </ActionButton>
          </>
        ) : (
          <ActionButton action={issueVehicleQrAction.bind(null, vehicle.id)}>{q.create}</ActionButton>
        )}
      </div>
      <p className="text-xs text-muted-foreground print:hidden">{q.security}</p>
    </div>
  );
}
