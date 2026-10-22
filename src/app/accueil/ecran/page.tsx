import { DeviceRefused } from "@/components/accueil/device-refused";
import { WaitingScreen } from "@/components/accueil/screen";
import { ar } from "@/lib/i18n/ar";
import { fr } from "@/lib/i18n/fr";
import { publicScreenState } from "@/server/accueil";
import { currentDevice } from "@/server/accueil-device";
import { getSettings } from "@/server/settings";

export const dynamic = "force-dynamic";

/** V15 — waiting-room TV. Needs a device token of kind SCREEN (Paramètres › Accueil). Public data only. */
export default async function WaitingScreenPage() {
  const device = await currentDevice("SCREEN");
  if (!device) return <DeviceRefused fr={fr.v15} ar={ar.v15} />;
  const [settings, initial] = await Promise.all([getSettings(), publicScreenState()]);
  return <WaitingScreen dict={{ fr: fr.v15, ar: ar.v15 }} initial={initial} logo={settings.logoDataUrl} timeZone={settings.timezone} />;
}
