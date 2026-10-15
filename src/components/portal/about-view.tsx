import Link from "next/link";
import { ArrowDown, ArrowRight, Check, Clock, FileText, MessageCircle, Phone, Radio, ShieldCheck, Wind, type LucideIcon } from "lucide-react";
import { HeroBackdrop } from "@/components/portal/hero-backdrop";
import type { AboutContent, AboutModule } from "@/lib/about-content";
import type { SiteMedia } from "@/lib/site-media";
import { cn } from "@/lib/utils";

export type AboutService = { id: string; name: string; description: string | null; durationMin: number; price: string };

const MODULE_ICON: Record<AboutModule["icon"], LucideIcon> = { live: Radio, spec: FileText, air: Wind, shield: ShieldCheck };

/** Hairline section header on a 12-column grid: label + title left, text right. */
function SectionHead({ label, title, text, index }: { label: string; title: string; text?: string; index: string }) {
  return (
    <div className="grid gap-6 border-t border-[#303030] pt-6 lg:grid-cols-12">
      <div className="lg:col-span-7">
        <p className="f-label flex items-center gap-3 text-white/50">
          <span className="text-white">{index}</span>
          <span className="h-px w-8 bg-white/40" aria-hidden />
          {label}
        </p>
        <h2 className="f-display mt-5 text-3xl text-white sm:text-[2.75rem]">{title}</h2>
      </div>
      {text && <p className="self-end text-[15px] leading-relaxed text-white/55 lg:col-span-4 lg:col-start-9">{text}</p>}
    </div>
  );
}

/**
 * "L'atelier" — technical showroom page, Porsche / BMW M minimalism: deep
 * charcoal, pure white, hairline geometry, one red accent line. Always dark,
 * whatever theme the visitor picked. Pure view: data comes from
 * app/(public)/a-propos/page.tsx, copy from lib/about-content.ts.
 */
