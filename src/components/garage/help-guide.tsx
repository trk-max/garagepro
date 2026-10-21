"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import { ArrowRight, Search, UsersRound } from "lucide-react";
import { Card, PageHeader } from "@/components/ui/field";
import { fmt } from "@/lib/format";
import type { helpFr, HelpSection } from "@/lib/i18n/help-fr";

/** Lower case, without accents or Arabic diacritics, so "controle" finds "Contrôle". */
export const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ًͯ-ٰٟ]/g, "")
    .toLowerCase();

const sectionText = (s: HelpSection) => fold([s.title, s.roles, ...s.body, ...(s.limits ?? []), ...s.links.map((l) => l.label)].join(" "));

/** Searchable help guide: table of contents, one card per module, then the FAQ. */
export function HelpGuide({ help }: { help: typeof helpFr }) {
  const [query, setQuery] = useState("");
  const q = fold(useDeferredValue(query).trim());
  const index = useMemo(() => help.sections.map((s) => ({ s, text: sectionText(s) })), [help]);
  const words = q.split(/\s+/).filter(Boolean);
  const sections = words.length ? index.filter((x) => words.every((w) => x.text.includes(w))).map((x) => x.s) : help.sections;
  const faq = words.length ? help.faq.filter((f) => words.every((w) => fold(`${f.q} ${f.a}`).includes(w))) : help.faq;
  const count = sections.length + faq.length;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <PageHeader title={help.title} subtitle={help.intro} />
      {/* Sticks just under the top bar (2 rows below 1280 px, 1 row above). */}
      <div className="sticky top-[8.75rem] z-10 -mx-1 rounded-full bg-gp-canvas/85 px-1 py-1 backdrop-blur-md sm:top-36 xl:top-20">
        <label className="flex h-12 items-center gap-2 rounded-full border border-gp-line bg-gp-card px-4 shadow-gp focus-within:ring-2 focus-within:ring-gp-accent">
          <Search className="size-4 shrink-0 text-gp-muted" aria-hidden />
          <span className="sr-only">{help.searchLabel}</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={help.searchPlaceholder}
            className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
        </label>
      </div>
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {words.length ? (count ? fmt(help.resultCount, { n: count }) : help.noResult) : null}
      </p>

      {!words.length && (
        <nav aria-label={help.contents}>
          <h2 className="mb-2 text-sm font-semibold text-gp-muted">{help.contents}</h2>
          <ul className="flex flex-wrap gap-1.5">
            {help.sections.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="inline-block rounded-full border border-gp-line bg-gp-card px-3 py-1.5 text-xs font-medium hover:bg-gp-hover">
                  {s.title}
                </a>
              </li>
            ))}
            <li>
              <a href="#faq" className="inline-block rounded-full border border-gp-line bg-gp-card px-3 py-1.5 text-xs font-medium hover:bg-gp-hover">
                {help.faqTitle}
              </a>
            </li>
          </ul>
        </nav>
      )}

      <div className="space-y-4">
        {sections.map((s) => (
          <Card key={s.id} id={s.id} className="scroll-mt-56 space-y-3 xl:scroll-mt-40">
            <h2 className="text-lg font-semibold">{s.title}</h2>
            <p className="flex items-start gap-2 text-sm text-muted-foreground">
              <UsersRound className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                <span className="block text-xs font-medium text-foreground">{help.rolesLabel}</span>
                {s.roles}
              </span>
            </p>
            <ul className="list-disc space-y-1.5 ps-5 text-sm leading-relaxed">
              {s.body.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
            {s.limits && s.limits.length > 0 && (
              <div className="rounded-md border border-dashed p-3 text-sm">
                <p className="mb-1 font-medium">{help.limitsLabel}</p>
                <ul className="list-disc space-y-1 ps-5 text-muted-foreground">
                  {s.limits.map((l, i) => (
                    <li key={i}>{l}</li>
                  ))}
                </ul>
              </div>
            )}
            {s.links.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted-foreground">{help.linksLabel}</span>
                {s.links.map((l) => (
                  <Link key={l.href} href={l.href} className="inline-flex items-center gap-1 rounded-full bg-gp-primary px-3 py-1 text-xs font-medium text-gp-primary-ink hover:opacity-90">
                    {l.label} <ArrowRight className="size-3 rtl:rotate-180" aria-hidden />
                  </Link>
                ))}
              </div>
            )}
          </Card>
        ))}
      </div>

      {faq.length > 0 && (
        <section id="faq" className="scroll-mt-56 space-y-3 xl:scroll-mt-40" aria-label={help.faqTitle}>
          <h2 className="text-lg font-semibold">{help.faqTitle}</h2>
          {faq.map((f, i) => (
            <details key={i} className="group rounded-lg border bg-card p-4" open={words.length > 0}>
              <summary className="cursor-pointer text-sm font-medium">{f.q}</summary>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
            </details>
          ))}
        </section>
      )}
    </div>
  );
}
