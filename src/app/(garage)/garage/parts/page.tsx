import Link from "next/link";
import { ChevronRight, Package, Plus, ShoppingCart } from "lucide-react";
import { CreatePartForm } from "@/components/stock/create-part-form";
import { MovementsCard } from "@/components/stock/movements-card";
import { PartCard } from "@/components/stock/part-card";
import { PageNav, StockTable } from "@/components/stock/stock-table";
import { StockAlertsCard } from "@/components/stock/stock-alerts-card";
import { StockValueCard } from "@/components/stock/stock-value-card";
import { SearchForm } from "@/components/garage/search-form";
import { LiveRefresh } from "@/components/live-refresh";
import { DialogButton } from "@/components/ui/redesign/dialog";
import { PageHeader } from "@/components/ui/redesign/page-header";
import { EmptyState, PillLink } from "@/components/ui/redesign/surface";
import { percentOfMinimum } from "@/lib/dashboard-v10";
import { getI18n } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { requirePageAccess } from "@/lib/session";
import { parseSort, SORT_PARAM, type SortDir, type StockSort } from "@/lib/stock-list";
import { cn } from "@/lib/utils";
import { monthlyPurchases, partCards, stockCounts, stockOverview, type PartCard as Card } from "@/server/dashboard-v10-stock";
import { lowStockParts, recentMovements } from "@/server/parts";
import { stockList } from "@/server/stock-list";
import { supplierOptions } from "@/server/purchasing";

type PageProps = { searchParams: Promise<{ q?: string; low?: string; vue?: string; view?: string; cursor?: string; tri?: string; ordre?: string; page?: string }> };

