import Link from "next/link";
import {
  AlarmClock, Award, Boxes, CalendarDays, CarFront, ChevronRight, ClipboardList, Clock3, FilePlus2, FileText, LayoutGrid, ListTodo, Mail, PackageCheck,
  PackageSearch, ReceiptText, ShoppingCart, Smartphone, Ticket, Timer, TriangleAlert, UserRound, Users, Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { workshopStatusAction } from "@/actions/workshop";
import { ActionButton } from "@/components/action-form";
import { PlateChip, StatusBadge } from "@/components/garage/badges";
import { LiveRefresh } from "@/components/live-refresh";
import { InstallCard } from "@/components/pwa/install-card";
import { todoLabel } from "@/components/shell/todo-label";
import { utcToZoned } from "@/lib/booking";
import { displayPlate, fmt, formatDate, formatDateTime, formatTime } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { requireStaff } from "@/lib/session";
import { TEAM_TILES, teamSections, teamTiles, type TeamTileKey } from "@/lib/team-app";
import { workshopMoves } from "@/lib/workshop-moves";
import { cn } from "@/lib/utils";
import { receptionSummary } from "@/server/accueil";
import { appointmentsForDay } from "@/server/booking";
import { runningLabor } from "@/server/labor";
import { getSettings } from "@/server/settings";
import { getTodo } from "@/server/todo";
import { countByStatus, workshopOrders } from "@/server/work-orders";

export const dynamic = "force-dynamic";

const ICONS: Record<TeamTileKey, LucideIcon> = {
  workshop: Wrench, board: LayoutGrid, newOrder: FilePlus2, queue: Ticket, appointments: CalendarDays, orders: ClipboardList, quotes: FileText,
  ready: CarFront, todo: ListTodo, missingParts: PackageSearch, receipts: PackageCheck, lowStock: AlarmClock, purchaseOrders: ShoppingCart,
  stock: Boxes, timeClock: Clock3, invoices: ReceiptText, team: Users, showroom: CarFront, messages: Mail, mySkills: Award, customers: UserRound,
  delays: TriangleAlert,
};

/**
 * PWA team app — « Espace équipe »: a role-focused home with only the most important actions, big touch
 * targets, phone first. Every tile and section is filtered by the person's access (role + per-user
 * overrides, can()); the actions are the existing ones (same server checks). The mechanic's cars open
 * the phone order screen (/garage/app/ordre/[id]): works and parts, status, inspection, time, photos.
 */
export default async function TeamAppHome() {
  const staff = await requireStaff();
  const settings = await getSettings();
  const { main, more } = teamTiles(staff);
  const sec = teamSections(staff);
  const today = utcToZoned(new Date(), settings.timezone).date;
  const needStatusCounts = [...main, ...more].some((k) => k === "quotes" || k === "ready");
  const [{ t, lang }, todo, mine, running, appts, queue, byStatus] = await Promise.all([
    getI18n(),
    getTodo(staff),
    sec.myOrders ? workshopOrders(staff.id) : Promise.resolve([]),
    can(staff, "logOwnLabor") ? runningLabor(staff.id) : Promise.resolve(null),
    sec.appointments ? appointmentsForDay(today).catch(() => null) : Promise.resolve(null),
    sec.queue ? receptionSummary().catch(() => null) : Promise.resolve(null),
    needStatusCounts ? countByStatus().catch(() => null) : Promise.resolve(null),
  ]);
  const a = t.app.team;
  const firstName = staff.name.split(/\s+/)[0] ?? staff.name;
  const showMine = staff.role === "MECHANIC" || mine.length > 0;
  const upcoming = appts?.items.filter((x) => x.status === "CONFIRMED") ?? [];

  const count = (k: TeamTileKey): number | undefined => {
    if (k === "todo") return todo.list.total || undefined;
    if (k === "quotes") return byStatus?.DIAGNOSIS || undefined;
    if (k === "ready") return byStatus?.READY || undefined;
    if (k === "queue") return queue?.waiting || undefined;
    if (k === "appointments" && appts) return upcoming.length || undefined;
    if (k === "workshop") return mine.length || undefined;
    const key = TEAM_TILES[k].todo;
    return key ? todo.counts[key] || undefined : undefined;
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-3 pt-4 pb-8 sm:px-6" data-testid="team-app">
      <header className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium tracking-wider text-gp-muted uppercase">
            {t.roles[staff.role]} · {formatDate(new Date(), lang)}
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{fmt(a.hello, { name: firstName })}</h1>
        </div>
        <LiveRefresh url="/api/staff/live?topic=workshop" liveLabel={t.portal.live} reconnectingLabel={t.portal.reconnecting} />
        {staff.role !== "MECHANIC" && (
          <Link href="/garage?full=1" className="w-full text-sm text-gp-muted underline-offset-4 hover:text-gp-ink hover:underline sm:w-auto">
            {t.staffMobile.fullDashboard}
          </Link>
        )}
      </header>

      {running && (
        <Link
          href={`/garage/app/ordre/${running.workOrder.id}`}
          className="flex min-h-14 items-center gap-3 rounded-[20px] bg-gp-accent-tint px-4 text-gp-accent-ink"
          data-testid="team-running"
        >
          <Timer className="size-5 shrink-0 animate-pulse motion-reduce:animate-none" aria-hidden />
          <span className="flex-1 font-medium">
            {fmt(a.running, { plate: displayPlate(running.workOrder.vehicle.plate) })} · {formatTime(running.startedAt, lang)}
          </span>
          <ChevronRight className="size-5 rtl:rotate-180" aria-hidden />
        </Link>
      )}

      {/* ── Main tiles (role focus) ── */}
      {main.length > 0 && (
        <nav aria-label={a.shortcuts} className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {main.map((k, i) => (
            <Tile key={k} href={TEAM_TILES[k].href} label={a.tiles[k]} icon={ICONS[k]} count={count(k)} primary={i === 0} testId={`tile-${k}`} />
          ))}
        </nav>
      )}

      {/* ── Mechanic: my cars, one tap to the phone order screen ── */}
      {showMine && (
        <section aria-labelledby="team-mine" className="space-y-3">
          <h2 id="team-mine" className="text-lg font-semibold">
            {a.myOrders} <span className="text-gp-muted">· {mine.length}</span>
          </h2>
          {mine.length === 0 ? (
            <p className="rounded-[20px] border border-dashed border-gp-line p-6 text-center text-sm text-gp-muted">{a.myOrdersEmpty}</p>
          ) : (
            <ul className="space-y-3">
              {mine.map((wo) => {
                const { next } = workshopMoves(wo, staff, settings);
                return (
                  <li key={wo.id} className="rounded-[22px] border border-gp-line bg-gp-card p-4 shadow-gp" data-testid="team-order">
                    <Link href={`/garage/app/ordre/${wo.id}`} className="block">
                      <div className="flex flex-wrap items-center gap-2">
                        <PlateChip plate={wo.vehicle.plate} />
                        <span className="font-semibold">
                          {wo.vehicle.make} {wo.vehicle.model}
                        </span>
                        <span className="ms-auto">
                          <StatusBadge status={wo.status} t={t} />
                        </span>
                      </div>
                      <p className="mt-2 line-clamp-2 text-sm text-gp-muted">{wo.complaint}</p>
                      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gp-muted">
                        <span>{wo.customer.name}</span>
                        {wo.promisedAt && <span>{fmt(a.order.promised, { date: formatDateTime(wo.promisedAt, lang) })}</span>}
                        {running?.workOrder.id === wo.id && (
                          <span className="inline-flex items-center gap-1 font-medium text-gp-accent-ink">
                            <Timer className="size-3.5" aria-hidden /> {formatTime(running.startedAt, lang)}
                          </span>
                        )}
                      </p>
                    </Link>
                    <div className="mt-3 flex gap-2">
                      {next && (
                        <ActionButton action={workshopStatusAction.bind(null, wo.id, next, null)} className="h-12 flex-1 text-base">
                          {fmt(t.workshop.moveTo, { status: t.status[next] })}
                        </ActionButton>
                      )}
                      <Link
                        href={`/garage/app/ordre/${wo.id}`}
                        className={cn("inline-flex h-12 items-center justify-center gap-1 rounded-full border border-gp-line px-4 text-sm font-medium hover:bg-gp-hover", !next && "flex-1")}
                      >
                        {a.open} <ChevronRight className="size-4 rtl:rotate-180" aria-hidden />
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {/* ── Desk / managers: today's appointments ── */}
      {appts && (
        <section aria-labelledby="team-appts" className="space-y-3">
          <h2 id="team-appts" className="flex items-center text-lg font-semibold">
            {a.appointments} <span className="ms-1 text-gp-muted">· {upcoming.length}</span>
            <Link href="/garage/appointments" className="ms-auto text-sm font-normal text-gp-muted hover:text-gp-ink">
              {a.open}
            </Link>
          </h2>
          {appts.items.length === 0 ? (
            <p className="rounded-[20px] border border-dashed border-gp-line p-6 text-center text-sm text-gp-muted">{a.noAppointments}</p>
          ) : (
            <ul className="divide-y divide-gp-line overflow-hidden rounded-[22px] border border-gp-line bg-gp-card">
              {appts.items.slice(0, 8).map((x) => (
                <li key={x.id} className={cn("flex min-h-14 items-center gap-3 px-4 py-2 text-sm", x.status !== "CONFIRMED" && "opacity-60")}>
                  <span className="w-12 shrink-0 font-semibold tabular-nums" dir="ltr">
                    {utcToZoned(x.startAt, appts.timeZone).time}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {x.firstName} {x.lastName}
                    </span>
                    <span className="block truncate text-xs text-gp-muted">{lang === "ar" && x.service.nameAr ? x.service.nameAr : x.service.name}</span>
                  </span>
                  {x.plate && <PlateChip plate={x.plate} />}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* ── « À traiter » (approvals first), filtered by the person's access ── */}
      {staff.role !== "MECHANIC" && (
        <section aria-labelledby="team-todo" className="space-y-3">
          <h2 id="team-todo" className="text-lg font-semibold">
            {a.todo} <span className="text-gp-muted">· {todo.list.total}</span>
          </h2>
          {todo.list.total === 0 ? (
            <p className="rounded-[20px] border border-dashed border-gp-line p-6 text-center text-sm text-gp-muted">{a.nothingTodo}</p>
          ) : (
            <ul className="divide-y divide-gp-line overflow-hidden rounded-[22px] border border-gp-line bg-gp-card">
              {[...todo.list.approval, ...todo.list.incomplete].slice(0, 8).map((item) => (
                <li key={item.key}>
                  <Link href={item.target} className="flex min-h-14 items-center gap-3 px-4 text-sm hover:bg-gp-hover">
                    {item.group === "approval" && <span className="rounded-full bg-gp-accent-tint px-2 py-0.5 text-xs text-gp-accent-ink">{a.approvals}</span>}
                    <span className="flex-1">{todoLabel(t, item.key)}</span>
                    <span className={cn("min-w-7 rounded-full px-2 py-0.5 text-center text-xs font-semibold", item.tone === "danger" ? "bg-gp-danger-bg text-gp-danger-ink" : "bg-gp-panel")}>
                      {item.count}
                    </span>
                    <ChevronRight className="size-4 text-gp-muted rtl:rotate-180" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* ── Every other page this person may open ── */}
      {more.length > 0 && (
        <section aria-labelledby="team-more" className="space-y-3">
          <h2 id="team-more" className="text-lg font-semibold">
            {a.more}
          </h2>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {more.map((k) => {
              const Icon = ICONS[k];
              const n = count(k);
              return (
                <li key={k}>
                  <Link href={TEAM_TILES[k].href} className="flex min-h-12 items-center gap-2 rounded-[16px] border border-gp-line bg-gp-card px-3 text-sm hover:bg-gp-hover">
                    <Icon className="size-4 shrink-0 text-gp-muted" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{a.tiles[k]}</span>
                    {n ? <span className="text-xs font-semibold text-gp-accent-ink">{n}</span> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="gp-phone dark space-y-3 rounded-[24px]">
        <InstallCard
          labels={{
            title: t.app.client.installTitle,
            text: fmt(t.app.client.installText, { name: t.app.manifest.teamName }),
            button: t.app.client.installButton,
            iosSteps: t.app.client.iosSteps,
            otherSteps: t.app.client.otherSteps,
            httpsOnly: t.app.client.httpsOnly,
          }}
        />
      </div>
      <p className="flex items-start gap-2 px-1 text-xs leading-relaxed text-gp-muted">
        <Smartphone className="mt-0.5 size-4 shrink-0" aria-hidden /> {a.lan}
      </p>
    </div>
  );
}

function Tile({ href, label, icon: Icon, count, primary, testId }: { href: string; label: string; icon: LucideIcon; count?: number; primary?: boolean; testId: string }) {
  return (
    <Link
      href={href}
      data-testid={testId}
      className={cn(
        "relative flex min-h-28 flex-col justify-between gap-3 rounded-[22px] border p-4 transition-transform active:scale-[0.98]",
        primary ? "border-transparent text-white" : "border-gp-line bg-gp-card hover:bg-gp-hover",
      )}
      style={primary ? { background: "linear-gradient(180deg, var(--gp-accent-from), var(--gp-accent-to))" } : undefined}
    >
      <Icon className={cn("size-7", primary ? "text-white" : "text-gp-accent-ink")} strokeWidth={1.8} aria-hidden />
      <span className="text-base leading-tight font-semibold">{label}</span>
      {count ? (
        <span className={cn("absolute end-3 top-3 min-w-7 rounded-full px-2 py-0.5 text-center text-xs font-bold", primary ? "bg-white/25 text-white" : "bg-gp-accent text-white")}>
          {count}
        </span>
      ) : null}
    </Link>
  );
}
