import { BadgeCheck, UserRound } from "lucide-react";
import { fmt, formatDay, type Lang } from "@/lib/format";
import type { Dictionary } from "@/lib/i18n/fr";
import type { Fact, ListingStatus } from "@/lib/showroom";
import { cn } from "@/lib/utils";

const STATUS_TONE: Record<ListingStatus, string> = {
  DRAFT: "border-border text-muted-foreground",
  PUBLISHED: "border-emerald-600 text-emerald-700 dark:text-emerald-400",
  RESERVED: "border-amber-500 text-amber-700 dark:text-amber-400",
  SOLD: "border-brand-500 text-brand-500",
  UNAVAILABLE: "border-border text-muted-foreground",
  ARCHIVED: "border-border text-muted-foreground line-through",
};

export function ListingStatusBadge({ status, t }: { status: string; t: Dictionary }) {
  const s = status as ListingStatus;
  return <span className={cn("f-label border px-2 py-0.5 text-[0.625rem] whitespace-nowrap", STATUS_TONE[s])}>{t.showroom.statuses[s] ?? status}</span>;
}

/** "Vérifié par le garage (OR-0042, 1 sept. 2026)" or "Déclaré par le vendeur" next to a fact. */
export function FactBadge({ fact, t, lang, compact = false }: { fact: Fact | undefined; t: Dictionary; lang: Lang; compact?: boolean }) {
  if (!fact) return null;
  const garage = fact.source === "GARAGE";
  const label =
    garage && fact.ref && fact.at && !compact
      ? fmt(t.showroom.facts.garageRef, { ref: fact.ref, date: formatDay(fact.at, lang, { day: "numeric", month: "short", year: "numeric" }) })
      : t.showroom.facts[fact.source];
  const Icon = garage ? BadgeCheck : UserRound;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[0.6875rem] leading-tight",
        garage ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground",
      )}
      title={t.showroom.facts.legend}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {label}
    </span>
  );
}
