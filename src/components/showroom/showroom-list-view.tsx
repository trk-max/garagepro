import type React from "react";
import Link from "next/link";
import { FavoritesLink } from "@/components/showroom/favorites";
import { ListingCard } from "@/components/showroom/listing-card";
import { fmt } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { FUELS, GEARBOXES, SORTS, parseShowroomQuery, type ShowroomQuery } from "@/lib/showroom";
import { cn } from "@/lib/utils";
import { listPublicListings, publicMakes } from "@/server/showroom";
import { getSettings } from "@/server/settings";

const control = "h-11 w-full min-w-0 border border-border bg-background px-3 text-sm outline-none focus-visible:border-foreground";

/**
 * Public showroom: grid of vehicles for sale, search, filters, sorting, pages, favourites (this browser).
 * Also inside the PWA client app (/app/showroom, `base="/app"`, no dark title band: the app has its own header).
 */
export async function ShowroomListView({ params, base = "" }: { params: Record<string, string | string[] | undefined>; base?: "" | "/app" }) {
  const query = parseShowroomQuery(params);
  const [{ t, lang }, settings, makes, result] = await Promise.all([getI18n(), getSettings(), publicMakes(), listPublicListings(query)]);
  const p = t.showroom.public;
  const favourites = !!query.numbers;

  const pageHref = (page: number) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query) as [keyof ShowroomQuery, unknown][]) {
      if (k === "page" || v === undefined || (k === "sort" && v === "recent")) continue;
      params.set(k === "numbers" ? "ids" : k, Array.isArray(v) ? v.join(",") : String(v));
    }
    if (page > 1) params.set("page", String(page));
    const s = params.toString();
    return s ? `${base}/showroom?${s}` : `${base}/showroom`;
  };

  return (
    <>
      {base ? (
        <h1 className="mx-auto max-w-6xl px-4 pt-2 text-[1.75rem] font-bold tracking-tight">{p.title}</h1>
      ) : (
      <section className="dark border-b border-[#303030] bg-black text-white">
        <div className="mx-auto max-w-6xl px-4 pt-14 pb-10">
          <p className="f-label flex items-center gap-3 text-white/60">
            <span className="h-px w-8 bg-white/40" aria-hidden />
            {settings.garageName}
          </p>
          <h1 className="f-display mt-4 text-3xl sm:text-5xl">{p.title}</h1>
          <p className="mt-4 max-w-xl text-[0.8125rem] leading-relaxed tracking-[0.03em] text-white/65">{p.subtitle}</p>
        </div>
      </section>
      )}

      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        {!favourites && (
          // PWA client app: the filters fold away on the phone (the cars come first).
          <FoldIf fold={!!base} label={p.search}>
          <form action={`${base}/showroom`} className="grid gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-6" role="search" aria-label={p.search}>
            <label className="bg-background p-2 lg:col-span-2">
              <span className="sr-only">{p.search}</span>
              <input name="q" defaultValue={query.q} placeholder={p.searchPlaceholder} className={control} maxLength={60} />
            </label>
            <label className="bg-background p-2">
              <span className="sr-only">{t.showroom.fields.make}</span>
              <select name="make" defaultValue={query.make ?? ""} className={control}>
                <option value="">{p.allMakes}</option>
                {makes.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <label className="bg-background p-2">
              <span className="sr-only">{t.showroom.fields.fuel}</span>
              <select name="fuel" defaultValue={query.fuel ?? ""} className={control}>
                <option value="">{p.anyFuel}</option>
                {FUELS.map((f) => (
                  <option key={f} value={f}>
                    {t.fuel[f]}
                  </option>
                ))}
              </select>
            </label>
            <label className="bg-background p-2">
              <span className="sr-only">{t.showroom.fields.gearbox}</span>
              <select name="gearbox" defaultValue={query.gearbox ?? ""} className={control}>
                <option value="">{p.anyGearbox}</option>
                {GEARBOXES.map((g) => (
                  <option key={g} value={g}>
                    {t.showroom.gearbox[g]}
                  </option>
                ))}
              </select>
            </label>
            <label className="bg-background p-2">
              <span className="sr-only">{p.sort}</span>
              <select name="sort" defaultValue={query.sort} className={control} aria-label={p.sort}>
                {SORTS.map((s) => (
                  <option key={s} value={s}>
                    {p.sorts[s]}
                  </option>
                ))}
              </select>
            </label>
            {(
              [
                ["priceMin", p.priceMin, query.priceMin],
                ["priceMax", p.priceMax, query.priceMax],
                ["yearMin", p.yearMin, query.yearMin],
                ["yearMax", p.yearMax, query.yearMax],
                ["kmMax", p.kmMax, query.kmMax],
              ] as const
            ).map(([name, label, value]) => (
              <label key={name} className="bg-background p-2">
                <span className="sr-only">{label}</span>
                <input name={name} type="number" min={0} inputMode="numeric" dir="ltr" placeholder={label} defaultValue={value ?? ""} className={control} />
              </label>
            ))}
            {/* Narrow cell (1024 px): the two buttons stack instead of spilling out of the form. */}
            <div className="flex flex-wrap gap-2 bg-background p-2">
              <button type="submit" className="f-label min-h-11 flex-1 bg-foreground px-4 text-background hover:bg-brand-500 hover:text-white">
                {p.apply}
              </button>
              <Link href={`${base}/showroom`} className="f-label grid min-h-11 flex-1 place-items-center border border-border px-3 text-muted-foreground hover:text-foreground">
                {p.reset}
              </Link>
            </div>
          </form>
          </FoldIf>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <p className="f-label text-muted-foreground" aria-live="polite">
            {fmt(p.results, { n: result.total })}
          </p>
          <div className="ms-auto">
            <FavoritesLink active={favourites} />
          </div>
        </div>

        {result.rows.length === 0 ? (
          <p className="border border-dashed border-border p-12 text-center text-sm text-muted-foreground">{favourites ? p.favNone : p.none}</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {result.rows.map((l) => (
              <ListingCard key={l.number} l={l} t={t} lang={lang} base={base} />
            ))}
          </div>
        )}

        {result.pages > 1 && (
          <nav className="flex items-center justify-center gap-2" aria-label={fmt(p.page, { page: query.page, pages: result.pages })}>
            <PageLink href={pageHref(query.page - 1)} disabled={query.page <= 1} label={p.prev} />
            <span className="f-label px-3 text-muted-foreground">{fmt(p.page, { page: query.page, pages: result.pages })}</span>
            <PageLink href={pageHref(query.page + 1)} disabled={query.page >= result.pages} label={p.next} />
          </nav>
        )}
      </div>
      <div className="h-10" />
    </>
  );
}

function PageLink({ href, disabled, label }: { href: string; disabled: boolean; label: string }) {
  if (disabled) return <span className="f-label inline-flex min-h-11 items-center border border-border px-4 text-muted-foreground opacity-50">{label}</span>;
  return (
    <Link href={href} className={cn("f-label inline-flex min-h-11 items-center border border-border px-4 hover:border-foreground")}>
      {label}
    </Link>
  );
}

function FoldIf({ fold, label, children }: { fold: boolean; label: string; children: React.ReactNode }) {
  if (!fold) return <>{children}</>;
  return (
    <details className="phone-card overflow-hidden">
      <summary className="flex min-h-12 cursor-pointer items-center px-5 text-sm font-semibold">{label}</summary>
      <div className="p-2 pt-0">{children}</div>
    </details>
  );
}
