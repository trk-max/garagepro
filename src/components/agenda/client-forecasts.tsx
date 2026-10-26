import Link from "next/link";
import { CalendarCheck } from "lucide-react";
import { nameOf } from "@/components/agenda/agenda-ui";
import { fmt, formatKm, formatMoney, type Lang } from "@/lib/format";
import type { Dictionary } from "@/lib/i18n/fr";
import type { ClientForecast } from "@/server/agenda";

const monthYear = (d: Date, lang: Lang) => new Intl.DateTimeFormat(lang === "ar" ? "ar-TN" : lang === "en" ? "en-GB" : "fr-FR", { month: "long", year: "numeric", numberingSystem: "latn", timeZone: "Africa/Tunis" }).format(d);

/**
 * Customer side (tracking page, QR card): "Prochains entretiens" in plain words, always marked
 * "estimation", with "Prendre RDV" (existing online booking, reason pre-filled).
 */
export function ClientForecasts({ rows, t, lang, className, base = "" }: { rows: ClientForecast[]; t: Dictionary; lang: Lang; className?: string; /** PWA client app: "/app" keeps the booking link inside the app. */ base?: string }) {
  if (rows.length === 0) return null;
  const c = t.v12.client;
  const reason = fmt(c.reason, { items: rows.slice(0, 4).map((r) => nameOf(r.item, lang)).join(", ") });
  return (
    <section className={className ?? "rounded-[24px] border border-gp-line bg-gp-card p-5 text-gp-ink shadow-gp"} aria-labelledby="client-agenda">
      <h2 id="client-agenda" className="font-semibold">
        {c.title}
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">{c.hint}</p>
      <ul className="mt-3 divide-y text-sm">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-baseline gap-x-2 py-2">
            <span className="font-medium">{nameOf(r.item, lang)}</span>
            <span>{fmt(c.around, { when: r.dueDate ? monthYear(r.dueDate, lang) : formatKm(r.dueKm, lang) })}</span>
            <span className="rounded-full bg-gp-panel px-2 text-xs">{c.estimate}</span>
            {r.priceTtc !== null && (
              <span className="text-xs text-muted-foreground" dir="ltr">
                {fmt(c.price, { price: formatMoney(r.priceTtc, lang) })}
              </span>
            )}
          </li>
        ))}
      </ul>
      <Link href={`${base}/rdv?notes=${encodeURIComponent(reason)}`} className="mt-3 inline-flex h-11 items-center gap-2 rounded-full bg-gp-primary px-5 text-sm font-medium text-gp-primary-ink">
        <CalendarCheck className="size-4" aria-hidden /> {c.book}
      </Link>
    </section>
  );
}
