import { HomeView } from "@/components/portal/home-view";
import { aboutContent } from "@/lib/about-content";
import { fmt } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { siteMedia } from "@/lib/site-media";
import { getSettings } from "@/server/settings";
import { listBookableServices, priceLabel } from "@/server/booking";

export default async function PortalHome() {
  const [{ t, lang }, settings, services] = await Promise.all([getI18n(), getSettings(), listBookableServices()]);
  const phone = settings.phone?.replace(/\s/g, "") || null;
  const whatsapp = phone ? phone.replace(/\D/g, "").replace(/^00/, "") || null : null;
  const about = aboutContent(lang);

  return (
    <HomeView
      media={siteMedia()}
      phone={phone}
      whatsapp={whatsapp}
      services={services.map((s) => ({
        id: s.id,
        name: lang === "ar" && s.nameAr ? s.nameAr : s.name,
        durationMin: s.durationMin,
        price: priceLabel(s.priceFrom, t, lang),
      }))}
      labels={{
        title: fmt(t.portal.homeTitle, { garage: settings.garageName }),
        subtitle: t.portal.homeSubtitle,
        track: t.portal.trackCta,
        trackHint: t.portal.trackCtaHint,
        book: t.portal.bookCta,
        bookHint: t.portal.bookCtaHint,
        assistant: t.assistant.homeCta,
        assistantHint: t.assistant.homeCtaHint,
        company: t.v7.company.portalTitle,
        companyHint: t.v7.company.homeHint,
        protocolTitle: about.homeBandTitle,
        protocolText: about.homeBandText,
        protocolCta: about.enter,
        servicesTitle: about.servicesLabel,
        call: t.portal.call,
        whatsapp: t.portal.whatsapp,
        galleryTitle: t.portal.galleryTitle,
        pauseVideo: t.portal.pauseVideo,
        playVideo: t.portal.playVideo,
      }}
    />
  );
}
