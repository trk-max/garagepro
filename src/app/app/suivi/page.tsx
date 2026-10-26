import { redirect } from "next/navigation";
import { PortalLoginForm } from "@/components/portal/login-form";
import { getI18n } from "@/lib/i18n/server";
import { getPortalWorkOrderId } from "@/server/portal-session";

export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ plate?: string }> };

/** App « Suivre ma réparation »: plate + 4-digit code (same form and action as /suivi, rate limits included). */
export default async function AppTrackLoginPage({ searchParams }: PageProps) {
  if (await getPortalWorkOrderId()) redirect("/app/suivi/vehicule");
  const [{ plate }, { t }] = await Promise.all([searchParams, getI18n()]);
  return (
    <main className="gp-scope mx-auto w-full max-w-md px-4 pt-4 pb-8" data-testid="app-track-login">
      <h1 className="text-[1.75rem] leading-tight font-bold tracking-tight">{t.portal.loginTitle}</h1>
      <p className="mt-2 text-[0.9375rem] leading-relaxed text-[var(--phone-muted)]">{t.portal.trackCtaHint}</p>
      <PortalLoginForm defaultPlate={plate ?? ""} />
    </main>
  );
}
