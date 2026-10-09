import type { Metadata } from "next";
import { AssistantChat } from "@/components/portal/assistant-chat";
import { getI18n } from "@/lib/i18n/server";
import { aiConfigured } from "@/server/assistant";
import { listBookableServices } from "@/server/booking";
import { getSettings } from "@/server/settings";

export const metadata: Metadata = { title: "Assistant auto" };

export default async function AssistantPage() {
  const [{ t }, settings, services] = await Promise.all([getI18n(), getSettings(), listBookableServices()]);
  const phone = settings.phone?.replace(/\s/g, "") || null;
  const whatsapp = phone ? phone.replace(/\D/g, "").replace(/^00/, "") || null : null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:py-8">
      <h1 className="mb-4 text-2xl font-bold">{t.assistant.title}</h1>
      <AssistantChat
        aiEnabled={aiConfigured()}
        services={settings.bookingEnabled ? services.map((s) => ({ id: s.id, name: s.name, nameAr: s.nameAr })) : []}
        phone={phone}
        whatsapp={whatsapp}
      />
    </div>
  );
}
