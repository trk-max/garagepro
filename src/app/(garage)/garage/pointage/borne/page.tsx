import { ClockKiosk } from "@/components/team/kiosk";
import { PageHeader } from "@/components/ui/field";
import { getI18n } from "@/lib/i18n/server";
import { requirePageAccess } from "@/lib/session";

/** Garage screen showing the rotating clock-in code (leave it open on the garage PC / a tablet). */
export default async function KioskPage() {
  await requirePageAccess("showClockKiosk");
  const { t } = await getI18n();
  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <PageHeader title={t.v7.clock.kioskTitle} />
      <ClockKiosk />
    </div>
  );
}
