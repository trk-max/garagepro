import Link from "next/link";
import { AlertTriangle, BellRing, CalendarClock, CalendarDays, CarFront, CheckCircle2, ClipboardCheck, Coins, Siren, Truck, UserCheck, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PlateChip, StatusBadge } from "@/components/garage/badges";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/field";
import { MoneyChart } from "@/components/garage/money-chart";
import { PlateSearch } from "@/components/garage/plate-search";
import { LiveRefresh } from "@/components/live-refresh";
import { siteMedia } from "@/lib/site-media";
import { getSettings } from "@/server/settings";
import { displayPlate, formatDateTime, formatMoney, formatQty, formatTime, woNumber } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { requireStaff } from "@/lib/session";
import { listAlerts } from "@/server/alerts";
import { getDashboard, moneySeries, presentNow, todayAppointments } from "@/server/dashboard";
import { overdueSummary } from "@/server/invoices";
import { purchasingSummary } from "@/server/purchasing";
import { ACTIVE_STATUSES } from "@/server/workflow";

type Stat = { label: string; value: string; icon: LucideIcon; href: string; tone?: string };

export default async function DashboardPage() {
  const staff = await requireStaff();
  const role = staff.role;
  const [{ t, lang }, d, overdue, purchasing, settings, money, appts, presence, alerts] = await Promise.all([
    getI18n(),
    getDashboard(),
    can(role, "viewFinance") ? overdueSummary() : null,
    can(role, "requestPurchase") ? purchasingSummary() : null,
    getSettings(),
    can(role, "viewFinance") ? moneySeries() : null,
    can(role, "viewAppointments") ? todayAppointments() : null,
    can(role, "manageTeam") ? presentNow() : null,
    can(role, "manageRepairFollowUp") ? listAlerts(undefined, role) : null,
  ]);
  const db = t.v7.dash;
  const media = siteMedia();
  const bannerPhoto = media.bandPhoto ?? media.heroPhoto;

  const stats: Stat[] = [];
  if (can(role, "viewWorkOrders")) {
    stats.push(
      { label: t.dashboard.inShop, value: String(d.inShop), icon: CarFront, href: "/garage/work-orders" },
      { label: t.dashboard.ready, value: String(d.ready), icon: CheckCircle2, href: "/garage/work-orders?status=READY", tone: "text-emerald-700 dark:text-emerald-400" },
      { label: t.dashboard.dueToday, value: String(d.dueToday), icon: CalendarClock, href: "/garage/work-orders" },
    );
  }
  // Money figures: hidden from mechanics and storekeepers.
  if (can(role, "viewFinance")) {
    stats.push(
      { label: t.dashboard.revenueMonth, value: formatMoney(d.revenueMonthHt, lang), icon: Coins, href: "/garage/invoices" },
      { label: t.dashboard.unpaid, value: formatMoney(d.unpaidTotal, lang), icon: Wallet, href: "/garage/invoices?status=ISSUED", tone: d.unpaidTotal ? "text-amber-700 dark:text-amber-400" : undefined },
    );
    if (overdue) {
      stats.push({ label: t.dashboard.overdue, value: String(overdue.count), icon: BellRing, href: "/garage/invoices?status=OVERDUE", tone: overdue.count ? "text-red-700 dark:text-red-400" : undefined });
    }
  }
  if (alerts) {
    stats.push({ label: db.alerts, value: String(alerts.open.length), icon: Siren, href: "/garage/suivi", tone: alerts.open.length ? "text-red-700 dark:text-red-400" : undefined });
  }
  if (presence) {
    stats.push({ label: db.present, value: presence.onBreak ? `${presence.working} (+${presence.onBreak} ${db.onBreak})` : String(presence.working), icon: UserCheck, href: "/garage/pointage" });
  }
  if (purchasing) {
    stats.push(
      { label: t.dashboard.pendingApprovals, value: String(purchasing.pendingApprovals), icon: ClipboardCheck, href: "/garage/purchase-orders?status=PENDING_APPROVAL", tone: purchasing.pendingApprovals ? "text-amber-700 dark:text-amber-400" : undefined },
      { label: t.dashboard.openPurchases, value: String(purchasing.openOrders), icon: Truck, href: "/garage/purchase-orders?status=OPEN" },
    );
    if (role === "ADMIN") {
      stats.push({ label: t.dashboard.supplierDue, value: formatMoney(purchasing.supplierDue, lang), icon: Wallet, href: "/garage/supplier-invoices?filter=unpaid" });
    }
  }

  return (
    <>
      {/* Cinematic band (same look as the customer site), photo only: no video in the staff app. */}
      <section className="dark relative isolate overflow-hidden border-b border-[#303030] bg-black text-white">
        {bannerPhoto && (
          <>
            <div aria-hidden className="absolute inset-0 -z-20 bg-cover bg-center" style={{ backgroundImage: `url(${bannerPhoto})` }} />
            <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-black via-black/80 to-black/30 rtl:bg-gradient-to-l" />
          </>
        )}
        <div className="mx-auto flex max-w-6xl flex-wrap items-end gap-4 px-6 pt-10 pb-8 sm:pt-14">
          <div className="min-w-0">
            <p className="f-label text-white/55">
              {settings.garageName} · {staff.name}
            </p>
            <h1 className="f-display mt-3 text-2xl text-white sm:text-4xl">{t.dashboard.title}</h1>
          </div>
          <div className="ms-auto flex flex-wrap items-center gap-2">
            <LiveRefresh url="/api/staff/live?topic=dashboard" liveLabel={t.portal.live} reconnectingLabel={t.portal.reconnecting} tone="dark" />
            {can(role, "viewWorkOrders") && (
              <PlateSearch className="w-56 [&_input]:border-white/30 [&_input]:bg-black/60 [&_input]:text-white" placeholder={t.plateLookup.quick} label={t.plateLookup.title} />
            )}
            {can(role, "viewWorkOrders") && (
              <Button asChild>
                <Link href="/garage/work-orders/new">{t.workOrders.new}</Link>
              </Button>
            )}
            {can(role, "requestPurchase") && (
              <Button asChild variant="outline">
                <Link href="/garage/purchase-orders/new">{t.purchase.new}</Link>
              </Button>
            )}
          </div>
        </div>
      </section>
      <div className="mx-auto max-w-6xl p-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {stats.map(({ label, value, icon: Icon, href, tone }) => (
            <Link
              key={label}
              href={href}
              className="group relative overflow-hidden rounded-lg border bg-card p-4 transition-colors hover:border-foreground/40 after:absolute after:inset-x-0 after:top-0 after:h-0.5 after:bg-brand-500 after:opacity-0 after:transition-opacity hover:after:opacity-100"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="label-tech">{label}</p>
                <Icon className={`size-4 shrink-0 ${tone ?? "text-muted-foreground"}`} aria-hidden />
              </div>
              <p className="mt-3 break-words text-xl font-semibold tracking-tight tabular-nums sm:text-3xl" dir="ltr">{value}</p>
            </Link>
          ))}
        </div>

        {(money || appts) && (
          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
            {money && (
              <Card className="lg:col-span-2">
                <CardTitle className="flex items-center gap-2">
                  <Coins className="size-4 text-muted-foreground" aria-hidden /> {db.moneyTitle}
                </CardTitle>
                <MoneyChart points={money} lang={lang} labels={{ invoiced: db.invoiced, collected: db.collected, table: db.showTable, month: db.month }} />
              </Card>
            )}
            {appts && (
              <Card className={money ? undefined : "lg:col-span-3"}>
                <CardTitle className="flex items-center gap-2">
                  <CalendarDays className="size-4 text-muted-foreground" aria-hidden /> {db.appointmentsToday}
                </CardTitle>
                {appts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{db.noAppointments}</p>
                ) : (
                  <ul className="divide-y text-sm">
                    {appts.map((a) => (
                      <li key={a.id} className="flex flex-wrap items-center gap-2 py-2">
                        <span className="tabular-nums font-medium">{formatTime(a.startAt, lang)}</span>
                        <span className="font-mono text-xs" dir="ltr">{displayPlate(a.plate)}</span>
                        <span className="min-w-0 truncate text-muted-foreground">
                          {a.firstName} {a.lastName} · {a.service.name}
                        </span>
                        {a.status === "CHECKED_IN" && <CheckCircle2 className="ms-auto size-4 text-emerald-700 dark:text-emerald-400" aria-label={db.checkedIn} />}
                      </li>
                    ))}
                  </ul>
                )}
                <Button asChild variant="outline" size="sm" className="mt-3">
                  <Link href="/garage/appointments">{t.appointments.title}</Link>
                </Button>
              </Card>
            )}
          </div>
        )}

        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
          {can(role, "viewWorkOrders") && (
            <Card className="lg:col-span-2">
              <CardTitle>{t.dashboard.byStatus}</CardTitle>
              <div className="flex flex-wrap gap-2">
                {ACTIVE_STATUSES.map((status) => (
                  <Link key={status} href={`/garage/work-orders?status=${status}`} className="flex items-center gap-2 rounded-md border px-3 py-2 hover:bg-accent/50">
                    <StatusBadge status={status} t={t} />
                    <span className="text-lg font-semibold tabular-nums">{d.byStatus[status]}</span>
                  </Link>
                ))}
              </div>

              <CardTitle className="mt-6">{t.dashboard.recent}</CardTitle>
              <ul className="divide-y">
                {d.recent.map((wo) => (
                  <li key={wo.id}>
                    <Link href={`/garage/work-orders/${wo.id}`} className="flex flex-wrap items-center gap-3 py-2.5 hover:bg-accent/30">
                      <span className="font-mono text-xs text-muted-foreground">{woNumber(wo.number)}</span>
                      <PlateChip plate={wo.vehicle.plate} />
                      <span className="text-sm">{wo.vehicle.make} {wo.vehicle.model}</span>
                      <span className="text-sm text-muted-foreground">· {wo.customer.name}</span>
                      <span className="ms-auto flex items-center gap-2">
                        <StatusBadge status={wo.status} t={t} />
                        <time className="text-xs text-muted-foreground">{formatDateTime(wo.updatedAt, lang)}</time>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-amber-700 dark:text-amber-400" aria-hidden /> {t.dashboard.lowStock}
            </CardTitle>
            {d.lowStock.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t.dashboard.noLowStock}</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {d.lowStock.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate">
                      <span className="font-mono text-xs text-muted-foreground">{p.sku}</span> {p.name}
                    </span>
                    <span className={`tabular-nums ${p.stockX100 <= 0 ? "text-red-700 dark:text-red-400" : "text-amber-700 dark:text-amber-400"}`}>
                      {formatQty(p.stockX100, lang)} / {formatQty(p.minStockX100, lang)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 grid gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href="/garage/parts?low=1">{t.nav.parts}</Link>
              </Button>
              {can(role, "requestPurchase") && d.lowStock.length > 0 && (
                <Button asChild size="sm">
                  <Link href="/garage/purchase-orders/new?prefill=low">{t.purchase.prefillLow}</Link>
                </Button>
              )}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
