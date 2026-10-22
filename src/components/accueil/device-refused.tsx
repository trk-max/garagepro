import { ShieldOff } from "lucide-react";
import type { Dictionary } from "@/lib/i18n/fr";

/** V15 — shown on /accueil/borne and /accueil/ecran without a valid device token (none, revoked, other kind). */
export function DeviceRefused({ fr, ar }: { fr: Dictionary["v15"]; ar: Dictionary["v15"] }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-neutral-950 p-6 text-white" data-testid="device-refused">
      <div className="max-w-xl space-y-6 text-center">
        <ShieldOff className="mx-auto size-16 text-amber-400" aria-hidden />
        <div>
          <h1 className="text-3xl font-semibold">{fr.device.invalid}</h1>
          <p className="mt-2 text-white/70">{fr.device.invalidHint}</p>
        </div>
        <div dir="rtl" lang="ar">
          <h2 className="text-3xl font-semibold">{ar.device.invalid}</h2>
          <p className="mt-2 text-white/70">{ar.device.invalidHint}</p>
        </div>
      </div>
    </main>
  );
}
