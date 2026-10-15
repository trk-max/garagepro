import type { Metadata } from "next";
import { AboutView } from "@/components/portal/about-view";
import { aboutContent } from "@/lib/about-content";
import { getI18n } from "@/lib/i18n/server";
import { siteMedia } from "@/lib/site-media";
import { listBookableServices, priceLabel } from "@/server/booking";
import { getSettings } from "@/server/settings";

export async function generateMetadata(): Promise<Metadata> {
  const { lang } = await getI18n();
  return { title: aboutContent(lang).metaTitle };
}

export default async function AboutPage() {
  const [{ t, lang }, settings, services] = await Promise.all([getI18n(), getSettings(), listBookableServices()]);
  const phone = settings.phone?.replace(/\s/g, "") || null;
  const whatsapp = phone ? phone.replace(/\D/g, "").replace(/^00/, "") || null : null;

  return (
    <AboutView
      c={aboutContent(lang)}
      garageName={settings.garageName}
      phone={phone}
      phoneLabel={settings.phone}
      whatsapp={whatsapp}
      media={siteMedia()}
      videoLabels={{ pause: t.portal.pauseVideo, play: t.portal.playVideo }}
      services={services.map((s) => ({
        id: s.id,
        name: lang === "ar" && s.nameAr ? s.nameAr : s.name,
        description: lang === "ar" && s.descriptionAr ? s.descriptionAr : s.description,
        durationMin: s.durationMin,
        price: priceLabel(s.priceFrom, t, lang),
      }))}
    />
  );
}
