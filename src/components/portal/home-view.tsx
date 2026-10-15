import Link from "next/link";
import { ArrowRight, Bot, CalendarCheck, Clock, Gauge, MessageCircle, Phone } from "lucide-react";

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
};

/** Square, flat, hairline-bordered tile; the arrow is the affordance, red only on hover. */
const TILE =
  "group flex flex-col justify-between gap-10 border border-border bg-card p-6 transition-colors hover:border-foreground sm:p-8";

/**
 * Customer home, "black marble" style: a full-bleed black hero (with the
 * garage's own photo when public/hero.jpg exists), centered uppercase type,
 * then flat square tiles separated by hairlines. Pure view, no data loading.
 */
export function HomeView({
  labels,
  services,
  phone,
  whatsapp,
  heroPhoto,
}: {
  labels: Labels;
  services: HomeService[];
  phone: string | null;
  whatsapp: string | null;
  heroPhoto: boolean;
}) {
  return (
    <>
      {/* ── Hero: the black void (or the garage's photo, edge to edge) ── */}
      <section className="dark relative isolate flex min-h-[64dvh] items-end overflow-hidden bg-black text-white sm:min-h-[72dvh]">
        {heroPhoto && (
          <>
            <div aria-hidden className="absolute inset-0 -z-10 bg-cover bg-center" style={{ backgroundImage: "url(/hero.jpg)" }} />
            <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-black via-black/40 to-black/10" />
          </>
        )}
        <div className="mx-auto w-full max-w-6xl px-4 pt-24 pb-14 text-center sm:pb-20">
          <h1 className="f-display mx-auto max-w-4xl text-3xl text-white sm:text-5xl">{labels.title}</h1>
          <p className="mx-auto mt-5 max-w-xl text-[0.8125rem] leading-relaxed tracking-[0.03em] text-[#8f8f8f]">{labels.subtitle}</p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
            <Link href="/rdv" className="f-label inline-flex min-h-12 items-center gap-3 bg-white px-7 text-black transition-colors hover:bg-brand-500 hover:text-white">
              {labels.book} <ArrowRight className="size-4 rtl:rotate-180" aria-hidden />
            </Link>
            <Link href="/suivi" className="f-label inline-flex min-h-12 items-center gap-3 text-white transition-colors hover:text-brand-500">
              {labels.track} <ArrowRight className="size-4 rtl:rotate-180" aria-hidden />
            </Link>
          </div>
        </div>
      </section>

      {/* ── Three entry points ── */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
        <div className="grid gap-px border border-border bg-border sm:grid-cols-3">
          {[
            { href: "/suivi", icon: Gauge, title: labels.track, hint: labels.trackHint },
            { href: "/rdv", icon: CalendarCheck, title: labels.book, hint: labels.bookHint },
            { href: "/assistant", icon: Bot, title: labels.assistant, hint: labels.assistantHint },
          ].map(({ href, icon: Icon, title, hint }) => (
            <Link key={href} href={href} className="group flex min-h-64 flex-col justify-between gap-10 bg-background p-6 transition-colors hover:bg-card sm:p-8">
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

      {/* ── Protocol band: dark void, centered ── */}
      <section className="dark border-y border-[#303030] bg-black text-white">
        <Link href="/a-propos" className="group mx-auto flex max-w-6xl flex-col items-center px-4 py-20 text-center sm:py-28">
          <span className="f-label text-[#8f8f8f]">05 / 05</span>
          <span className="f-display mt-5 block text-2xl sm:text-4xl">{labels.protocolTitle}</span>
          <span className="mt-4 block max-w-lg text-[0.8125rem] leading-relaxed text-[#8f8f8f]">{labels.protocolText}</span>
          <span className="f-label mt-8 inline-flex items-center gap-2 border-b border-transparent pb-1 text-white transition-colors group-hover:border-brand-500 group-hover:text-brand-500">
            {labels.protocolCta} <ArrowRight className="size-4 rtl:rotate-180" aria-hidden />
          </span>
        </Link>
      </section>

      {/* ── Services ── */}
      {services.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
          <h2 className="f-display text-center text-xl sm:text-2xl">{labels.servicesTitle}</h2>
          <div className="mt-10 grid border-s border-t border-border sm:grid-cols-2 lg:grid-cols-3">
            {services.map((s) => (
              <Link key={s.id} href={`/rdv?service=${s.id}`} className="group flex items-end justify-between gap-4 border-e border-b border-border bg-background p-6 transition-colors hover:bg-card">
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
