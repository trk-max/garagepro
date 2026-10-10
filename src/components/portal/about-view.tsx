import Link from "next/link";
import { ArrowDown, ArrowRight, Clock, MessageCircle, Phone } from "lucide-react";
import type { AboutContent } from "@/lib/about-content";
import { cn } from "@/lib/utils";

export type AboutService = { id: string; name: string; description: string | null; durationMin: number; price: string };

/**
 * "L'atelier" — showroom page (Brabus / Mansory mood): always obsidian black,
 * whatever theme the visitor picked, one accent (Guard Red), wide uppercase type,
 * spec-sheet layout. Pure view: data comes from app/(public)/a-propos/page.tsx.
 */
export function AboutView({
  c,
  garageName,
  phone,
  phoneLabel,
  whatsapp: wa,
  services,
  heroPhoto,
}: {
  c: AboutContent;
  garageName: string;
  phone: string | null;
  phoneLabel: string | null;
  whatsapp: string | null;
  services: AboutService[];
  heroPhoto: boolean;
}) {
  return (
    <div className="dark bg-background text-foreground">
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="bg-carbon relative isolate flex min-h-[86dvh] items-end overflow-hidden">
        {heroPhoto && (
          <div aria-hidden className="absolute inset-0 -z-10 bg-cover bg-center opacity-60" style={{ backgroundImage: "url(/hero.jpg)" }} />
        )}
        {/* Light streaks + red glow: a car under workshop lights, in pure CSS. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -bottom-40 left-1/2 h-[28rem] w-[60rem] -translate-x-1/2 rounded-full bg-brand-500/25 blur-[120px]" />
          <div className="absolute top-[38%] right-0 left-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />
          <div className="absolute top-[38%] right-[15%] left-[15%] h-8 bg-gradient-to-r from-transparent via-white/[0.06] to-transparent blur-md" />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-black/70" />
        </div>

        <div className="mx-auto w-full max-w-6xl px-4 pt-24 pb-10 sm:pb-14">
          <p className="label-spec text-brand-400">
            {garageName} — {c.kicker}
          </p>
          <h1 className="display-wide mt-5 text-[2.6rem] text-white sm:text-7xl lg:text-8xl">
            <span className="block">{c.heroTitle[0]}</span>
            <span className="block text-white/35">{c.heroTitle[1]}</span>
          </h1>
          <p className="mt-6 max-w-xl text-base text-white/70 sm:text-lg">{c.heroText}</p>

          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href="#protocole"
              className="label-spec group inline-flex min-h-12 items-center gap-3 bg-brand-500 px-6 text-white transition-colors hover:bg-brand-600"
            >
              {c.enter}
              <ArrowDown className="size-4 transition-transform group-hover:translate-y-0.5" aria-hidden />
            </a>
            <Link
              href="/rdv"
              className="label-spec inline-flex min-h-12 items-center gap-3 border border-white/25 px-6 text-white transition-colors hover:border-white hover:bg-white hover:text-black"
            >
              {c.book}
            </Link>
          </div>

          <dl className="mt-14 grid grid-cols-2 border-t border-white/15 sm:grid-cols-4">
            {c.stats.map((s, i) => (
              <div key={s.label} className={cn("flex flex-col-reverse justify-end py-5 pe-4", i > 0 && "sm:border-s sm:border-white/15 sm:ps-6", i % 2 === 1 && "max-sm:border-s max-sm:border-white/15 max-sm:ps-4")}>
                <dt className="label-spec mt-2 text-white/50">{s.label}</dt>
                <dd className="display-wide text-2xl text-white sm:text-3xl">{s.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ── Manifesto ────────────────────────────────────────────────── */}
      <section className="border-y border-white/10">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-16 sm:py-24 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <p className="label-spec text-brand-400">{c.manifestoLabel}</p>
            <h2 className="display-wide mt-4 text-3xl sm:text-5xl">{c.manifestoTitle}</h2>
          </div>
          <div className="space-y-5 self-end text-lg leading-relaxed text-white/65">
            {c.manifestoText.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </div>
        </div>
      </section>

      {/* ── Protocol: spec sheet ─────────────────────────────────────── */}
      <section id="protocole" className="scroll-mt-4">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="label-spec text-brand-400">{c.protocolLabel}</p>
              <h2 className="display-wide mt-4 text-3xl sm:text-5xl">{c.protocolTitle}</h2>
            </div>
            <p className="label-spec text-white/40">05 / 05</p>
          </div>

          <ol className="mt-12 border-t border-white/15">
            {c.steps.map((step, i) => (
              <li key={step.code} className="group grid gap-4 border-b border-white/15 py-8 transition-colors hover:bg-white/[0.02] sm:grid-cols-[7rem_1fr_16rem] sm:gap-8 sm:py-10">
                <span className="display-wide text-5xl text-white/15 transition-colors group-hover:text-brand-500 sm:text-6xl" aria-hidden>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <p className="label-spec text-brand-400">{step.code}</p>
                  <h3 className="display-wide mt-3 text-xl sm:text-2xl">{step.title}</h3>
                  <p className="mt-3 max-w-xl leading-relaxed text-white/65">{step.text}</p>
                </div>
                <ul className="self-center border-s border-white/15 ps-5 text-sm">
                  {step.specs.map((spec) => (
                    <li key={spec} className="flex items-center gap-2 py-1 text-white/80">
                      <span className="size-1.5 shrink-0 bg-brand-500" aria-hidden />
                      {spec}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Comparison matrix ────────────────────────────────────────── */}
      <section className="bg-carbon border-y border-white/10">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
          <p className="label-spec text-brand-400">{c.compareLabel}</p>
          <h2 className="display-wide mt-4 text-3xl sm:text-5xl">{c.compareTitle}</h2>

          {/* Desktop: spec chart */}
          <div className="mt-12 hidden overflow-hidden border border-white/15 md:block">
            <table className="w-full text-start text-sm">
              <thead>
                <tr className="bg-white/[0.04]">
                  <th scope="col" className="label-spec w-[16%] p-4 text-start text-white/50">{c.compareHead.topic}</th>
                  <th scope="col" className="label-spec w-[28%] p-4 text-start text-white/50">{c.compareHead.standard}</th>
                  <th scope="col" className="label-spec w-[28%] border-x border-brand-500/40 bg-brand-500/10 p-4 text-start text-white">{c.compareHead.ours}</th>
                  <th scope="col" className="label-spec p-4 text-start text-white/50">{c.compareHead.benefit}</th>
                </tr>
              </thead>
              <tbody>
                {c.rows.map((r) => (
                  <tr key={r.topic} className="border-t border-white/10">
                    <th scope="row" className="label-spec p-4 text-start align-top text-white/80">{r.topic}</th>
                    <td className="p-4 align-top text-white/45 line-through decoration-white/20">{r.standard}</td>
                    <td className="border-x border-brand-500/40 bg-brand-500/[0.06] p-4 align-top font-medium text-white">{r.ours}</td>
                    <td className="p-4 align-top text-white/70">{r.benefit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: one spec card per criterion */}
          <div className="mt-10 space-y-3 md:hidden">
            {c.rows.map((r) => (
              <div key={r.topic} className="border border-white/15 p-4">
                <p className="label-spec text-white/80">{r.topic}</p>
                <p className="mt-3 text-sm text-white/45 line-through decoration-white/20">{r.standard}</p>
                <p className="mt-2 border-s-2 border-brand-500 ps-3 font-medium text-white">{r.ours}</p>
                <p className="mt-2 text-sm text-white/65">→ {r.benefit}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Services: staggered masonry ──────────────────────────────── */}
      {services.length > 0 && (
        <section>
          <div className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
            <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr] lg:items-end">
              <div>
                <p className="label-spec text-brand-400">{c.servicesLabel}</p>
                <h2 className="display-wide mt-4 text-3xl sm:text-5xl">{c.servicesTitle}</h2>
              </div>
              <p className="text-white/55 lg:text-end">{c.servicesText}</p>
            </div>

            <div className="mt-12 gap-4 sm:columns-2 lg:columns-3">
              {services.map((s, i) => {
                const { name, description } = s;
                const tall = i % 3 === 0;
                return (
                  <Link
                    key={s.id}
                    href={`/rdv?service=${s.id}`}
                    className={cn(
                      "group mb-4 flex break-inside-avoid flex-col justify-between border border-white/15 bg-white/[0.02] p-6 transition-colors hover:border-brand-500 hover:bg-brand-500/[0.06]",
                      tall ? "min-h-64" : "min-h-44",
                    )}
                  >
                    <div>
                      <p className="label-spec text-white/35">{String(i + 1).padStart(2, "0")}</p>
                      <h3 className="display-wide mt-3 text-lg sm:text-xl">{name}</h3>
                      {description && <p className="mt-3 text-sm leading-relaxed text-white/55">{description}</p>}
                    </div>
                    <div className="mt-6 flex items-end justify-between gap-3 border-t border-white/10 pt-4 text-sm">
                      <span className="space-y-1">
                        <span className="flex items-center gap-1.5 text-white/60">
                          <Clock className="size-3.5" aria-hidden /> {s.durationMin} {c.minutes}
                        </span>
                        <span className="block font-medium text-white" dir="ltr">
                          {s.price}
                        </span>
                      </span>
                      <span className="label-spec inline-flex items-center gap-2 text-brand-400">
                        {c.configure}
                        <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1 rtl:rotate-180 rtl:group-hover:-translate-x-1" aria-hidden />
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ── Booking configurator ─────────────────────────────────────── */}
      <section className="relative isolate overflow-hidden border-t border-white/10">
        <div aria-hidden className="absolute -top-32 right-0 -z-10 h-80 w-[40rem] rounded-full bg-brand-500/15 blur-[110px]" />
        <div className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
          <p className="label-spec text-brand-400">{c.configLabel}</p>
          <h2 className="display-wide mt-4 text-3xl sm:text-5xl">{c.configTitle}</h2>

          <ol className="mt-10 grid border border-white/15 sm:grid-cols-3">
            {c.configSteps.map((s, i) => (
              <li key={s.code} className={cn("flex items-start gap-4 p-6", i > 0 && "border-t border-white/15 sm:border-t-0 sm:border-s")}>
                <span className="display-wide text-3xl text-brand-500">{s.code}</span>
                <span>
                  <span className="label-spec block text-white">{s.title}</span>
                  <span className="mt-1 block text-sm text-white/55">{s.text}</span>
                </span>
              </li>
            ))}
          </ol>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/rdv" className="label-spec group inline-flex min-h-12 items-center gap-3 bg-brand-500 px-6 text-white transition-colors hover:bg-brand-600">
              {c.configCta}
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-1 rtl:rotate-180 rtl:group-hover:-translate-x-1" aria-hidden />
            </Link>
            {phone && (
              <>
                <span className="label-spec px-2 text-white/40">{c.orCall}</span>
                <a href={`tel:${phone}`} className="label-spec inline-flex min-h-12 items-center gap-2 border border-white/25 px-5 text-white hover:border-white" dir="ltr">
                  <Phone className="size-4" aria-hidden /> {phoneLabel}
                </a>
                {wa && (
                  <a
                    href={`https://wa.me/${wa}`}
                    target="_blank"
                    rel="noopener"
                    className="label-spec inline-flex min-h-12 items-center gap-2 border border-white/25 px-5 text-white hover:border-emerald-500 hover:text-emerald-400"
                  >
                    <MessageCircle className="size-4" aria-hidden /> {c.whatsapp}
                  </a>
                )}
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
