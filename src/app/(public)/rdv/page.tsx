import { CalendarX } from "lucide-react";
import { BookingWizard } from "@/components/portal/booking-wizard";
import { getI18n } from "@/lib/i18n/server";
import { listBookableServices } from "@/server/booking";
import { getSettings } from "@/server/settings";

type PageProps = { searchParams: Promise<{ service?: string; notes?: string }> };

export default async function BookingPage({ searchParams }: PageProps) {
  const [{ service, notes }, { t }, settings, services] = await Promise.all([searchParams, getI18n(), getSettings(), listBookableServices()]);
  const phone = settings.phone?.replace(/\s/g, "") ?? null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold">{t.booking.title}</h1>
      {!settings.bookingEnabled || services.length === 0 ? (
        <p className="flex items-center gap-3 rounded-2xl bg-white p-6 text-sm ring-1 ring-slate-200">
          <CalendarX className="size-6 text-slate-500" aria-hidden /> {t.booking.closed}
          {phone && (
            <a href={`tel:${phone}`} className="ms-auto font-medium text-orange-700" dir="ltr">
              {settings.phone}
            </a>
          )}
        </p>
      ) : (
        <BookingWizard
          initialServiceId={service}
          initialNotes={typeof notes === "string" ? notes.slice(0, 500) : undefined}
          garagePhone={phone}
          services={services.map((s) => ({
            id: s.id,
            name: s.name,
            nameAr: s.nameAr,
            description: s.description,
            descriptionAr: s.descriptionAr,
            durationMin: s.durationMin,
            priceFrom: s.priceFrom,
          }))}
        />
      )}
    </div>
  );
}
