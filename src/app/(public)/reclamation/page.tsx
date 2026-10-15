import type { Metadata } from "next";
import { MessageSquareWarning, Star } from "lucide-react";
import { ClaimForm } from "@/components/portal/claim-form";
import { FeedbackForm } from "@/components/portal/feedback-form";
import { PageBanner } from "@/components/portal/page-banner";
import { getI18n } from "@/lib/i18n/server";
import { siteMedia, slotMedia } from "@/lib/site-media";
import { getSettings } from "@/server/settings";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.claims.navLink };
}

/** Customer space: rate a visit, or file a complaint that the team answers. */
export default async function ClaimsPage() {
  const [{ t }, settings] = await Promise.all([getI18n(), getSettings()]);
  const { video, photo } = slotMedia(siteMedia(), "about", "hero");

  return (
    <>
      <PageBanner
        video={video}
        photo={photo}
        kicker={settings.garageName}
        title={t.claims.pageTitle}
        subtitle={t.claims.pageSubtitle}
        labels={{ pause: t.portal.pauseVideo, play: t.portal.playVideo }}
      />
      <div className="mx-auto grid max-w-6xl gap-px border-x border-b border-border bg-border lg:grid-cols-2">
        <section className="bg-background p-6 sm:p-10" aria-labelledby="feedback-title">
          <Star className="size-6 text-foreground" strokeWidth={1.25} aria-hidden />
          <h2 id="feedback-title" className="f-display mt-5 text-xl">
            {t.feedback.title}
          </h2>
          <div className="mt-6">
            <FeedbackForm />
          </div>
        </section>
        <section className="bg-background p-6 sm:p-10" aria-labelledby="claim-title">
          <MessageSquareWarning className="size-6 text-foreground" strokeWidth={1.25} aria-hidden />
          <h2 id="claim-title" className="f-display mt-5 text-xl">
            {t.claims.formTitle}
          </h2>
          <div className="mt-6">
            <ClaimForm />
          </div>
        </section>
      </div>
      <div className="h-16" />
    </>
  );
}
