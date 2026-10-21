import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { ArrowLeft, FileText, Phone } from "lucide-react";
import { FactBadge } from "@/components/showroom/badges";
import { FavoriteButton } from "@/components/showroom/favorites";
import { ListingGallery } from "@/components/showroom/gallery";
import { ListingCard } from "@/components/showroom/listing-card";
import { fmt, formatDate, formatKm } from "@/lib/format";
import type { Dictionary } from "@/lib/i18n/fr";
import { getI18n } from "@/lib/i18n/server";
import { formatPriceDt, isContactable, listingSlug, numberFromSlug, readFacts, readSpecs, readStringList } from "@/lib/showroom";
import { ContactSellerForm } from "@/components/showroom/contact-form";
import { cn } from "@/lib/utils";
import { getPublicListing, relatedListings } from "@/server/showroom";
import { getSettings } from "@/server/settings";

type PageProps = { params: Promise<{ slug: string }> };

async function load(slug: string) {
  const number = numberFromSlug(slug);
  return number ? getPublicListing(number) : null;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const l = await load((await params).slug);
  if (!l) return {};
  const { lang } = await getI18n();
  const title = [l.make, l.model, l.version, l.year].filter(Boolean).join(" ");
  return { title, description: l.price ? `${title} — ${formatPriceDt(l.price, lang)}` : title };
}

