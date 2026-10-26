import Link from "next/link";
import { ArrowRight, Bot, CalendarCheck, CarFront, ChevronRight, Gauge, MessageCircle, Phone, UsersRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { GpMonogram } from "@/components/brand/garagepro-logo";
import { LangSwitch } from "@/components/garage/lang-switch";
import { InstallCard } from "@/components/pwa/install-card";
import { fmt, formatMoney } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { listBookableServices } from "@/server/booking";
import { getSettings } from "@/server/settings";

export const dynamic = "force-dynamic";

/**
 * Home of the CLIENT app: three big entries (track my repair, book, showroom), the assistant,
 * call / WhatsApp, the services with their « à partir de » price (owner's mock-up « Prestations »)
 * and the install card. Every entry opens the customer site's existing page (same behaviour, same data).
 */
export default async function ClientAppHome() {
  const [{ t, lang }, settings, services] = await Promise.all([getI18n(), getSettings(), listBookableServices().catch(() => [])]);
  const c = t.app.client;
  const phone = settings.phone?.replace(/\s/g, "") || null;
  const whatsapp = phone ? phone.replace(/\D/g, "").replace(/^00/, "") || null : null;
  const booking = settings.bookingEnabled && services.length > 0;

  const entries: { href: string; title: string; hint: string; icon: LucideIcon; primary?: boolean }[] = [
    { href: "/suivi", title: c.track, hint: c.trackHint, icon: Gauge, primary: true },
    ...(booking ? [{ href: "/rdv", title: c.book, hint: c.bookHint, icon: CalendarCheck }] : []),
    { href: "/showroom", title: c.showroom, hint: c.showroomHint, icon: CarFront },
  ];

  return (
    <main className="mx-auto w-full max-w-md space-y-6 px-4 pt-5 pb-8">
      <header className="flex items-center gap-3">
        <span className="phone-dot" aria-hidden />
        <span className="phone-kicker min-w-0 flex-1 truncate !text-white">{settings.garageName}</span>
        <LangSwitch className="border-white/10" />
      </header>

      <section className="flex items-center gap-4">
        <GpMonogram className="h-14 w-auto shrink-0 text-white" aria-hidden />
        <div className="min-w-0">
          <p className="phone-kicker">{c.kicker}</p>
          <h1 className="mt-1 text-[1.75rem] leading-tight font-bold tracking-tight">{c.title}</h1>
        </div>
      </section>

      <nav className="grid gap-3" aria-label={c.title}>
        {entries.map(({ href, title, hint, icon: Icon, primary }) => (
          <Link
            key={href}
            href={href}
            className="phone-card group flex min-h-24 items-center gap-4 p-5 transition-colors hover:border-white/20 active:scale-[0.99]"
            data-testid={`app-entry-${href.slice(1)}`}
          >
            <span
              className="grid size-14 shrink-0 place-items-center rounded-2xl text-white"
              style={{ background: primary ? "linear-gradient(180deg, var(--phone-orange-from), var(--phone-orange-to))" : "rgb(255 255 255 / 0.07)" }}
              aria-hidden
            >
              <Icon className="size-7" strokeWidth={1.8} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-lg leading-snug font-semibold">{title}</span>
              <span className="mt-0.5 block text-sm text-[var(--phone-muted)]">{hint}</span>
            </span>
            <ChevronRight className="size-5 shrink-0 text-white/40 transition-transform group-hover:translate-x-0.5 rtl:rotate-180" aria-hidden />
          </Link>
        ))}
      </nav>

      <section className="grid grid-cols-3 gap-3">
        <Link href="/assistant" className="phone-card flex min-h-24 flex-col items-center justify-center gap-2 p-3 text-center text-sm font-medium hover:border-white/20">
          <Bot className="size-6 text-[#f58a4f]" aria-hidden /> {c.assistant}
        </Link>
        {phone ? (
          <a href={`tel:${phone}`} className="phone-card flex min-h-24 flex-col items-center justify-center gap-2 p-3 text-center text-sm font-medium hover:border-white/20">
            <Phone className="size-6" aria-hidden /> {c.call}
          </a>
        ) : (
          <span className="phone-card opacity-0" aria-hidden />
        )}
        {whatsapp ? (
          <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener" className="phone-card flex min-h-24 flex-col items-center justify-center gap-2 p-3 text-center text-sm font-medium hover:border-white/20">
            <MessageCircle className="size-6 text-[#5bc98a]" aria-hidden /> {c.whatsapp}
          </a>
        ) : (
          <span className="phone-card opacity-0" aria-hidden />
        )}
      </section>

      {booking && (
        <section aria-labelledby="app-services" className="space-y-3">
          <div>
            <p className="phone-kicker !text-[#e8412c]">{c.servicesKicker}</p>
            <h2 id="app-services" className="mt-1 text-2xl font-bold tracking-tight">
              {c.servicesTitle}
            </h2>
          </div>
          <ul className="grid gap-3">
            {services.slice(0, 6).map((s) => (
              <li key={s.id}>
                <Link href={`/rdv?service=${s.id}`} className="phone-card flex items-start justify-between gap-4 p-5 hover:border-white/20">
                  <span className="min-w-0">
                    <span className="block font-semibold">{lang === "ar" && s.nameAr ? s.nameAr : s.name}</span>
                    <span className="mt-0.5 block text-xs text-[var(--phone-muted)]">{fmt(c.minutes, { n: s.durationMin })}</span>
                  </span>
                  <span className="shrink-0 text-end">
                    {s.priceFrom != null && <span className="phone-kicker block !text-[10px]">{c.from}</span>}
                    <span className="block text-lg font-bold tabular-nums" dir="ltr">
                      {s.priceFrom != null ? formatMoney(s.priceFrom, lang) : t.booking.onQuote}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <Link href="/rdv" className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-white px-6 text-sm font-semibold tracking-wide text-black uppercase hover:bg-white/90">
            {c.bookCta} <ArrowRight className="size-4 rtl:rotate-180" aria-hidden />
          </Link>
        </section>
      )}

      <InstallCard
        labels={{
          title: c.installTitle,
          text: fmt(c.installText, { name: settings.garageName }),
          button: c.installButton,
          iosSteps: c.iosSteps,
          otherSteps: c.otherSteps,
          httpsOnly: c.httpsOnly,
        }}
      />

      <Link href="/equipe" className="flex min-h-11 items-center justify-center gap-2 text-sm text-[var(--phone-muted)] hover:text-white">
        <UsersRound className="size-4" aria-hidden /> {c.staff}
      </Link>
    </main>
  );
}
