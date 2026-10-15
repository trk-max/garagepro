import { redirect } from "next/navigation";
import { KeyRound } from "lucide-react";
import { HeroBackdrop } from "@/components/portal/hero-backdrop";
import { PortalLoginForm } from "@/components/portal/login-form";
import { getI18n } from "@/lib/i18n/server";
import { siteMedia, slotMedia } from "@/lib/site-media";
import { getPortalWorkOrderId } from "@/server/portal-session";

type PageProps = { searchParams: Promise<{ plate?: string }> };

export default async function TrackLoginPage({ searchParams }: PageProps) {
  if (await getPortalWorkOrderId()) redirect("/suivi/vehicule");
  const [{ plate }, { t }] = await Promise.all([searchParams, getI18n()]);
  const { video, photo } = slotMedia(siteMedia(), "suivi", "hero");

  // Full-bleed photo, the form as a flat panel over it.
  return (
    <section className="dark relative isolate flex min-h-[calc(100dvh-4.5rem)] items-center overflow-hidden bg-black px-4 py-16 text-white">
      <HeroBackdrop video={video} photo={photo} dim="band" labels={{ pause: t.portal.pauseVideo, play: t.portal.playVideo }} />
      <div className="mx-auto w-full max-w-md border border-[#303030] bg-black/80 p-6 backdrop-blur-sm sm:p-8">
        <KeyRound className="size-6 text-white" strokeWidth={1.25} aria-hidden />
        <h1 className="f-display mt-6 text-2xl">{t.portal.loginTitle}</h1>
        <p className="mt-2 text-[0.8125rem] leading-relaxed text-white/65">{t.portal.loginSubtitle}</p>
        <PortalLoginForm defaultPlate={plate ?? ""} />
      </div>
    </section>
  );
}
