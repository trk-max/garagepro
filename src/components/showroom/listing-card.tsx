import Link from "next/link";
import { BadgeCheck, CarFront } from "lucide-react";
import { FavoriteButton } from "@/components/showroom/favorites";
import { formatKm, type Lang } from "@/lib/format";
import type { Dictionary } from "@/lib/i18n/fr";
import { formatPriceDt, listingSlug, readFacts } from "@/lib/showroom";
import { cn } from "@/lib/utils";

export type CardListing = {
  number: number;
  make: string;
  model: string;
  version: string | null;
  year: number | null;
  mileage: number | null;
  fuel: string | null;
  gearbox: string | null;
  price: number | null;
  status: string;
  facts: unknown;
  coverId: string | null;
};

/** One vehicle in the public grid: photo, title, price, key facts, reserved / sold ribbon, favourite. */
export function ListingCard({ l, t, lang }: { l: CardListing; t: Dictionary; lang: Lang }) {
  const p = t.showroom.public;
  const href = `/showroom/${listingSlug(l)}`;
  const kmVerified = readFacts(l.facts).mileage?.source === "GARAGE";
  const facts = [
    l.year ? String(l.year) : null,
    l.mileage != null ? formatKm(l.mileage, lang) : null,
    l.fuel ? t.fuel[l.fuel as keyof Dictionary["fuel"]] : null,
    l.gearbox ? t.showroom.gearbox[l.gearbox as keyof Dictionary["showroom"]["gearbox"]] : null,
  ].filter(Boolean);

  return (
    <article className="group relative flex flex-col border border-border bg-background">
      <Link href={href} className="relative block aspect-[4/3] overflow-hidden bg-muted" tabIndex={-1} aria-hidden>
        {l.coverId ? (
          // eslint-disable-next-line @next/next/no-img-element -- files are streamed by /api/showroom/media after a check
          <img
            src={`/api/showroom/media/${l.coverId}`}
            alt=""
            loading="lazy"
            className={cn("size-full object-cover transition-transform duration-500 group-hover:scale-[1.03] motion-reduce:transition-none", l.status === "SOLD" && "grayscale")}
          />
        ) : (
          <span className="grid size-full place-items-center text-muted-foreground">
            <CarFront className="size-10" strokeWidth={1} />
          </span>
        )}
        {(l.status === "RESERVED" || l.status === "SOLD") && (
          <span className={cn("f-label absolute start-0 top-3 px-3 py-1 text-[0.625rem] text-white", l.status === "SOLD" ? "bg-brand-500" : "bg-amber-600")}>
            {l.status === "SOLD" ? p.sold : p.reserved}
          </span>
        )}
      </Link>
      <FavoriteButton number={l.number} className="absolute end-0 top-0 z-10" />
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="f-display text-base leading-snug">
          <Link href={href} className="after:absolute after:inset-0 after:content-[''] focus-visible:underline">
            {l.make} {l.model}
          </Link>
        </h3>
        {l.version && <p className="-mt-1 truncate text-xs text-muted-foreground">{l.version}</p>}
        <p className="text-xs text-muted-foreground">{facts.join(" · ") || "—"}</p>
        {kmVerified && (
          <p className="inline-flex items-center gap-1 text-[0.6875rem] text-emerald-700 dark:text-emerald-400">
            <BadgeCheck className="size-3.5" aria-hidden />
            {t.showroom.facts.GARAGE} ({t.showroom.fields.mileage.toLowerCase()})
          </p>
        )}
        <p className={cn("mt-auto pt-2 text-lg font-semibold", l.status === "SOLD" && "text-muted-foreground line-through")} dir="ltr">
          {l.price ? formatPriceDt(l.price, lang) : p.priceOnRequest}
        </p>
      </div>
    </article>
  );
}