export default async function PartsPage({ searchParams }: PageProps) {
  const { q, low, vue: vueParam, view, cursor, tri, ordre, page } = await searchParams;
  const staff = await requirePageAccess("viewStock");
  const canEdit = can(staff, "manageStock");
  // V10.5: « Tableau » (the full list) is the default; « Cartes » on request (?vue=cartes). Old ?view=table links still work.
  const table = vueParam !== "cartes" || view === "table";
  const vue = !table ? "cartes" : vueParam === "tableau" ? "tableau" : undefined;
  const lowOnly = low === "1";
  const { sort, dir } = parseSort(tri, ordre, can(staff, "viewFinance"));
  const pageNo = Number(page) || 1;
  // Cards: one page of partCards; "low only" and the table view use the full list (stockList), which filters, sorts and pages.
  const [{ t, lang }, overview, counts, purchases, cards, parts, movements, suppliers, lowParts] = await Promise.all([
    getI18n(),
    // Stock value is money: finance roles only (the others get the counts).
    can(staff, "viewFinance") ? stockOverview(staff) : null,
    stockCounts(staff),
    can(staff, "viewSuppliers") ? monthlyPurchases(staff, 6) : null,
    !table && !lowOnly ? partCards({ q, take: 20, cursor: cursor ?? null }) : null,
    table || lowOnly ? stockList(staff, { q, lowOnly, sort, dir, page: pageNo }) : null,
    recentMovements(30),
    canEdit ? supplierOptions() : [],
    lowStockParts(),
  ]);
  const s = t.v10.pages.stock;
  const items: Card[] =
    cards?.items ??
    (parts?.items ?? []).map((p) => ({ ...p, percentOfMin: percentOfMinimum(p.stockX100, p.minStockX100), isLow: p.stockX100 <= p.minStockX100 }));

  // Links keep the search, the filter, the view and the sort; the page / cursor only when given.
  const current = { q, low, vue, tri: tri && SORT_PARAM[sort] === tri ? tri : undefined, ordre: ordre === "asc" || ordre === "desc" ? ordre : undefined };
  const href = (patch: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...current, ...patch })) if (v) params.set(k, v);
    const str = params.toString();
    return str ? `/garage/parts?${str}` : "/garage/parts";
  };
  const pill = (on: boolean) => cn("gp-pill-t flex h-10 items-center rounded-full px-4 text-sm font-medium", on ? "bg-gp-primary text-gp-primary-ink" : "hover:bg-gp-hover");

  return (
    <div className="mx-auto max-w-[1440px] px-3 pt-4 pb-6 sm:px-5 xl:ps-2 xl:pe-5">
      <PageHeader title={t.parts.title} subtitle={s.subtitle}>
        <LiveRefresh url="/api/staff/live?topic=stock" liveLabel={t.portal.live} reconnectingLabel={t.portal.reconnecting} />
        {can(staff, "requestPurchase") && (
          <PillLink href="/garage/purchase-orders/new?prefill=low" variant="outline" icon={ShoppingCart}>
            {t.purchase.new}
          </PillLink>
        )}
        {canEdit && (
          <DialogButton id="new-part" label={t.parts.new} title={t.parts.new} closeLabel={t.v10.shell.close} icon={<Plus className="size-4" aria-hidden />}>
            <CreatePartForm t={t} />
          </DialogButton>
        )}
      </PageHeader>

      <div className="gp-stagger space-y-5">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <StockValueCard t={t} lang={lang} overview={overview} counts={counts} purchases={purchases} />
          <StockAlertsCard t={t} lowCount={lowParts.length} canFollowUp={can(staff, "manageRepairFollowUp")} />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <nav aria-label={t.parts.title} className="flex rounded-full border border-gp-line bg-gp-card p-1 shadow-gp">
            <Link href={href({ vue: "tableau" })} aria-current={table ? "page" : undefined} className={pill(table)}>
              {s.views.table}
            </Link>
            <Link href={href({ vue: "cartes" })} aria-current={!table ? "page" : undefined} className={pill(!table)}>
              {s.views.cards}
            </Link>
          </nav>
          <Link href={href({ low: lowOnly ? undefined : "1" })} aria-pressed={lowOnly} className={cn(pill(lowOnly), "border border-gp-line bg-gp-card")}>
            {t.parts.lowOnly}
          </Link>
          <div className="ms-auto w-full sm:w-80 [&_form]:max-w-none [&_input]:h-11 [&_input]:bg-gp-card [&_input]:ps-9">
            <SearchForm placeholder={t.parts.searchPlaceholder} defaultValue={q} hidden={{ low, vue, tri: current.tri, ordre: current.ordre }} />
          </div>
        </div>

        {table ? (
          !parts || parts.totals.parts === 0 ? (
            <EmptyState icon={Package} title={t.parts.empty} />
          ) : (
            <StockTable
              t={t}
              lang={lang}
              list={parts}
              canEdit={canEdit}
              suppliers={suppliers}
              sort={sort}
              dir={dir}
              sortHref={(k: StockSort, d: SortDir) => href({ tri: SORT_PARAM[k], ordre: d })}
              pageHref={(n: number) => href({ page: n > 1 ? String(n) : undefined })}
            />
          )
        ) : items.length === 0 ? (
          <EmptyState icon={Package} title={t.parts.empty} />
        ) : (
          <ul className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {items.map((p) => (
              <PartCard key={p.id} p={p} t={t} lang={lang} canEdit={canEdit} suppliers={suppliers} />
            ))}
          </ul>
        )}

        {!table && parts && <PageNav t={t} page={parts.page} pages={parts.pages} pageHref={(n: number) => href({ page: n > 1 ? String(n) : undefined })} />}

        {cards && (cursor || cards.nextCursor) && (
          <nav className="flex justify-center gap-2" aria-label={t.parts.title}>
            {cursor && <PillLink href={href({ cursor: undefined })} variant="outline">{s.first}</PillLink>}
            {cards.nextCursor && <PillLink href={href({ cursor: cards.nextCursor })} icon={ChevronRight}>{s.next}</PillLink>}
          </nav>
        )}

        <MovementsCard t={t} lang={lang} movements={movements} canEdit={canEdit} />
      </div>
    </div>
  );
}
