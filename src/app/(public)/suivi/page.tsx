import { redirect } from "next/navigation";
import { HeroBackdrop } from "@/components/portal/hero-backdrop";
import { PortalLoginForm } from "@/components/portal/login-form";
import { getI18n } from "@/lib/i18n/server";
import { siteMedia, slotMedia } from "@/lib/site-media";
import { getPortalWorkOrderId } from "@/server/portal-session";
import { getSettings } from "@/server/settings";

type PageProps = { searchParams: Promise<{ plate?: string }> };

export default async function TrackLoginPage({ searchParams }: PageProps) {
  if (await getPortalWorkOrderId()) redirect("/suivi/vehicule");
  const [{ plate }, { t }, garageName] = await Promise.all([searchParams, getI18n(), getSettings().then((s) => s.garageName).catch(() => "GaragePro")]);
  const { video, photo } = slotMedia(siteMedia(), "suivi", "hero");

  // Full-bleed photo; the form is the app's phone card (owner's mock-up « Suivre ma réparation »).
  return (
    <section className="dark relative isolate flex min-h-[calc(100dvh-4.5rem)] items-center overflow-hidden bg-black px-4 py-12 text-white">
      <HeroBackdrop video={video} photo={photo} dim="band" labels={{ pause: t.portal.pauseVideo, play: t.portal.playVideo }} />
      <div className="gp-phone gp-scope mx-auto w-full max-w-md rounded-[32px] border border-white/10 !bg-[#0b0b0c]/90 p-6 backdrop-blur-sm sm:p-8">
        <p className="flex items-center gap-2.5">
          <span className="phone-dot" aria-hidden />
          <span className="phone-kicker !text-white">{garageName}</span>
        </p>
        <h1 className="mt-6 text-[1.75rem] leading-tight font-bold tracking-tight">{t.portal.loginTitle}</h1>
        <p className="mt-2 text-[0.9375rem] leading-relaxed text-[var(--phone-muted)]">{t.portal.trackCtaHint}</p>
        <PortalLoginForm defaultPlate={plate ?? ""} />
      </div>
    </section>
  );
}
