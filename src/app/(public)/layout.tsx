import type { ReactNode } from "react";
import { AskAiWidget } from "@/components/portal/ask-ai-widget";
import { PortalShell } from "@/components/portal/portal-shell";
import { aboutContent } from "@/lib/about-content";
import { getI18n } from "@/lib/i18n/server";
import { aiConfigured } from "@/server/assistant";
import { listBookableServices } from "@/server/booking";
import { getSettings } from "@/server/settings";

export const dynamic = "force-dynamic";

/** Customer site shell (header + footer). The look lives in components/portal/portal-shell.tsx. */
export default async function PublicLayout({ children }: { children: ReactNode }) {
  const [{ t, lang }, settings, services] = await Promise.all([getI18n(), getSettings(), listBookableServices()]);
  const phone = settings.phone?.replace(/\s/g, "") || null;
  const whatsapp = phone ? phone.replace(/\D/g, "").replace(/^00/, "") || null : null;
  return (
    <PortalShell
      garageName={settings.garageName}
      address={settings.address}
      phone={settings.phone}
      labels={{
        tagline: t.portal.tagline,
        about: aboutContent(lang).navLink,
        assistant: t.assistant.navCta,
        track: t.portal.trackCta,
        book: t.portal.bookCta,
        staff: t.portal.staffLink,
        claims: t.claims.navLink,
        showroom: t.showroom.nav.publicLink,
      }}
      footer={t.footer}
      appTabs={{ home: t.app.client.home, track: t.app.client.tabTrack, book: t.app.client.tabBook, showroom: t.app.client.showroom, nav: t.app.client.tabs }}
    >
      {children}
      <AskAiWidget
        aiEnabled={aiConfigured()}
        services={settings.bookingEnabled ? services.map((s) => ({ id: s.id, name: s.name, nameAr: s.nameAr })) : []}
        phone={phone}
        whatsapp={whatsapp}
      />
    </PortalShell>
  );
}
