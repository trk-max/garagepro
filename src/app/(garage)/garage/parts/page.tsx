import Link from "next/link";
import { ChevronRight, Package, Plus, ShoppingCart } from "lucide-react";
import { CreatePartForm } from "@/components/stock/create-part-form";
import { MovementsCard } from "@/components/stock/movements-card";
import { PartCard } from "@/components/stock/part-card";
import { PartsTable } from "@/components/stock/parts-table";
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
import { cn } from "@/lib/utils";
import { monthlyPurchases, partCards, stockOverview, type PartCard as Card } from "@/server/dashboard-v10-stock";
import { isLow, listParts, recentMovements } from "@/server/parts";
import { supplierOptions } from "@/server/purchasing";

type PageProps = { searchParams: Promise<{ q?: string; low?: string; view?: string; cursor?: string }> };

export default async function PartsPage({ searchParams }: PageProps) {
  const { q, low, view, cursor } = await searchParams;
  const staff = await requirePageAccess("viewStock");
  const canEdit = can(staff.role, "manageStock");
  const table = view === "table";
  const lowOnly = low === "1";
  // Cards: one page of partCards; "low only" (or the table view) uses the former list, which can filter.
  const [{ t, lang }, overview, purchases, cards, parts, movements, suppliers, lowParts] = await Promise.all([
    getI18n(),
    stockOverview(staff),
    can(staff.role, "viewSuppliers") ? monthlyPurchases(staff, 6) : null,
    !table && !lowOnly ? partCards({ q, take: 20, cursor: cursor ?? null }) : null,
    table || lowOnly ? listParts(q, lowOnly) : null,
    recentMovements(30),
    canEdit ? supplierOptions() : [],
    listParts(undefined, true),
  ]);
  const s = t.v10.pages.stock;
  const items: Card[] =
    cards?.items ??
    (parts ?? []).map((p) => ({ id: p.id, name: p.name, sku: p.sku, supplier: null, stockX100: p.stockX100, minStockX100: p.minStockX100, percentOfMin: percentOfMinimum(p.stockX100, p.minStockX100), isLow: isLow(p), unit: p.unit }));

  const href = (patch: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries({ q, low, view, ...patch })) if (v) params.set(k, v);
    const str = params.toString();
    return str ? `/garage/parts?${str}` : "/garage/parts";
  };
  const pill = (on: boolean) => cn("gp-pill-t flex h-10 items-center rounded-full px-4 text-sm font-medium", on ? "bg-gp-primary text-gp-primary-ink" : "hover:bg-gp-hover");

  return (
    <div className="mx-auto max-w-[1440px] px-3 pt-4 pb-6 sm:px-5 xl:ps-2 xl:pe-5">
      <PageHeader title={t.parts.title} subtitle={s.subtitle}>
        <LiveRefresh url="/api/staff/live?topic=stock" liveLabel={t.portal.live} reconnectingLabel={t.portal.reconnecting} />
        {can(staff.role, "requestPurchase") && (
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
          <StockValueCard t={t} lang={lang} overview={overview} purchases={purchases} />
          <StockAlertsCard t={t} lowCount={lowParts.length} canFollowUp={can(staff.role, "manageRepairFollowUp")} />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <nav aria-label={t.parts.title} className="flex rounded-full border border-gp-line bg-gp-card p-1 shadow-gp">
            <Link href={href({ view: undefined, cursor: undefined })} aria-current={!table ? "page" : undefined} className={pill(!table)}>
              {s.views.cards}
            </Link>
            <Link href={href({ view: "table", cursor: undefined })} aria-current={table ? "page" : undefined} className={pill(table)}>
              {s.views.table}
            </Link>
          </nav>
          <Link href={href({ low: lowOnly ? undefined : "1", cursor: undefined })} aria-pressed={lowOnly} className={cn(pill(lowOnly), "border border-gp-line bg-gp-card")}>
            {t.parts.lowOnly}
          </Link>
          <div className="ms-auto w-full sm:w-80 [&_form]:max-w-none [&_input]:h-11 [&_input]:bg-gp-card [&_input]:ps-9">
            <SearchForm placeholder={t.parts.searchPlaceholder} defaultValue={q} hidden={{ low, view }} />
          </div>
        </div>

        {table ? (
          (parts ?? []).length === 0 ? (
            <EmptyState icon={Package} title={t.parts.empty} />
          ) : (
            <PartsTable t={t} lang={lang} parts={parts ?? []} canEdit={canEdit} suppliers={suppliers} />
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