/** Public vehicle page: gallery, price, key facts with their source, sections, seller card, related vehicles. */
export default async function ListingPublicPage({ params }: PageProps) {
  const { slug } = await params;
  const l = await load(slug);
  if (!l) notFound();
  // Old or hand-typed address: send to the canonical one (only the number matters).
  const canonical = listingSlug(l);
  if (slug !== canonical) permanentRedirect(`/showroom/${canonical}`);

  const [{ t, lang }, settings, related] = await Promise.all([getI18n(), getSettings(), relatedListings(l)]);
  const p = t.showroom.public;
  const f = t.showroom.fields;
  const facts = readFacts(l.facts);
  const photos = l.media.filter((m) => m.kind === "PHOTO");
  const documents = l.media.filter((m) => m.kind === "DOCUMENT");
  const equipment = readStringList(l.equipment);
  const specs = readSpecs(l.specs);
  const title = [l.make, l.model].join(" ");
  const sold = l.status === "SOLD";
  const phone = settings.phone?.replace(/\s/g, "") || null;

  const keyFacts: { label: string; value: string; fact?: (typeof facts)[keyof typeof facts] }[] = [
    { label: f.year, value: l.year ? String(l.year) : "—", fact: facts.year },
    { label: f.mileage, value: formatKm(l.mileage, lang), fact: facts.mileage },
    { label: f.fuel, value: l.fuel ? t.fuel[l.fuel as keyof Dictionary["fuel"]] : "—", fact: facts.fuel },
    { label: f.gearbox, value: l.gearbox ? t.showroom.gearbox[l.gearbox as keyof Dictionary["showroom"]["gearbox"]] : "—" },
    { label: f.powerHp, value: l.powerHp ? `${l.powerHp} ch` : l.fiscalHp ? `${l.fiscalHp} CV` : "—" },
  ];
  const technical: [string, string | null][] = [
    [f.version, l.version],
    [f.engineCc, l.engineCc ? `${l.engineCc} cm³` : null],
    [f.powerHp, l.powerHp ? `${l.powerHp} ch` : null],
    [f.fiscalHp, l.fiscalHp ? `${l.fiscalHp} CV` : null],
    [f.doors, l.doors ? String(l.doors) : null],
    [f.seats, l.seats ? String(l.seats) : null],
    [f.colorExt, l.colorExt],
    [f.colorInt, l.colorInt],
    [f.condition, l.condition ? t.showroom.condition[l.condition as keyof Dictionary["showroom"]["condition"]] : null],
    ...specs.map((s) => [s.label, s.value] as [string, string]),
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <Link href="/showroom" className="f-label inline-flex min-h-11 items-center gap-2 text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden /> {p.back}
      </Link>

      {/* Phones: title and price first, then photos and details, then the seller and the form.
          Computers: details on the left, title / price and seller / form on the right. */}
      <div className="mt-2 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:grid-rows-[auto_1fr]">
        <div className="border border-border p-5 lg:col-start-2 lg:row-start-1">
          <div className="flex items-start gap-2">
            <h1 className="f-display min-w-0 flex-1 text-2xl leading-tight">
              {title}
              {l.version && <span className="mt-1 block text-sm font-normal tracking-normal text-muted-foreground normal-case">{l.version}</span>}
            </h1>
            <FavoriteButton number={l.number} className="shrink-0" />
          </div>
          <p className={cn("mt-4 text-3xl font-semibold", sold && "text-muted-foreground line-through")} dir="ltr">
            {l.price ? formatPriceDt(l.price, lang) : p.priceOnRequest}
          </p>
          {l.status !== "PUBLISHED" && (
            <p className={cn("mt-3 border-s-2 ps-2 text-sm", sold ? "border-brand-500" : "border-amber-500")}>{sold ? p.soldNotice : p.reservedNotice}</p>
          )}
          {l.publishedAt && <p className="mt-3 text-xs text-muted-foreground">{fmt(p.publishedOn, { date: formatDate(l.publishedAt, lang) })}</p>}
        </div>

        <div className="min-w-0 space-y-8 lg:col-start-1 lg:row-span-2 lg:row-start-1">
          <ListingGallery photos={photos} title={title} sold={sold} />

          <section aria-labelledby="facts" className="grid grid-cols-2 gap-px border border-border bg-border sm:grid-cols-5">
            <h2 id="facts" className="sr-only">
              {p.sections.specs}
            </h2>
            {keyFacts.map((k) => (
              <div key={k.label} className="bg-background p-3">
                <p className="f-label text-[0.625rem] text-muted-foreground">{k.label}</p>
                <p className="mt-1 font-semibold">{k.value}</p>
                {k.fact && k.value !== "—" && (
                  <p className="mt-1">
                    <FactBadge fact={k.fact} t={t} lang={lang} compact />
                  </p>
                )}
              </div>
            ))}
          </section>
          <p className="-mt-6 text-xs text-muted-foreground">{t.showroom.facts.legend}</p>

          {l.description && (
            <Section title={p.sections.description}>
              <p className="text-sm leading-relaxed whitespace-pre-line">{l.description}</p>
            </Section>
          )}

          {technical.some(([, v]) => v) && (
            <Section title={p.sections.specs}>
              <dl className="grid gap-x-8 sm:grid-cols-2">
                {technical
                  .filter(([, v]) => v)
                  .map(([label, value], i) => (
                    <div key={`${label}-${i}`} className="flex justify-between gap-4 border-b border-border py-2 text-sm">
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd className="text-end font-medium">{value}</dd>
                    </div>
                  ))}
              </dl>
            </Section>
          )}

          {equipment.length > 0 && (
            <Section title={p.sections.equipment}>
              <ul className="grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
                {equipment.map((e) => (
                  <li key={e} className="flex gap-2 py-1">
                    <span className="mt-2 size-1.5 shrink-0 bg-brand-500" aria-hidden />
                    {e}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {l.historySummary && (
            <Section title={p.sections.history}>
              <p className="text-sm leading-relaxed whitespace-pre-line">{l.historySummary}</p>
              <p className="mt-2 text-xs text-muted-foreground">{p.historyNote}</p>
            </Section>
          )}

          {documents.length > 0 && (
            <Section title={p.sections.documents}>
              <ul className="divide-y divide-border border border-border">
                {documents.map((d, i) => (
                  <li key={d.id}>
                    <a href={`/api/showroom/media/${d.id}`} target="_blank" rel="noopener noreferrer" className="flex min-h-12 items-center gap-3 px-3 text-sm hover:text-brand-500">
                      <FileText className="size-4 shrink-0" aria-hidden />
                      {d.caption || `PDF ${i + 1}`}
                    </a>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>

        <aside className="space-y-4 lg:col-start-2 lg:row-start-2">
          <div className="border border-border p-5">
            <p className="f-label text-muted-foreground">{p.seller}</p>
            <p className="mt-2 font-semibold">{settings.garageName}</p>
            {l.sellerName && <p className="text-sm text-muted-foreground">{l.sellerName}</p>}
            {phone && (
              <a href={`tel:${phone}`} className="f-label mt-4 flex min-h-11 items-center justify-center gap-2 border border-foreground px-4 hover:border-brand-500 hover:bg-brand-500 hover:text-white">
                <Phone className="size-4" aria-hidden />
                <span dir="ltr">{settings.phone}</span>
              </a>
            )}
          </div>
          {isContactable(l.status) && (
            <div id="contact" className="border border-border p-5">
              <h2 className="f-display text-lg">{t.showroom.contact.title}</h2>
              <p className="mt-2 mb-4 text-xs text-muted-foreground">{t.showroom.contact.intro}</p>
              <ContactSellerForm listingNumber={l.number} />
            </div>
          )}
        </aside>
      </div>

      {related.length > 0 && (
        <section className="mt-12" aria-labelledby="related">
          <h2 id="related" className="f-display mb-4 text-xl">
            {p.sections.related}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {related.map((r) => (
              <ListingCard key={r.number} l={r} t={t} lang={lang} />
            ))}
          </div>
        </section>
      )}
      <div className="h-10" />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="f-display mb-3 border-b border-border pb-2 text-lg">{title}</h2>
      {children}
    </section>
  );
}
