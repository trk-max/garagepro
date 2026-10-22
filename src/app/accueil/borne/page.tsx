import { DeviceRefused } from "@/components/accueil/device-refused";
import { Kiosk } from "@/components/accueil/kiosk";
import { ar } from "@/lib/i18n/ar";
import { fr } from "@/lib/i18n/fr";
import { getQueueSettings, listReasons } from "@/server/accueil";
import { currentDevice } from "@/server/accueil-device";
import { getSettings } from "@/server/settings";

export const dynamic = "force-dynamic";

/** V15 — entrance kiosk (tablet). Needs a device token of kind KIOSK (Paramètres › Accueil). */
export default async function KioskPage() {
  const device = await currentDevice("KIOSK");
  if (!device) return <DeviceRefused fr={fr.v15} ar={ar.v15} />;
  const [settings, qs, reasons] = await Promise.all([getSettings(), getQueueSettings(), listReasons()]);
  return (
    <Kiosk
      dict={{ fr: fr.v15, ar: ar.v15 }}
      garage={settings.garageName}
      logo={settings.logoDataUrl}
      printer={!!qs.printerHost}
      reasons={reasons.map((r) => ({ id: r.id, prefix: r.prefix, nameFr: r.nameFr, nameAr: r.nameAr, kind: r.kind }))}
    />
  );
}
