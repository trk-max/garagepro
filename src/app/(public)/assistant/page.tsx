import type { Metadata } from "next";
import { AssistantChat } from "@/components/portal/assistant-chat";
import { PageBanner } from "@/components/portal/page-banner";
import { getI18n } from "@/lib/i18n/server";
import { siteMedia, slotMedia } from "@/lib/site-media";
import { aiConfigured } from "@/server/assistant";
import { listBookableServices } from "@/server/booking";
import { getSettings } from "@/server/settings";

export const metadata: Metadata = { title: "Assistant auto" };

export default async function AssistantPage() {
  const [{ t }, settings, services] = await Promise.all([getI18n(), getSettings(), listBookableServices()]);
  const phone = settings.phone?.replace(/\s/g, "") || null;
  const whatsapp = phone ? phone.replace(/\D/g, "").replace(/^00/, "") || null : null;
  const { video, photo } = slotMedia(siteMedia(), "assistant", "hero");

  return (
    <>
      <PageBanner
        video={video}
        photo={photo}
        kicker={settings.garageName}
        title={t.assistant.title}
        subtitle={t.assistant.homeCtaHint}
        labels={{ pause: t.portal.pauseVideo, play: t.portal.playVideo }}
      />
      <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
        <AssistantChat
          aiEnabled={aiConfigured()}
          services={settings.bookingEnabled ? services.map((s) => ({ id: s.id, name: s.name, nameAr: s.nameAr })) : []}
          phone={phone}
          whatsapp={whatsapp}
        />
      </div>
    </>
  );
}
