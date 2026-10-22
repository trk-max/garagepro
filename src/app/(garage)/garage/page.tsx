import Link from "next/link";
import type { ReactNode } from "react";
import { BellRing, CalendarClock, CarFront, CheckCircle2, ClipboardCheck, ShoppingCart, Truck, UserCheck, Wallet } from "lucide-react";
import { DashboardCustomizer } from "@/components/overview/dashboard-customizer";
import { AgendaDashCard } from "@/components/agenda/agenda-ui";
import { ActivityCard, InvoicesCard, StatusCard, WatchCard, type WatchTile } from "@/components/overview/more-cards";
import { AlertsCard, AppointmentsCard, LowStockCard } from "@/components/overview/lists";
import { GoalCard } from "@/components/overview/goal-card";
import { HeroCard, MechanicsCard } from "@/components/overview/hero-card";
import { KpiGrid } from "@/components/overview/kpi-grid";
import { RecentOrders } from "@/components/overview/recent-orders";
import { DailyBars, StepLines } from "@/components/garage/week-charts";
import { LiveRefresh } from "@/components/live-refresh";
import { BarChartCard } from "@/components/ui/redesign/bar-chart-card";
import { PageHeader } from "@/components/ui/redesign/page-header";
import { Surface, SurfaceHeader } from "@/components/ui/redesign/surface";
import { allowedBlocks, blockSpans, mergeLayout, type BlockId } from "@/lib/dashboard-layout";
import { fmt, formatMoney } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { requireStaff } from "@/lib/session";
import { countDueSoon, listAgenda, partsToOrder } from "@/server/agenda";
import { listAlerts } from "@/server/alerts";
import { getDashboard, presentNow, recentActivity, recentInvoices, todayAppointments, weekOverview } from "@/server/dashboard";
import { getDashboardLayout } from "@/server/dashboard-layout";
import { kpis as getKpis, mechanicsNow, monthlyTarget, revenueByMonth, todayRevenue } from "@/server/dashboard-v10";
import { overdueSummary } from "@/server/invoices";
import { recentOrderRows } from "@/server/overview-orders";
import { purchasingSummary } from "@/server/purchasing";
import { getSettings } from "@/server/settings";
import { ACTIVE_STATUSES } from "@/server/workflow";

/** "Good morning / afternoon / evening" by the hour in the garage's time zone. */
function dayPart(now: Date, timeZone: string): "morning" | "afternoon" | "evening" {
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hourCycle: "h23" }).format(now));
  return h < 12 ? "morning" : h < 18 ? "afternoon" : "evening";
}

// Literal class names (Tailwind only generates classes it can read in the source).
const MD_SPAN: Record<number, string> = { 1: "md:col-span-1", 2: "md:col-span-2" };
const XL_SPAN: Record<number, string> = {
  1: "xl:col-span-1", 2: "xl:col-span-2", 3: "xl:col-span-3", 4: "xl:col-span-4", 5: "xl:col-span-5", 6: "xl:col-span-6",
  7: "xl:col-span-7", 8: "xl:col-span-8", 9: "xl:col-span-9", 10: "xl:col-span-10", 11: "xl:col-span-11", 12: "xl:col-span-12",
};

/**
 * Overview. V10.3: made of blocks with stable ids (src/lib/dashboard-layout.ts); each user orders /
 * hides them ("Personnaliser"). A block is rendered — and its data loaded — only when the user's
 * effective permissions allow it AND it is visible in their layout.
 */
