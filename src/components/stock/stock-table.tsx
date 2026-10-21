import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { AdjustStockButton, EditPartButton } from "@/components/stock/part-edit-form";
import { Table, Td, Th } from "@/components/ui/field";
import { Chip, type ChipTone } from "@/components/ui/redesign/chip";
import { PillLink } from "@/components/ui/redesign/surface";
import type { Dictionary } from "@/lib/i18n/fr";
import { fmt, formatMoney, formatQty, type Lang } from "@/lib/format";
import { rowValue, stockState, type SortDir, type StockSort, type StockState } from "@/lib/stock-list";
import { cn } from "@/lib/utils";
import type { StockList } from "@/server/stock-list";

const TONE: Record<StockState, ChipTone> = { ok: "success", low: "accent", out: "danger" };

type Props = {
  t: Dictionary;
  lang: Lang;
  list: StockList;
  canEdit: boolean;
  suppliers: { id: string; name: string }[];
  sort: StockSort;
  dir: SortDir;
  /** Link to this view with the given sort (or page). */
  sortHref: (sort: StockSort, dir: SortDir) => string;
  pageHref: (page: number) => string;
};

/**
 * The full stock list (« Tableau »): every part of the search, 50 per page with the count,
 * sortable by name / quantity / value, state chip, totals over ALL the filtered parts.
 * Money columns only with viewFinance (list.showMoney); Modifier / Ajuster only with manageStock.
 * On phones the rows become stacked cards (ResponsiveTable).
 */
export function StockTable({ t, lang, list, canEdit, suppliers, sort, dir, sortHref, pageHref }: Props) {
  const s = t.stockList;
  const money = list.showMoney;

  const sortable = (key: StockSort, label: string, end = false) => {
    const on = sort === key;
    const next: SortDir = on ? (dir === "asc" ? "desc" : "asc") : key === "name" ? "asc" : "desc";
    const Icon = !on ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
    return (
      <Th className={cn(end && "text-end")} aria-sort={on ? (dir === "asc" ? "ascending" : "descending") : "none"}>
        <Link href={sortHref(key, next)} className={cn("inline-flex items-center gap-1 hover:underline", on && "text-gp-ink")} title={fmt(s.sortBy, { col: label })}>
          {label}
          <Icon className={cn("size-3.5", !on && "opacity-50")} aria-hidden />
        </Link>
      </Th>
    );
  };

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-sm font-semibold">{fmt(s.count, { n: list.totals.parts })}</p>
        <p className="text-xs text-gp-muted">{fmt(s.summary, { low: list.totals.low, out: list.totals.out })}</p>
      </div>
      <Table>
        <thead>
          <tr>
            <Th>{s.cols.sku}</Th>
            {sortable("name", s.cols.name)}
            <Th>{s.cols.brandSupplier}</Th>
            {sortable("qty", s.cols.qty, true)}
            <Th className="text-end">{s.cols.min}</Th>
            <Th>{s.cols.state}</Th>
            {money && <Th className="text-end">{s.cols.cost}</Th>}
            {money && sortable("value", s.cols.value, true)}
            {money && <Th className="text-end">{s.cols.sale}</Th>}
            {canEdit && <Th />}
          </tr>
        </thead>
        <tbody>
          {list.items.map((p) => {
            const state = stockState(p);
            return (
              <tr key={p.id}>
                <Td className="font-mono text-xs break-all" dir="ltr">{p.sku}</Td>
                <Td className="font-medium break-words">{p.name}</Td>
                <Td className="text-gp-muted">{[p.brand, p.supplier].filter(Boolean).join(" · ") || "—"}</Td>
                <Td className="text-end tabular-nums">
                  <span className={cn("font-semibold", state === "out" && "text-gp-danger-ink")}>{formatQty(p.stockX100, lang)}</span> <span className="text-xs text-gp-muted">{p.unit}</span>
                  {p.reservedX100 > 0 && <div className="text-xs text-gp-muted">{fmt(s.reserved, { x: formatQty(p.reservedX100, lang) })}</div>}
                </Td>
                <Td className="text-end tabular-nums text-gp-muted">{formatQty(p.minStockX100, lang)}</Td>
                <Td>
                  <Chip tone={TONE[state]}>{s.states[state]}</Chip>
                </Td>
                {money && <Td className="text-end tabular-nums text-gp-muted" dir="ltr">{formatMoney(p.costPrice, lang)}</Td>}
                {money && <Td className="text-end font-medium tabular-nums" dir="ltr">{formatMoney(rowValue(p), lang)}</Td>}
                {money && <Td className="text-end tabular-nums" dir="ltr">{formatMoney(p.salePrice, lang)}</Td>}
                {canEdit && (
                  <Td>
                    <div className="flex flex-wrap justify-end gap-2 sm:flex-nowrap">
                      <EditPartButton t={t} part={p} className="h-9 px-3.5" />
                      <AdjustStockButton t={t} part={p} suppliers={suppliers} className="h-9 px-3.5" />
                    </div>
                  </Td>
                )}
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="bg-gp-panel font-semibold">
            <Td colSpan={3}>
              {s.total} · {fmt(s.count, { n: list.totals.parts })}
            </Td>
            <Td className="text-end tabular-nums">{fmt(s.totalQty, { x: formatQty(list.totals.quantityX100, lang) })}</Td>
            <Td colSpan={2} />
            {money && <Td />}
            {money && (
              <Td className="text-end tabular-nums">
                <span className="font-normal text-gp-muted sm:hidden">{s.cols.value} </span>
                <span dir="ltr">{formatMoney(list.totals.value, lang)}</span>
              </Td>
            )}
            {money && <Td />}
            {canEdit && <Td />}
          </tr>
        </tfoot>
      </Table>
      <PageNav t={t} page={list.page} pages={list.pages} pageHref={pageHref} />
    </section>
  );
}

/** Previous / « Page 2 sur 5 » / Next (shown only when there is more than one page). */
export function PageNav({ t, page, pages, pageHref }: { t: Dictionary; page: number; pages: number; pageHref: (page: number) => string }) {
  const s = t.stockList;
  if (pages <= 1) return null;
  return (
    <nav className="flex flex-wrap items-center justify-center gap-2" aria-label={t.parts.title}>
      {page > 1 && (
        <PillLink href={pageHref(page - 1)} variant="outline" icon={ChevronLeft}>
          {s.prev}
        </PillLink>
      )}
      <span className="px-2 text-sm text-gp-muted" aria-current="page">
        {fmt(s.page, { p: page, n: pages })}
      </span>
      {page < pages && (
        <PillLink href={pageHref(page + 1)} icon={ChevronRight}>
          {s.next}
        </PillLink>
      )}
    </nav>
  );
}
