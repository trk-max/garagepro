import { notFound } from "next/navigation";
import { TicketTracker } from "@/components/accueil/ticket-tracker";
import { getI18n } from "@/lib/i18n/server";
import { trackState } from "@/server/accueil";

export const dynamic = "force-dynamic";

/** V15 — light tracking page of one ticket (link sent by SMS): number, status, people before. No personal data. */
export default async function TicketTrackPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [{ t, lang, dir }, state] = await Promise.all([getI18n(), trackState(token)]);
  if (!state) notFound();
  return <TicketTracker v={t.v15} lang={lang} dir={dir} token={token} initial={state} />;
}
