import Link from "next/link";
import { CarFront } from "lucide-react";
import type { CustomerCard as Card } from "@/server/dashboard-v10-customers";
import { CustomerAvatar } from "@/components/customers/customer-avatar";
import { FavoriteStar } from "@/components/customers/favorite-star";
import { Chip } from "@/components/ui/redesign/chip";
import type { Dictionary } from "@/lib/i18n/fr";
import { fmt, formatDate, type Lang } from "@/lib/format";

/**
 * Customer card (reference "Contacts"): star at the corner, gradient initials,
 * name, phone / e-mail, person / company chip, vehicles and last visit. The whole
 * card opens the customer file (a stretched link; the star stays its own button).
 */
export function CustomerCard({ c, t, lang }: { c: Card; t: Dictionary; lang: Lang }) {
  const p = t.v10.pages.customers;
  return (
    <li className="gp-lift relative flex flex-col items-center rounded-[24px] border border-gp-line bg-gp-card p-5 text-center shadow-gp hover:bg-gp-hover/40">
      <div className="absolute end-3 top-3">
        <FavoriteStar id={c.id} name={c.name} initial={c.isFavorite} />
      </div>
      <CustomerAvatar name={c.name} size={60} />
      <h3 className="mt-3 line-clamp-2 text-[15px] font-semibold break-words">
        <Link href={`/garage/customers/${c.id}`} className="after:absolute after:inset-0 after:rounded-[24px] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-gp-accent" aria-label={fmt(p.open, { name: c.name })}>
          {c.name}
        </Link>
      </h3>
      <p className="mt-0.5 text-[13px] text-gp-muted" dir="ltr">{c.phone}</p>
      {c.email && <p className="max-w-full truncate text-xs text-gp-muted" dir="ltr">{c.email}</p>}
      <Chip tone={c.kind === "COMPANY" ? "accent" : "neutral"} className="mt-3">
        {c.kind === "COMPANY" ? p.company : p.person}
      </Chip>
      <div className="mt-3 w-full border-t border-gp-line pt-3 text-xs text-gp-muted">
        <p className="flex items-center justify-center gap-1.5 font-medium text-gp-ink">
          <CarFront className="size-3.5" aria-hidden /> {fmt(p.vehicles, { n: c.vehicles })}
        </p>
        <p className="mt-1">{c.lastVisit ? fmt(p.lastVisit, { date: formatDate(c.lastVisit, lang) }) : p.never}</p>
      </div>
    </li>
  );
}
