import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Bot, CalendarCheck, Clock, Gauge, MessageCircle, Phone } from "lucide-react";
import { GpMonogram } from "@/components/brand/garagepro-logo";
import { HeroBackdrop } from "@/components/portal/hero-backdrop";
import type { SiteMedia } from "@/lib/site-media";

export type HomeService = { id: string; name: string; durationMin: number; price: string };

type Labels = {
  title: string;
  subtitle: string;
  track: string;
  trackHint: string;
  book: string;
  bookHint: string;
  assistant: string;
  assistantHint: string;
  protocolTitle: string;
  protocolText: string;
  protocolCta: string;
  servicesTitle: string;
  call: string;
  whatsapp: string;
  galleryTitle: string;
  pauseVideo: string;
  playVideo: string;
};

/** Square, flat, hairline-bordered tile; the arrow is the affordance, red only on hover. */
const TILE =
  "group flex flex-col justify-between gap-10 border border-border bg-card p-6 transition-colors hover:border-foreground sm:p-8";

/**
 * Customer home, "black marble" style: a full-bleed cinematic hero (video or
 * photo from public/site/), centered uppercase type, flat square tiles on
 * hairlines, a video band, a photo mosaic. Pure view, no data loading.
 */
export function HomeView({
  labels,
  services,
  phone,
  whatsapp,
  media,
}: {
  labels: Labels;
  services: HomeService[];
  phone: string | null;
  whatsapp: string | null;
  media: SiteMedia;
}) {
  const gallery = media.gallery.slice(0, 6);
  const mosaic = gallery.length === 6;

  return (
    <>
      {/* ── Hero: the garage's film (or photo) edge to edge, type centered ── */}
      <section className="dark relative isolate flex min-h-[78dvh] flex-col justify-end overflow-hidden bg-black text-white sm:min-h-[calc(100dvh-4.5rem)]">
        <HeroBackdrop video={media.heroVideo} photo={media.heroPhoto} labels={{ pause: labels.pauseVideo, play: labels.playVideo }} />
        <div className="mx-auto w-full max-w-6xl px-4 pt-28 pb-16 text-center sm:pb-24">
          <GpMonogram className="mx-auto h-12 w-auto text-white sm:h-16" aria-hidden />
          <h1 className="f-display mx-auto mt-8 max-w-4xl text-3xl text-white sm:text-5xl">{labels.title}</h1>
          <p className="mx-auto mt-5 max-w-xl text-[0.8125rem] leading-relaxed tracking-[0.03em] text-white/60">{labels.subtitle}</p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
            <Link href="/rdv" className="f-label inline-flex min-h-12 items-center gap-3 bg-white px-7 text-black transition-colors hover:bg-brand-500 hover:text-white">
              {labels.book} <ArrowRight className="size-4 rtl:rotate-180" aria-hidden />
            </Link>
            <Link href="/suivi" className="f-label inline-flex min-h-12 items-center gap-3 border-b border-transparent text-white transition-colors hover:border-brand-500 hover:text-brand-500">
              {labels.track} <ArrowRight className="size-4 rtl:rotate-180" aria-hidden />
            </Link>
          </div>
        </div>
        <span aria-hidden className="absolute start-1/2 bottom-0 h-12 w-px -translate-x-1/2 bg-gradient-to-b from-transparent to-white/50 rtl:translate-x-1/2" />
      </section>

      {/* ── Three entry points ── */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
        <div className="grid gap-px border border-border bg-border sm:grid-cols-3">
          {[
            { href: "/suivi", icon: Gauge, title: labels.track, hint: labels.trackHint },
            { href: "/rdv", icon: CalendarCheck, title: labels.book, hint: labels.bookHint },
            { href: "/assistant", icon: Bot, title: labels.assistant, hint: labels.assistantHint },
          ].map(({ href, icon: Icon, title, hint }) => (
            <Link key={href} href={href} className="group flex min-h-44 flex-col justify-between gap-6 bg-background p-6 sm:min-h-64 sm:gap-10 transition-colors hover:bg-card sm:p-8">
              <Icon className="size-6 text-foreground" strokeWidth={1.25} aria-hidden />
              <span>
                <span className="f-display block text-lg">{title}</span>
                <span className="mt-2 block text-[0.8125rem] leading-relaxed text-muted-foreground">{hint}</span>
                <ArrowRight className="mt-6 size-4 transition-colors group-hover:text-brand-500 rtl:rotate-180" aria-hidden />
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Protocol band: a second film, centered statement ── */}
      <section className="dark relative isolate overflow-hidden bg-black text-white">
        <HeroBackdrop video={media.bandVideo} photo={media.bandPhoto} labels={{ pause: labels.pauseVideo, play: labels.playVideo }} />
        <Link href="/a-propos" className="group mx-auto flex min-h-[70dvh] max-w-6xl flex-col items-center justify-end sm:min-h-[85dvh] px-4 pt-40 pb-16 text-center sm:pb-20">
          <span className="f-label text-white/60">05 / 05</span>
          <span className="f-display mt-5 block text-2xl sm:text-4xl">{labels.protocolTitle}</span>
          <span className="mt-4 block max-w-lg text-[0.8125rem] leading-relaxed text-white/70">{labels.protocolText}</span>
          <span className="f-label mt-8 inline-flex items-center gap-2 border-b border-white/40 pb-1 text-white transition-colors group-hover:border-brand-500 group-hover:text-brand-500">
            {labels.protocolCta} <ArrowRight className="size-4 rtl:rotate-180" aria-hidden />
          </span>
        </Link>
      </section>

      {/* ── Gallery: photos bleed to the edges, 1px black seams ── */}
      {gallery.length > 0 && (
        <section className="dark bg-black text-white">
          <h2 className="f-label px-4 pt-16 pb-8 text-center text-white/60">{labels.galleryTitle}</h2>
          <div className={mosaic ? "grid grid-cols-2 gap-px md:grid-cols-3" : "grid grid-cols-2 gap-px md:grid-flow-col md:auto-cols-fr md:grid-cols-none"}>
            {gallery.map((src, i) => (
              <div
                key={src}
                className={
                  mosaic && i === 0
                    ? "group relative col-span-2 aspect-[16/10] overflow-hidden md:row-span-2 md:aspect-auto"
                    : mosaic && i === 5
                      ? "group relative col-span-2 aspect-[16/10] overflow-hidden md:col-span-1"
                      : "group relative aspect-[16/10] overflow-hidden"
                }
              >
                <Image
                  src={src}
                  alt=""
                  fill
                  sizes={mosaic && i === 0 ? "(min-width: 768px) 67vw, 100vw" : "(min-width: 768px) 33vw, 50vw"}
                  className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03] motion-reduce:transition-none"
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Services ── */}
      {services.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
          <h2 className="f-display text-center text-xl sm:text-2xl">{labels.servicesTitle}</h2>
          <div className="mt-10 grid ps-px pt-px sm:grid-cols-2 lg:grid-cols-3">
            {services.map((s) => (
              <Link key={s.id} href={`/rdv?service=${s.id}`} className="group -ms-px -mt-px flex items-end justify-between gap-4 border border-border bg-background p-6 transition-colors hover:bg-card">
                <span className="min-w-0">
                  <span className="f-label block text-foreground">{s.name}</span>
                  <span className="mt-2 flex items-center gap-3 text-[0.75rem] text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="size-3.5" strokeWidth={1.5} aria-hidden /> {s.durationMin} min
                    </span>
                    <span dir="ltr">{s.price}</span>
                  </span>
                </span>
                <ArrowRight className="size-4 shrink-0 transition-colors group-hover:text-brand-500 rtl:rotate-180" aria-hidden />
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ── Contact ── */}
      {phone && (
        <section className="mx-auto flex max-w-6xl flex-wrap justify-center gap-3 px-4 pb-20">
          <a href={`tel:${phone}`} className={`${TILE} min-w-56 flex-row items-center gap-3 p-4 sm:p-4`}>
            <span className="f-label inline-flex items-center gap-2">
              <Phone className="size-4" strokeWidth={1.5} aria-hidden /> {labels.call}
            </span>
          </a>
          {whatsapp && (
            <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener" className={`${TILE} min-w-56 flex-row items-center gap-3 p-4 sm:p-4`}>
              <span className="f-label inline-flex items-center gap-2">
                <MessageCircle className="size-4" strokeWidth={1.5} aria-hidden /> {labels.whatsapp}
              </span>
            </a>
          )}
        </section>
      )}
    </>
  );
}
