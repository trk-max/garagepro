import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarCheck, Gauge, Phone } from "lucide-react";
import { PlateChip } from "@/components/garage/badges";
import { getI18n } from "@/lib/i18n/server";
import { getStaff } from "@/lib/session";
import { getCompanyViewer } from "@/server/company-session";
import { clientIp } from "@/server/portal-session";
import { getSettings } from "@/server/settings";
import { resolveVehicleQr } from "@/server/vehicle-qr";

export const dynamic = "force-dynamic";
// The token is in the address: no indexing, never sent to other sites.
export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

type PageProps = { params: Promise<{ token: string }> };

/** Vehicle QR Code scan. What it opens depends on who scans (decided on the server). */
export default async function VehicleQrPage({ params }: PageProps) {
  const { token } = await params;
  const [staff, company, ip] = await Promise.all([getStaff(), getCompanyViewer(), clientIp()]);
  const scan = await resolveVehicleQr(token, { staff, company, ip });
  if (scan.kind === "staff") redirect(`/garage/customers/${scan.customerId}#vehicule-${scan.vehicleId}`);
  if (scan.kind === "company") redirect(`/entreprise#vehicule-${scan.vehicleId}`);

  const [{ t }, settings] = await Promise.all([getI18n(), getSettings()]);
  const q = t.v7.qr;
  if (scan.kind !== "public") {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="f-display text-2xl">{q.invalidTitle}</h1>
        <p className="mt-3 text-sm text-muted-foreground">{scan.kind === "tooMany" ? t.errors.tooMany : q.invalidText}</p>
        <Link href="/" className="f-label mt-6 inline-block border px-4 py-2 hover:border-foreground">
          {settings.garageName}
        </Link>
      </div>
    );
  }
  const phone = settings.phone?.replace(/\s/g, "");
  return (
    <div className="mx-auto max-w-md space-y-6 px-4 py-20">
      <div className="text-center">
        <p className="label-tech">{settings.garageName}</p>
        <div className="mt-4 flex flex-col items-center gap-2">
          <PlateChip plate={scan.plate} />
          <p className="text-lg font-semibold">
            {scan.make} {scan.model}
          </p>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">{q.publicIntro}</p>
      </div>
      <div className="grid gap-px border bg-border">
        <Link href={`/suivi?plate=${encodeURIComponent(scan.plate)}`} className="flex items-center gap-3 bg-background p-4 hover:bg-card">
          <Gauge className="size-5" strokeWidth={1.5} aria-hidden />
          <span>
            <span className="block font-medium">{t.portal.trackCta}</span>
            <span className="block text-xs text-muted-foreground">{q.trackHint}</span>
          </span>
        </Link>
        <Link href="/rdv" className="flex items-center gap-3 bg-background p-4 hover:bg-card">
          <CalendarCheck className="size-5" strokeWidth={1.5} aria-hidden />
          <span className="font-medium">{t.portal.bookCta}</span>
        </Link>
        {phone && (
          <a href={`tel:${phone}`} className="flex items-center gap-3 bg-background p-4 hover:bg-card">
            <Phone className="size-5" strokeWidth={1.5} aria-hidden />
            <span className="font-medium" dir="ltr">
              {settings.phone}
            </span>
          </a>
        )}
      </div>
      <p className="text-center text-xs text-muted-foreground">
        {q.staffHint}{" "}
        <Link href="/entreprise/connexion" className="underline-offset-4 hover:underline">
          {t.v7.company.portalTitle}
        </Link>
      </p>
    </div>
  );
}
