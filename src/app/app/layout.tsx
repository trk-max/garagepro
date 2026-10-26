import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { AskAiWidget } from "@/components/portal/ask-ai-widget";
import { AppHeader } from "@/components/pwa/app-header";
import { AppTabBar } from "@/components/pwa/app-tab-bar";
import { getI18n } from "@/lib/i18n/server";
import { APP_BG } from "@/lib/pwa-manifests";
import { aiConfigured } from "@/server/assistant";
import { listBookableServices } from "@/server/booking";
import { getSettings } from "@/server/settings";

export const dynamic = "force-dynamic";

export const viewport: Viewport = { themeColor: APP_BG, viewportFit: "cover" };

export async function generateMetadata(): Promise<Metadata> {
  const name = await getSettings().then((s) => s.garageName).catch(() => "GaragePro");
  return { title: name, appleWebApp: { capable: true, title: name, statusBarStyle: "black-translucent" } };
}

/**
 * CLIENT app (start page of the installed app « /app »): phone-first, always dark (the owner's mock-ups), the
 * same header on every page (back arrow, garage dot + name, language) and the bottom tab bar Accueil / Suivre /
 * RDV / Showroom — in the browser too. The pages /app/suivi, /app/rdv, /app/showroom, /app/assistant reuse the
 * website's components and actions (same rules, same data); only their links stay inside /app.
 */
export default async function ClientAppLayout({ children }: { children: ReactNode }) {
  const [{ t }, settings, services] = await Promise.all([getI18n(), getSettings(), listBookableServices().catch(() => [])]);
  const c = t.app.client;
  const phone = settings.phone?.replace(/\s/g, "") || null;
  const whatsapp = phone ? phone.replace(/\D/g, "").replace(/^00/, "") || null : null;
  return (
    <div className="dark gp-phone min-h-dvh pt-[env(safe-area-inset-top)] app-tabbar-space">
      <AppHeader garageName={settings.garageName} />
      {children}
      <AskAiWidget
        aiEnabled={aiConfigured()}
        services={settings.bookingEnabled ? services.map((s) => ({ id: s.id, name: s.name, nameAr: s.nameAr })) : []}
        phone={phone}
        whatsapp={whatsapp}
      />
      <AppTabBar labels={{ home: c.home, track: c.tabTrack, book: c.tabBook, showroom: c.showroom, nav: c.tabs }} />
    </div>
  );
}
