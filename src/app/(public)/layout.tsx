import type { ReactNode } from "react";
import { PortalShell } from "@/components/portal/portal-shell";
import { aboutContent } from "@/lib/about-content";
import { getI18n } from "@/lib/i18n/server";
import { getSettings } from "@/server/settings";

export const dynamic = "force-dynamic";

/** Customer site shell (header + footer). The look lives in components/portal/portal-shell.tsx. */
export default async function PublicLayout({ children }: { children: ReactNode }) {
  const [{ t, lang }, settings] = await Promise.all([getI18n(), getSettings()]);
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
      }}
      footer={t.footer}
    >
      {children}
    </PortalShell>
  );
}
