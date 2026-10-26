import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { AppTabBar } from "@/components/pwa/app-tab-bar";
import { getI18n } from "@/lib/i18n/server";
import { APP_BG } from "@/lib/pwa-manifests";
import { getSettings } from "@/server/settings";

export const dynamic = "force-dynamic";

export const viewport: Viewport = { themeColor: APP_BG, viewportFit: "cover" };

export async function generateMetadata(): Promise<Metadata> {
  const name = await getSettings().then((s) => s.garageName).catch(() => "GaragePro");
  return { title: name, appleWebApp: { capable: true, title: name, statusBarStyle: "black-translucent" } };
}

/**
 * CLIENT app (start page of the installed app « /app »): phone-first, always dark (the owner's
 * mock-ups), the bottom tab bar Accueil / Suivre / RDV / Showroom. The other screens are the customer
 * site's own pages (/suivi, /rdv, /showroom, /assistant), which show the same tab bar when installed.
 */
export default async function ClientAppLayout({ children }: { children: ReactNode }) {
  const { t } = await getI18n();
  const c = t.app.client;
  return (
    <div className="dark gp-phone min-h-dvh pt-[env(safe-area-inset-top)] app-tabbar-space">
      {children}
      <AppTabBar labels={{ home: c.home, track: c.tabTrack, book: c.tabBook, showroom: c.showroom, nav: c.tabs }} />
    </div>
  );
}