export function AboutView({
  c,
  garageName,
  phone,
  phoneLabel,
  whatsapp: wa,
  services,
  media,
  videoLabels,
}: {
  c: AboutContent;
  garageName: string;
  phone: string | null;
  phoneLabel: string | null;
  whatsapp: string | null;
  services: AboutService[];
  media: SiteMedia;
  videoLabels: { pause: string; play: string };
}) {
  return (
    <div className="dark bg-black text-white">
      {/* ── 00 Hero: configurator canvas ─────────────────────────────── */}
      <section className="relative isolate overflow-hidden border-b border-[#303030]">
        <HeroBackdrop video={media.aboutVideo ?? media.heroVideo} photo={media.aboutPhoto ?? media.heroPhoto} dim="soft" labels={videoLabels} />
        {!media.aboutVideo && !media.aboutPhoto && !media.heroVideo && !media.heroPhoto && <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-b from-black/30 via-black/70 to-black" />}

        <div className="mx-auto grid max-w-6xl gap-12 px-4 pt-16 pb-14 sm:pt-24 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-7">
            <p className="f-label flex items-center gap-3 text-white/55">
              <span className="h-px w-8 bg-white/40" aria-hidden />
              {garageName} · {c.kicker}
            </p>
            <h1 className="f-display mt-8 text-[2.5rem] text-white sm:text-6xl">{c.heroTitle}</h1>
            <p className="f-display mt-4 text-xl text-white/40 sm:text-2xl">{c.heroAccent}</p>
            <p className="mt-8 max-w-xl text-[15px] leading-relaxed text-white/60 sm:text-base">{c.heroText}</p>
            <div className="mt-10 flex flex-wrap gap-3">
              <a href="#protocole" className="f-label group inline-flex min-h-12 items-center gap-3 bg-white px-6 text-black transition-colors hover:bg-brand-500 hover:text-white">
                {c.enter}
                <ArrowDown className="size-4 transition-transform group-hover:translate-y-0.5" strokeWidth={1.5} aria-hidden />
              </a>
              <Link href="/rdv" className="f-label inline-flex min-h-12 items-center gap-3 border border-white/30 px-6 text-white transition-colors hover:border-white">
                {c.book}
              </Link>
            </div>
          </div>

          {/* Configuration summary panel */}
          <aside className="border border-[#303030] bg-[#181818] lg:col-span-5">
            <p className="f-label flex items-center justify-between border-b border-[#303030] px-5 py-4 text-white/50">
              {c.summaryTitle}
              <span className="size-1.5 bg-white/60" aria-hidden />
            </p>
            <dl className="divide-y divide-[#303030]">
              {c.summary.map((s) => (
                <div key={s.k} className="flex items-baseline justify-between gap-4 px-5 py-3.5">
                  <dt className="text-sm text-white/50">{s.k}</dt>
                  <dd className="text-end text-sm font-medium text-white">{s.v}</dd>
                </div>
              ))}
            </dl>
          </aside>
        </div>

        {/* 5-tick progress rule */}
        <div className="mx-auto max-w-6xl px-4 pb-10">
          <ol className="grid grid-cols-5 border-t border-[#303030]" aria-hidden>
            {c.steps.map((s, i) => (
              <li key={s.code} className="relative pt-3">
                <span className={cn("absolute -top-px start-0 h-px w-full", i === 0 ? "bg-white" : "bg-transparent")} />
                <span className="absolute -top-1 start-0 h-2 w-px bg-white/40" />
                <span className="f-label text-white/40">{String(i + 1).padStart(2, "0")}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── 01 Philosophy ────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:py-28">
        <div className="grid gap-8 border-t border-[#303030] pt-6 lg:grid-cols-12">
          <p className="f-label flex items-center gap-3 text-white/50 lg:col-span-3">
            <span className="text-white">01</span>
            <span className="h-px w-8 bg-white/40" aria-hidden />
            {c.manifestoLabel}
          </p>
          <h2 className="f-display text-3xl text-white sm:text-[2.75rem] lg:col-span-9">{c.manifestoTitle}</h2>
          <div className="grid gap-6 text-[15px] leading-relaxed text-white/60 sm:grid-cols-2 lg:col-span-9 lg:col-start-4">
            {c.manifestoText.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </div>
        </div>
      </section>

      {/* ── 02 Service modules ───────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 pb-20 sm:pb-28">
        <SectionHead index="02" label={c.modulesLabel} title={c.modulesTitle} text={c.modulesText} />
        <div className="mt-12 grid border-s border-t border-[#303030] sm:grid-cols-2">
          {c.modules.map((m) => {
            const Icon = MODULE_ICON[m.icon];
            return (
              <article key={m.code} className="group flex flex-col border-e border-b border-[#303030] p-6 transition-colors hover:bg-white/[0.025] sm:p-8">
                <div className="flex items-start justify-between gap-4">
                  <p className="f-label text-white/40">{m.code}</p>
                  <Icon className="size-7 text-white/80 transition-colors group-hover:text-brand-500" strokeWidth={1.1} aria-hidden />
                </div>
                <h3 className="f-display mt-8 text-xl text-white sm:text-2xl">{m.title}</h3>
                <p className="mt-3 text-[15px] leading-relaxed text-white/55">{m.text}</p>
                <dl className="mt-8 border-t border-[#303030]">
                  {m.specs.map((s) => (
                    <div key={s.k} className="flex items-baseline justify-between gap-4 border-b border-[#303030] py-2.5 text-sm">
                      <dt className="text-white/45">{s.k}</dt>
                      <dd className="text-end font-medium text-white">{s.v}</dd>
                    </div>
                  ))}
                </dl>
                {m.cta && (
                  <Link href={m.cta.href} className="f-label mt-6 inline-flex items-center gap-2 self-start text-white hover:text-brand-500">
                    {m.cta.label}
                    <ArrowRight className="size-3.5 rtl:rotate-180" strokeWidth={1.5} aria-hidden />
                  </Link>
                )}
              </article>
            );
          })}
        </div>
      </section>

      {/* ── 03 Protocol: engineering checklist ───────────────────────── */}
      <section id="protocole" className="scroll-mt-4 border-y border-[#303030] bg-[#181818]">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:py-28">
          <SectionHead index="03" label={c.protocolLabel} title={c.protocolTitle} />

          <div className="mt-12 border border-[#303030]">
            <div className="f-label hidden grid-cols-12 gap-6 border-b border-[#303030] bg-white/[0.03] px-6 py-3 text-white/45 lg:grid">
              <span className="col-span-5">{c.protocolHead.step}</span>
              <span className="col-span-3">{c.protocolHead.ops}</span>
              <span className="col-span-2">{c.protocolHead.deliverable}</span>
              <span className="col-span-2 text-end">{c.protocolHead.status}</span>
            </div>
            <ol>
              {c.steps.map((step) => (
                <li key={step.code} className="grid gap-5 border-b border-[#303030] px-6 py-7 last:border-b-0 lg:grid-cols-12 lg:gap-6">
                  <div className="lg:col-span-5">
                    <p className="f-label text-white/50">{step.code}</p>
                    <h3 className="f-display mt-3 text-lg text-white sm:text-xl">{step.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-white/55">{step.text}</p>
                  </div>
                  <ul className="space-y-2 text-sm lg:col-span-3">
                    {step.ops.map((op) => (
                      <li key={op} className="flex items-center gap-3 text-white/80">
                        <span className="grid size-4 shrink-0 place-items-center border border-white/30" aria-hidden>
                          <Check className="size-3 text-white" strokeWidth={2} />
                        </span>
                        {op}
                      </li>
                    ))}
                  </ul>
                  <p className="text-sm lg:col-span-2">
                    <span className="f-label block text-white/40 lg:hidden">{c.protocolHead.deliverable}</span>
                    <span className="font-medium text-white">{step.deliverable}</span>
                  </p>
                  <p className="lg:col-span-2 lg:text-end">
                    <span className="f-label inline-flex items-center gap-1.5 text-emerald-400">
                      <Check className="size-3.5" strokeWidth={2} aria-hidden />
                      {c.verified}
                    </span>
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* ── 04 Comparison matrix ─────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:py-28">
        <SectionHead index="04" label={c.compareLabel} title={c.compareTitle} />

        <div className="mt-12 hidden border border-[#303030] md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#303030] bg-white/[0.03]">
                <th scope="col" className="f-label w-[15%] px-5 py-3 text-start text-white/45">{c.compareHead.topic}</th>
                <th scope="col" className="f-label w-[28%] px-5 py-3 text-start text-white/45">{c.compareHead.standard}</th>
                <th scope="col" className="f-label relative w-[29%] px-5 py-3 text-start text-white">
                  <span className="absolute inset-x-0 -top-px h-px bg-white" aria-hidden />
                  {c.compareHead.ours}
                </th>
                <th scope="col" className="f-label px-5 py-3 text-start text-white/45">{c.compareHead.benefit}</th>
              </tr>
            </thead>
            <tbody>
              {c.rows.map((r) => (
                <tr key={r.topic} className="border-t border-[#303030] align-top">
                  <th scope="row" className="px-5 py-4 text-start font-medium text-white/80">{r.topic}</th>
                  <td className="px-5 py-4 text-white/40">
                    <span className="me-2 text-white/30" aria-hidden>—</span>
                    {r.standard}
                  </td>
                  <td className="bg-white/[0.04] px-5 py-4 font-medium text-white">
                    <Check className="me-2 inline size-4 text-white" strokeWidth={2} aria-hidden />
                    {r.ours}
                  </td>
                  <td className="px-5 py-4 text-white/65">{r.benefit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-10 space-y-3 md:hidden">
          {c.rows.map((r) => (
            <div key={r.topic} className="border border-[#303030] p-4">
              <p className="f-label text-white/50">{r.topic}</p>
              <p className="mt-3 text-sm text-white/40">— {r.standard}</p>
              <p className="mt-2 flex gap-2 font-medium text-white">
                <Check className="mt-0.5 size-4 shrink-0 text-white" strokeWidth={2} aria-hidden />
                {r.ours}
              </p>
              <p className="mt-2 text-sm text-white/60">{r.benefit}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── 05 Bookable services: configurator options ───────────────── */}
      {services.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 pb-20 sm:pb-28">
          <SectionHead index="05" label={c.servicesLabel} title={c.servicesTitle} text={c.servicesText} />
          <div className="mt-12 grid border-s border-t border-[#303030] sm:grid-cols-2 lg:grid-cols-3">
            {services.map((s, i) => (
              <Link
                key={s.id}
                href={`/rdv?service=${s.id}`}
                className="group relative flex min-h-52 flex-col justify-between border-e border-b border-[#303030] p-6 transition-colors hover:bg-white/[0.03]"
              >
                <span aria-hidden className="absolute inset-x-0 top-0 h-0.5 origin-left scale-x-0 bg-brand-500 transition-transform group-hover:scale-x-100 rtl:origin-right" />
                <div>
                  <p className="f-label text-white/35">{String(i + 1).padStart(2, "0")}</p>
                  <h3 className="f-display mt-4 text-lg text-white">{s.name}</h3>
                  {s.description && <p className="mt-2 text-sm leading-relaxed text-white/50">{s.description}</p>}
                </div>
                <div className="mt-6 flex items-end justify-between gap-3 border-t border-[#303030] pt-4 text-sm">
                  <span>
                    <span className="flex items-center gap-1.5 text-white/50">
                      <Clock className="size-3.5" strokeWidth={1.5} aria-hidden /> {s.durationMin} {c.minutes}
                    </span>
                    <span className="mt-1 block font-medium text-white" dir="ltr">
                      {s.price}
                    </span>
                  </span>
                  <span className="f-label inline-flex items-center gap-2 text-white/70 group-hover:text-brand-500">
                    {c.configure}
                    <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1 rtl:rotate-180 rtl:group-hover:-translate-x-1" strokeWidth={1.5} aria-hidden />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ── 06 Technical catalogue ───────────────────────────────────── */}
      <section className="border-y border-[#303030] bg-[#181818]">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:py-28">
          <SectionHead index={services.length > 0 ? "06" : "05"} label={c.catalogLabel} title={c.catalogTitle} text={c.catalogText} />
          <div className="mt-12 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {c.catalog.map((g) => (
              <div key={g.code} className="border-t border-[#303030] pt-4">
                <p className="flex items-baseline justify-between">
                  <span className="f-display text-lg text-white">{g.title}</span>
                  <span className="f-label text-white/35">{g.code}</span>
                </p>
                <ul className="mt-4 divide-y divide-[#303030] text-sm">
                  {g.items.map((item) => (
                    <li key={item} className="flex items-center gap-3 py-2.5 text-white/70">
                      <span className="h-px w-3 shrink-0 bg-white/30" aria-hidden />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <Link href="/rdv" className="f-label mt-12 inline-flex min-h-12 items-center gap-3 border border-white/30 px-6 text-white transition-colors hover:border-white">
            {c.catalogCta}
            <ArrowRight className="size-4 rtl:rotate-180" strokeWidth={1.5} aria-hidden />
          </Link>
        </div>
      </section>

      {/* ── Booking configurator ─────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:py-28">
        <div className="border border-[#303030]">
          <div className="grid gap-6 border-b border-[#303030] p-6 sm:p-10 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <p className="f-label flex items-center gap-3 text-white/50">
                <span className="h-px w-8 bg-white/40" aria-hidden />
                {c.configLabel}
              </p>
              <h2 className="f-display mt-5 text-3xl text-white sm:text-[2.75rem]">{c.configTitle}</h2>
            </div>
            <div className="flex flex-wrap items-end gap-3 lg:col-span-5 lg:justify-end">
              <Link href="/rdv" className="f-label group inline-flex min-h-12 items-center gap-3 bg-white px-6 text-black transition-colors hover:bg-brand-500 hover:text-white">
                {c.configCta}
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-1 rtl:rotate-180 rtl:group-hover:-translate-x-1" strokeWidth={1.5} aria-hidden />
              </Link>
            </div>
          </div>
          <ol className="grid sm:grid-cols-3">
            {c.configSteps.map((s, i) => (
              <li key={s.code} className={cn("flex items-start gap-4 p-6", i > 0 && "border-t border-[#303030] sm:border-t-0 sm:border-s")}>
                <span className="f-display text-2xl text-white/30">{s.code}</span>
                <span>
                  <span className="f-label block text-white">{s.title}</span>
                  <span className="mt-1 block text-sm text-white/50">{s.text}</span>
                </span>
              </li>
            ))}
          </ol>
          {phone && (
            <div className="flex flex-wrap items-center gap-3 border-t border-[#303030] p-6">
              <span className="f-label text-white/40">{c.orCall}</span>
              <a href={`tel:${phone}`} className="inline-flex min-h-11 items-center gap-2 border border-[#303030] px-4 text-sm text-white hover:border-white" dir="ltr">
                <Phone className="size-4" strokeWidth={1.5} aria-hidden /> {phoneLabel}
              </a>
              {wa && (
                <a
                  href={`https://wa.me/${wa}`}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex min-h-11 items-center gap-2 border border-[#303030] px-4 text-sm text-white hover:border-emerald-400 hover:text-emerald-400"
                >
                  <MessageCircle className="size-4" strokeWidth={1.5} aria-hidden /> {c.whatsapp}
                </a>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
