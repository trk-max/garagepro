import Link from "next/link";
import { ArrowRight, Bot, CalendarCheck, Clock, Gauge, MessageCircle, Phone } from "lucide-react";
import "@fontsource-variable/archivo/wdth.css";
import { aboutContent } from "@/lib/about-content";
import { fmt } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { getSettings } from "@/server/settings";
import { listBookableServices, priceLabel } from "@/server/booking";

export default async function PortalHome() {
  const [{ t, lang }, settings, services] = await Promise.all([getI18n(), getSettings(), listBookableServices()]);
  const phone = settings.phone?.replace(/\s/g, "");
  const about = aboutContent(lang);
  const wa = phone ? phone.replace(/\D/g, "").replace(/^00/, "") : null;

  return (
    <>
      <section className="bg-gradient-to-b from-navy to-navy-2 text-white">
        <div className="mx-auto max-w-5xl px-4 pt-10 pb-16 sm:pt-14">
          <h1 className="text-2xl font-bold sm:text-4xl">{fmt(t.portal.homeTitle, { garage: settings.garageName })}</h1>
          <p className="mt-3 max-w-xl text-slate-300">{t.portal.homeSubtitle}</p>
        </div>
      </section>

      <div className="mx-auto -mt-10 grid max-w-5xl gap-4 px-4 sm:grid-cols-2">
        <Link href="/suivi" className="group rounded-lg bg-card p-6 shadow-sm ring-1 ring-border transition hover:-translate-y-0.5 hover:shadow-md">
          <span className="grid size-12 place-items-center rounded-md bg-emerald-500/10 text-emerald-600">
            <Gauge className="size-6" aria-hidden />
          </span>
          <h2 className="mt-4 text-lg font-semibold">{t.portal.trackCta}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t.portal.trackCtaHint}</p>
          <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-emerald-700 dark:text-emerald-400">
            {t.portal.trackCta} <ArrowRight className="size-4 transition group-hover:translate-x-0.5 rtl:rotate-180" aria-hidden />
          </span>
        </Link>
        <Link href="/rdv" className="group rounded-lg bg-card p-6 shadow-sm ring-1 ring-border transition hover:-translate-y-0.5 hover:shadow-md">
          <span className="grid size-12 place-items-center rounded-md bg-brand-500/10 text-brand-600">
            <CalendarCheck className="size-6" aria-hidden />
          </span>
          <h2 className="mt-4 text-lg font-semibold">{t.portal.bookCta}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t.portal.bookCtaHint}</p>
          <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand-700 dark:text-brand-400">
            {t.portal.bookCta} <ArrowRight className="size-4 transition group-hover:translate-x-0.5 rtl:rotate-180" aria-hidden />
          </span>
        </Link>
        <Link
          href="/assistant"
          className="group flex items-center gap-4 rounded-lg bg-card p-6 shadow-sm ring-1 ring-border transition hover:-translate-y-0.5 hover:shadow-md sm:col-span-2"
        >
          <span className="grid size-12 shrink-0 place-items-center rounded-md bg-navy text-brand-400">
            <Bot className="size-6" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-lg font-semibold">{t.assistant.homeCta}</span>
            <span className="mt-1 block text-sm text-muted-foreground">{t.assistant.homeCtaHint}</span>
          </span>
          <ArrowRight className="size-5 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 rtl:rotate-180" aria-hidden />
        </Link>
      </div>

      <section className="mx-auto max-w-5xl px-4 pt-10">
        <Link href="/a-propos" className="dark bg-blueprint group relative isolate flex flex-wrap items-center gap-4 overflow-hidden bg-[#15171c] p-6 text-white ring-1 ring-white/10 sm:p-8">
                    <span className="min-w-0 flex-1">
            <span className="label-spec block text-brand-400">05 / 05</span>
            <span className="heading-exec mt-2 block text-xl sm:text-3xl">{about.homeBandTitle}</span>
            <span className="mt-2 block text-sm text-white/65">{about.homeBandText}</span>
          </span>
          <span className="label-spec inline-flex min-h-11 items-center gap-2 bg-white px-5 text-[#15171c] transition-colors group-hover:bg-brand-500 group-hover:text-white">
            {about.enter}
            <ArrowRight className="size-4 rtl:rotate-180" aria-hidden />
          </span>
        </Link>
      </section>

      {services.length > 0 && (
        <section className="mx-auto max-w-5xl px-4 py-10">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {services.map((s) => (
              <Link key={s.id} href={`/rdv?service=${s.id}`} className="rounded-md bg-card p-4 ring-1 ring-border hover:ring-brand-300">
                <p className="font-medium">{lang === "ar" && s.nameAr ? s.nameAr : s.name}</p>
                <p className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="size-3.5" aria-hidden /> {s.durationMin} min
                  </span>
                  <span dir="ltr">{priceLabel(s.priceFrom, t, lang)}</span>
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {phone && (
        <section className="mx-auto flex max-w-5xl flex-wrap gap-3 px-4 pb-10">
          <a href={`tel:${phone}`} className="inline-flex items-center gap-2 min-h-11 rounded-lg bg-anthracite px-4 py-2.5 text-sm font-medium text-white hover:bg-black">
            <Phone className="size-4" aria-hidden /> {t.portal.call}
          </a>
          {wa && (
            <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener" className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700">
              <MessageCircle className="size-4" aria-hidden /> {t.portal.whatsapp}
            </a>
          )}
        </section>
      )}
    </>
  );
}
