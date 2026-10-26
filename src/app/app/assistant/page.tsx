import { AssistantChat } from "@/components/portal/assistant-chat";
import { getI18n } from "@/lib/i18n/server";
import { aiConfigured } from "@/server/assistant";
import { listBookableServices } from "@/server/booking";
import { getSettings } from "@/server/settings";

export const dynamic = "force-dynamic";

/** App assistant: the website's chat, full page (its booking links open /app/rdv). */
export default async function AppAssistantPage() {
  const [{ t }, settings, services] = await Promise.all([getI18n(), getSettings(), listBookableServices()]);
  const phone = settings.phone?.replace(/\s/g, "") || null;
  const whatsapp = phone ? phone.replace(/\D/g, "").replace(/^00/, "") || null : null;
  return (
    <main className="mx-auto w-full max-w-3xl px-4 pt-2 pb-8">
      <h1 className="mb-4 text-[1.75rem] leading-tight font-bold tracking-tight">{t.assistant.title}</h1>
      <AssistantChat
        aiEnabled={aiConfigured()}
        services={settings.bookingEnabled ? services.map((s) => ({ id: s.id, name: s.name, nameAr: s.nameAr })) : []}
        phone={phone}
        whatsapp={whatsapp}
      />
    </main>
  );
}
