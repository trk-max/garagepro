import { existsSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { AboutView } from "@/components/portal/about-view";
import { aboutContent } from "@/lib/about-content";
import { getI18n } from "@/lib/i18n/server";
import { listBookableServices, priceLabel } from "@/server/booking";
import { getSettings } from "@/server/settings";

export async function generateMetadata(): Promise<Metadata> {
  const { lang } = await getI18n();
  return { title: aboutContent(lang).metaTitle };
}

/** Optional photo: drop a file at public/hero.jpg and it becomes the hero background. */
const HAS_HERO_PHOTO = existsSync(path.join(process.cwd(), "public", "hero.jpg"));

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
      heroPhoto={HAS_HERO_PHOTO}
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