export default async function OverviewPage() {
  const staff = await requireStaff();
  const finance = can(staff, "viewFinance");
  const wo = can(staff, "viewWorkOrders");
  const now = new Date();
  const allowed = allowedBlocks(staff);
  const layout = mergeLayout(await getDashboardLayout(staff.id), allowed);
  const visible = layout.filter((e) => e.visible).map((e) => e.id);
  const on = (id: BlockId) => visible.includes(id);
  const year = Number(new Intl.DateTimeFormat("en-CA", { timeZone: (await getSettings()).timezone, year: "numeric" }).format(now));
  // Every figure keeps the former rule: money only for viewFinance, purchases for requestPurchase, etc.
  const [{ t, lang }, settings, d, kpi, today, months, goal, mechanics, orders, overdue, purchasing, appts, presence, alerts, week, invoices, activity, agenda] = await Promise.all([
    getI18n(),
    getSettings(),
    getDashboard(),
    on("kpis") || on("todayRevenue") ? getKpis(staff, now) : null,
    finance && on("todayRevenue") ? todayRevenue(staff, now) : null,
    on("revenueChart") ? revenueByMonth(staff, year) : null,
    on("monthlyTarget") ? monthlyTarget(staff, now) : null,
    on("mechanics") ? mechanicsNow(now, 50) : null,
    on("recentOrders") ? recentOrderRows({ finance }) : null,
    finance && (on("watchTiles") || on("recentInvoices")) ? overdueSummary() : null,
    can(staff, "requestPurchase") && on("watchTiles") ? purchasingSummary() : null,
    on("appointments") ? todayAppointments() : null,
    can(staff, "manageTeam") && on("watchTiles") ? presentNow() : null,
    on("alerts") ? listAlerts(undefined, staff) : null,
    on("weekCharts") ? weekOverview({ finance }) : null,
    on("recentInvoices") ? recentInvoices() : null,
    on("activity") ? recentActivity({ finance }) : null,
    // V12: agenda block — due within 30 days; parts to order only for those who can request a purchase.
    on("agenda")
      ? Promise.all([countDueSoon(now), listAgenda({ to: new Date(now.getTime() + 30 * 86_400_000) }, 6), can(staff, "requestPurchase") || can(staff, "manageAgenda") ? partsToOrder(now) : null])
      : null,
  ]);
  const o = t.v10.overview;
  const db = t.v7.dash;
  const firstName = staff.name.trim().split(/\s+/)[0] ?? staff.name;
  const locale = lang === "en" ? "en-GB" : lang === "ar" ? "ar-TN" : "fr-FR";

  const watch: WatchTile[] = [];
  if (wo) {
    watch.push(
      { label: t.dashboard.inShop, value: String(d.inShop), icon: CarFront, href: "/garage/work-orders" },
      { label: t.dashboard.ready, value: String(d.ready), icon: CheckCircle2, href: "/garage/work-orders?status=READY", tone: d.ready ? "success" : undefined },
      { label: t.dashboard.dueToday, value: String(d.dueToday), icon: CalendarClock, href: "/garage/work-orders" },
    );
  }
  if (finance) {
    watch.push({ label: t.dashboard.unpaid, value: formatMoney(d.unpaidTotal, lang), icon: Wallet, href: "/garage/invoices?status=ISSUED", tone: d.unpaidTotal ? "accent" : undefined });
    if (overdue) watch.push({ label: t.dashboard.overdue, value: String(overdue.count), icon: BellRing, href: "/garage/invoices?status=OVERDUE", tone: overdue.count ? "danger" : undefined });
  }
  if (presence) {
    watch.push({ label: db.present, value: String(presence.working), note: presence.onBreak ? `+${presence.onBreak} ${db.onBreak}` : undefined, icon: UserCheck, href: "/garage/pointage" });
  }
  if (purchasing) {
    watch.push(
      { label: t.dashboard.pendingApprovals, value: String(purchasing.pendingApprovals), icon: ClipboardCheck, href: "/garage/purchase-orders?status=PENDING_APPROVAL", tone: purchasing.pendingApprovals ? "accent" : undefined },
      { label: t.dashboard.openPurchases, value: String(purchasing.openOrders), icon: Truck, href: "/garage/purchase-orders?status=OPEN" },
    );
    if (can(staff, "paySupplier")) watch.push({ label: t.dashboard.supplierDue, value: formatMoney(purchasing.supplierDue, lang), icon: Wallet, href: "/garage/supplier-invoices?filter=unpaid" });
  }

  // The mechanics panel sits inside the first card when it directly follows it (the V10 design);
  // moved elsewhere, it becomes a card of its own.
  const heroIndex = visible.indexOf("todayRevenue");
  const embedMechanics = heroIndex >= 0 && visible[heroIndex + 1] === "mechanics";
  const showPresence = can(staff, "manageTeam");

  const render: Record<BlockId, () => ReactNode> = {
    todayRevenue: () =>
      kpi && (
        <HeroCard t={t} lang={lang} today={today} inShop={kpi.openOrders.current} dueToday={d.dueToday} canNewOrder={wo} canInvoice={can(staff, "createInvoice")} mechanics={embedMechanics ? mechanics : null} showPresence={showPresence} />
      ),
    mechanics: () => !embedMechanics && mechanics && <MechanicsCard t={t} mechanics={mechanics} showPresence={showPresence} />,
    kpis: () => kpi && <KpiGrid t={t} lang={lang} kpis={kpi} showOrders={wo} showStockLink={can(staff, "viewStock")} outOfStock={d.lowStock.filter((p) => p.stockX100 <= 0).length} dueToday={d.dueToday} />,
    revenueChart: () =>
      months && (
        <BarChartCard
          title={o.revenueChart}
          hint={fmt(o.revenueHint, { year })}
          lang={lang}
          legend={{ base: o.paid, top: o.pending }}
          tableLabel={o.showTable}
          firstColumn={o.month}
          points={months.map((m) => {
            const date = new Date(`${m.month}-15T12:00:00Z`);
            return { label: new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" }).format(date), full: new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(date), base: m.paid, top: m.pending };
          })}
        />
      ),
    monthlyTarget: () => goal && <GoalCard t={t} lang={lang} goal={goal} canSetGoal={can(staff, "manageSettings")} />,
    recentOrders: () => orders && <RecentOrders t={t} lang={lang} rows={orders} finance={finance} />,
    alerts: () => alerts && <AlertsCard t={t} alerts={alerts.open} />,
    workshopStatus: () => <StatusCard t={t} byStatus={d.byStatus} statuses={ACTIVE_STATUSES} />,
    appointments: () => appts && <AppointmentsCard t={t} lang={lang} appts={appts} />,
    lowStock: () => <LowStockCard t={t} lang={lang} parts={d.lowStock} canOrder={can(staff, "requestPurchase")} />,
    watchTiles: () => watch.length > 0 && <WatchCard title={o.watch} tiles={watch} />,
    weekCharts: () =>
      week && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {week.collected && (
            <Surface aria-labelledby="ov-collected">
              <SurfaceHeader id="ov-collected" title={db.collectedTitle} hint={db.collectedHint} />
              <DailyBars days={week.days} values={week.collected.current} lang={lang} format="money" />
            </Surface>
          )}
          <Surface className={week.collected ? undefined : "md:col-span-2"} aria-labelledby="ov-flow">
            <SurfaceHeader id="ov-flow" title={db.flowTitle} hint={db.flowHint} />
            <StepLines days={week.days} a={week.ordersIn.current} b={week.ordersOut.current} labels={[db.entered, db.delivered]} lang={lang} />
          </Surface>
        </div>
      ),
    recentInvoices: () => invoices && <InvoicesCard t={t} lang={lang} invoices={invoices} overdue={overdue?.count ?? 0} unpaid={d.unpaidTotal} />,
    activity: () => activity && <ActivityCard t={t} lang={lang} events={activity} />,
    agenda: () => agenda && <AgendaDashCard t={t} lang={lang} count={agenda[0]} rows={agenda[1]} parts={agenda[2]} canOrder={can(staff, "requestPurchase")} />,
  };

  const blocks = visible.map((id) => ({ id, node: render[id]() })).filter((b): b is { id: BlockId; node: Exclude<ReactNode, false | null | undefined | 0 | ""> } => !!b.node);
  const spans = blockSpans(blocks.map((b) => b.id));

  return (
    <div className="mx-auto max-w-[1440px] px-3 pt-4 pb-6 sm:px-5 xl:ps-2 xl:pe-5">
      <PageHeader title={fmt(o.greeting[dayPart(now, settings.timezone)], { name: firstName })} subtitle={o.subtitle}>
        <LiveRefresh url="/api/staff/live?topic=dashboard" liveLabel={t.portal.live} reconnectingLabel={t.portal.reconnecting} />
        <DashboardCustomizer layout={layout} defaults={allowed} />
        {can(staff, "requestPurchase") && (
          <Link href="/garage/purchase-orders/new" className="gp-lift inline-flex h-11 items-center gap-2 rounded-full bg-gp-primary px-5 text-sm font-medium text-gp-primary-ink">
            <ShoppingCart className="size-4" aria-hidden /> {t.purchase.new}
          </Link>
        )}
      </PageHeader>

      {blocks.length === 0 ? (
        <p className="rounded-[24px] border border-dashed border-gp-line p-8 text-center text-sm text-gp-muted">{t.v103.dash.empty}</p>
      ) : (
        <div className="gp-stagger grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-12">
          {blocks.map(({ id, node }) => {
            const s = spans.get(id)!;
            return (
              <div key={id} data-block={id} className={`flex min-w-0 flex-col *:flex-1 ${MD_SPAN[s.md]} ${XL_SPAN[s.xl]}`}>
                {node}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
