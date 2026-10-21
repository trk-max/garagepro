import Link from "next/link";
import { BellRing, CalendarClock, CarFront, CheckCircle2, ClipboardCheck, ShoppingCart, Truck, UserCheck, Wallet } from "lucide-react";
import { ActivityCard, InvoicesCard, StatusCard, WatchCard, type WatchTile } from "@/components/overview/more-cards";
import { AlertsCard, AppointmentsCard, LowStockCard } from "@/components/overview/lists";
import { GoalCard } from "@/components/overview/goal-card";
import { HeroCard } from "@/components/overview/hero-card";
import { KpiGrid } from "@/components/overview/kpi-grid";
import { RecentOrders } from "@/components/overview/recent-orders";
import { DailyBars, StepLines } from "@/components/garage/week-charts";
import { LiveRefresh } from "@/components/live-refresh";
import { BarChartCard } from "@/components/ui/redesign/bar-chart-card";
import { PageHeader } from "@/components/ui/redesign/page-header";
import { Surface, SurfaceHeader } from "@/components/ui/redesign/surface";
import { fmt, formatMoney } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { requireStaff } from "@/lib/session";
import { listAlerts } from "@/server/alerts";
import { getDashboard, presentNow, recentActivity, recentInvoices, todayAppointments, weekOverview } from "@/server/dashboard";
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

export default async function OverviewPage() {
  const staff = await requireStaff();
  const role = staff.role;
  const finance = can(role, "viewFinance");
  const wo = can(role, "viewWorkOrders");
  const now = new Date();
  const year = Number(new Intl.DateTimeFormat("en-CA", { timeZone: (await getSettings()).timezone, year: "numeric" }).format(now));
  // Every figure keeps the former rule: money only for viewFinance, purchases for requestPurchase, etc.
  const [{ t, lang }, settings, d, kpi, today, months, goal, mechanics, orders, overdue, purchasing, appts, presence, alerts, week, invoices, activity] = await Promise.all([
    getI18n(),
    getSettings(),
    getDashboard(),
    getKpis(staff, now),
    finance ? todayRevenue(staff, now) : null,
    finance ? revenueByMonth(staff, year) : null,
    finance ? monthlyTarget(staff, now) : null,
    wo ? mechanicsNow(now, 50) : null,
    wo ? recentOrderRows({ finance }) : null,
    finance ? overdueSummary() : null,
    can(role, "requestPurchase") ? purchasingSummary() : null,
    can(role, "viewAppointments") ? todayAppointments() : null,
    can(role, "manageTeam") ? presentNow() : null,
    can(role, "manageRepairFollowUp") ? listAlerts(undefined, role) : null,
    wo ? weekOverview({ finance }) : null,
    finance ? recentInvoices() : null,
    wo ? recentActivity({ finance }) : null,
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
    watch.push({ label: db.present, value: presence.onBreak ? `${presence.working} (+${presence.onBreak} ${db.onBreak})` : String(presence.working), icon: UserCheck, href: "/garage/pointage" });
  }
  if (purchasing) {
    watch.push(
      { label: t.dashboard.pendingApprovals, value: String(purchasing.pendingApprovals), icon: ClipboardCheck, href: "/garage/purchase-orders?status=PENDING_APPROVAL", tone: purchasing.pendingApprovals ? "accent" : undefined },
      { label: t.dashboard.openPurchases, value: String(purchasing.openOrders), icon: Truck, href: "/garage/purchase-orders?status=OPEN" },
    );
    if (role === "ADMIN") watch.push({ label: t.dashboard.supplierDue, value: formatMoney(purchasing.supplierDue, lang), icon: Wallet, href: "/garage/supplier-invoices?filter=unpaid" });
  }
  const showHero = finance || wo;

  return (
    <div className="mx-auto max-w-[1440px] px-3 pt-4 pb-6 sm:px-5 xl:ps-2 xl:pe-5">
      <PageHeader title={fmt(o.greeting[dayPart(now, settings.timezone)], { name: firstName })} subtitle={o.subtitle}>
        <LiveRefresh url="/api/staff/live?topic=dashboard" liveLabel={t.portal.live} reconnectingLabel={t.portal.reconnecting} />
        {can(role, "requestPurchase") && (
          <Link href="/garage/purchase-orders/new" className="gp-lift inline-flex h-11 items-center gap-2 rounded-full bg-gp-primary px-5 text-sm font-medium text-gp-primary-ink">
            <ShoppingCart className="size-4" aria-hidden /> {t.purchase.new}
          </Link>
        )}
      </PageHeader>

      <div className="gp-stagger grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-[1fr_1.2fr_1.1fr]">
        {showHero && (
          <HeroCard t={t} lang={lang} today={today} inShop={kpi.openOrders.current} dueToday={d.dueToday} canNewOrder={wo} canInvoice={can(role, "createInvoice")} mechanics={mechanics} showPresence={can(role, "manageTeam")} />
        )}
        <KpiGrid t={t} lang={lang} kpis={kpi} showOrders={wo} showStockLink={can(role, "viewStock")} outOfStock={d.lowStock.filter((p) => p.stockX100 <= 0).length} dueToday={d.dueToday} />
        {months && (
          <BarChartCard
            className={showHero ? "md:col-span-2 xl:col-span-1" : undefined}
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
        )}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-[1fr_2.15fr]">
        <div className="gp-stagger flex flex-col gap-4">
          {goal && <GoalCard t={t} lang={lang} goal={goal} canSetGoal={can(role, "manageSettings")} />}
          {alerts && <AlertsCard t={t} alerts={alerts.open} />}
          {appts && <AppointmentsCard t={t} lang={lang} appts={appts} />}
          {!wo && <LowStockCard t={t} lang={lang} parts={d.lowStock} canOrder={can(role, "requestPurchase")} />}
        </div>
        {orders ? (
          <div className="gp-stagger flex min-w-0 flex-col gap-4">
            <RecentOrders t={t} lang={lang} rows={orders} finance={finance} />
            <StatusCard t={t} byStatus={d.byStatus} statuses={ACTIVE_STATUSES} />
          </div>
        ) : (
          watch.length > 0 && <WatchCard title={o.watch} tiles={watch} />
        )}
      </div>

      {wo && (
        <div className="gp-stagger mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <LowStockCard t={t} lang={lang} parts={d.lowStock} canOrder={can(role, "requestPurchase")} />
          {watch.length > 0 && (
            <div className="md:col-span-1 xl:col-span-2">
              <WatchCard title={o.watch} tiles={watch} />
            </div>
          )}
        </div>
      )}

      {week && (
        <div className="gp-stagger mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
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
      )}

      {(invoices || activity) && (
        <div className="gp-stagger mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          {invoices && <InvoicesCard t={t} lang={lang} invoices={invoices} overdue={overdue?.count ?? 0} unpaid={d.unpaidTotal} />}
          {activity && (
            <div className={invoices ? undefined : "md:col-span-2"}>
              <ActivityCard t={t} lang={lang} events={activity} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
