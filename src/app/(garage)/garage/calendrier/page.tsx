import Link from "next/link";
import { Card, PageHeader } from "@/components/ui/field";
import { addDays, utcToZoned, weekdayOf, zonedToUtc } from "@/lib/booking";
import { formatDay, formatTime, woNumber, type Lang } from "@/lib/format";
import type { Dictionary } from "@/lib/i18n/fr";
import { getI18n } from "@/lib/i18n/server";
import { spanDates } from "@/lib/leaves";
import { isIsoDay, localToday } from "@/lib/periods";
import { requirePageAccess } from "@/lib/session";
import { cn } from "@/lib/utils";
import { calendarItems, type CalendarItem } from "@/server/calendar";
import { getSettings } from "@/server/settings";

type View = "day" | "week" | "month" | "year";
type PageProps = { searchParams: Promise<{ view?: string; date?: string }> };

const VIEWS: View[] = ["day", "week", "month", "year"];

function range(view: View, anchor: string): { first: string; days: number } {
  if (view === "day") return { first: anchor, days: 1 };
  if (view === "week") {
    const offset = (weekdayOf(anchor) + 6) % 7; // weeks start on Monday
    return { first: addDays(anchor, -offset), days: 7 };
  }
  if (view === "month") {
    const first = `${anchor.slice(0, 7)}-01`;
    const next = new Date(Date.UTC(Number(anchor.slice(0, 4)), Number(anchor.slice(5, 7)), 1)).toISOString().slice(0, 10);
    return { first, days: Math.round((Date.parse(next) - Date.parse(first)) / 86_400_000) };
  }
  const y = anchor.slice(0, 4);
  return { first: `${y}-01-01`, days: Math.round((Date.parse(`${Number(y) + 1}-01-01`) - Date.parse(`${y}-01-01`)) / 86_400_000) };
}

function shift(view: View, anchor: string, dir: 1 | -1): string {
  if (view === "day") return addDays(anchor, dir);
  if (view === "week") return addDays(anchor, 7 * dir);
  const d = new Date(`${anchor.slice(0, 7)}-01T12:00:00Z`);
  if (view === "month") d.setUTCMonth(d.getUTCMonth() + dir);
  else d.setUTCFullYear(d.getUTCFullYear() + dir);
  return d.toISOString().slice(0, 10);
}

/** Items of each local day. */
function byDay(items: CalendarItem[], tz: string): Map<string, CalendarItem[]> {
  const map = new Map<string, CalendarItem[]>();
  const push = (d: string, i: CalendarItem) => map.set(d, [...(map.get(d) ?? []), i]);
  for (const i of items) {
    if (i.kind === "leave") for (const d of spanDates(i, tz)) push(d, i);
    else push(utcToZoned(i.startAt, tz).date, i);
  }
  return map;
}

function ItemLine({ item, t, lang, tz, plain = false }: { item: CalendarItem; t: Dictionary; lang: Lang; tz: string; plain?: boolean }) {
  const c = t.v7.calendar;
  if (item.kind === "leave") {
    return (
      <span className={cn("block truncate border-s-2 ps-1.5 text-xs", item.status === "PENDING" ? "border-amber-500 italic" : "border-violet-500")}>
        {item.userName} · {item.type ? t.v7.leave.type[item.type] : c.absent}
        {!item.allDay && ` ${formatTime(item.startAt, lang, tz)}–${formatTime(item.endAt, lang, tz)}`}
        {item.status === "PENDING" && ` (${c.pending})`}
      </span>
    );
  }
  if (item.kind === "appointment") {
    return (
      <span className="block truncate border-s-2 border-sky-500 ps-1.5 text-xs">
        {formatTime(item.startAt, lang, tz)} {c.appointment} · {item.title}
      </span>
    );
  }
  const text = `${formatTime(item.startAt, lang, tz)} ${c.promised} ${woNumber(item.number)} · ${item.plate}`;
  // Inside a month cell (itself a link) a nested link is not allowed: plain text there.
  if (plain) return <span className="block truncate border-s-2 border-emerald-600 ps-1.5 text-xs">{text}</span>;
  return (
    <Link href={`/garage/work-orders/${item.id}`} className="block truncate border-s-2 border-emerald-600 ps-1.5 text-xs hover:underline">
      {text}
    </Link>
  );
}

/** Team calendar: day / week / month / year. */
export default async function CalendarPage({ searchParams }: PageProps) {
  const staff = await requirePageAccess("useTimeClock");
  const [sp, settings, { t, lang }] = await Promise.all([searchParams, getSettings(), getI18n()]);
  const tz = settings.timezone;
  const view: View = VIEWS.includes(sp.view as View) ? (sp.view as View) : "month";
  const today = localToday(tz);
  const anchor = isIsoDay(sp.date) ? sp.date : today;
  const { first, days } = range(view, anchor);
  const from = zonedToUtc(first, "00:00", tz);
  const to = zonedToUtc(addDays(first, days), "00:00", tz);
  const items = await calendarItems(staff, from, to);
  const perDay = byDay(items, tz);
  const c = t.v7.calendar;
  const href = (v: View, d: string) => `/garage/calendrier?view=${v}&date=${d}`;
  const dates = Array.from({ length: days }, (_, i) => addDays(first, i));
  const title =
    view === "year"
      ? anchor.slice(0, 4)
      : view === "month"
        ? formatDay(first, lang, { month: "long", year: "numeric" })
        : view === "week"
          ? `${formatDay(first, lang, { day: "numeric", month: "short" })} – ${formatDay(addDays(first, 6), lang, { day: "numeric", month: "short", year: "numeric" })}`
          : formatDay(first, lang, { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 sm:p-6">
      <PageHeader title={c.title}>
        <nav className="flex gap-1" aria-label={c.title}>
          {VIEWS.map((v) => (
            <Link key={v} href={href(v, anchor)} aria-current={v === view ? "page" : undefined} className={cn("f-label border px-3 py-2", v === view ? "border-foreground" : "text-muted-foreground hover:text-foreground")}>
              {c.views[v]}
            </Link>
          ))}
        </nav>
      </PageHeader>
      <div className="flex flex-wrap items-center gap-2">
        <Link href={href(view, shift(view, anchor, -1))} className="border px-3 py-1.5 text-sm hover:border-foreground" aria-label={c.previous}>
          ‹
        </Link>
        <Link href={href(view, today)} className="border px-3 py-1.5 text-sm hover:border-foreground">
          {c.today}
        </Link>
        <Link href={href(view, shift(view, anchor, 1))} className="border px-3 py-1.5 text-sm hover:border-foreground" aria-label={c.next}>
          ›
        </Link>
        <h2 className="ms-2 text-lg font-semibold capitalize">{title}</h2>
      </div>
      <p className="text-xs text-muted-foreground">{c.legend}</p>

      {view === "day" && (
        <Card>
          {(perDay.get(first) ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">{c.nothing}</p>
          ) : (
            <div className="space-y-2">
              {(perDay.get(first) ?? []).map((i) => (
                <ItemLine key={`${i.kind}-${i.id}`} item={i} t={t} lang={lang} tz={tz} />
              ))}
            </div>
          )}
        </Card>
      )}

      {view === "week" && (
        <div className="grid gap-2 md:grid-cols-7">
          {dates.map((d) => (
            <Card key={d} className={cn("min-h-40 p-2 sm:p-2", d === today && "border-brand-500")}>
              <Link href={href("day", d)} className="label-tech mb-2 block hover:underline">
                {formatDay(d, lang, { weekday: "short", day: "numeric" })}
              </Link>
              <div className="space-y-1">
                {(perDay.get(d) ?? []).map((i) => (
                  <ItemLine key={`${i.kind}-${i.id}`} item={i} t={t} lang={lang} tz={tz} />
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      {view === "month" && (
        <div className="grid grid-cols-7 border-s border-t">
          {Array.from({ length: (weekdayOf(first) + 6) % 7 }, (_, i) => (
            <div key={`pad${i}`} className="hidden border-e border-b bg-muted/30 sm:block" />
          ))}
          {dates.map((d) => {
            const list = perDay.get(d) ?? [];
            return (
              <Link key={d} href={href("day", d)} className={cn("min-h-24 border-e border-b p-1.5 hover:bg-muted/40", d === today && "bg-brand-500/5")}>
                <span className={cn("text-xs tabular-nums", d === today && "font-bold text-brand-500")}>{Number(d.slice(8))}</span>
                <span className="mt-1 hidden space-y-0.5 sm:block">
                  {list.slice(0, 4).map((i) => (
                    <ItemLine key={`${i.kind}-${i.id}`} item={i} t={t} lang={lang} tz={tz} plain />
                  ))}
                  {list.length > 4 && <span className="text-xs text-muted-foreground">+{list.length - 4}</span>}
                </span>
                {list.length > 0 && <span className="mt-1 block size-1.5 rounded-full bg-violet-500 sm:hidden" aria-label={String(list.length)} />}
              </Link>
            );
          })}
        </div>
      )}

      {view === "year" && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 12 }, (_, m) => {
            const mFirst = `${anchor.slice(0, 4)}-${String(m + 1).padStart(2, "0")}-01`;
            const mDays = range("month", mFirst).days;
            return (
              <Card key={m} className="p-3 sm:p-3">
                <Link href={href("month", mFirst)} className="label-tech mb-2 block capitalize hover:underline">
                  {formatDay(mFirst, lang, { month: "long" })}
                </Link>
                <div className="grid grid-cols-7 gap-0.5 text-center text-[10px]">
                  {Array.from({ length: (weekdayOf(mFirst) + 6) % 7 }, (_, i) => (
                    <span key={`p${i}`} />
                  ))}
                  {Array.from({ length: mDays }, (_, i) => {
                    const d = addDays(mFirst, i);
                    const n = (perDay.get(d) ?? []).filter((x) => x.kind === "leave").length;
                    return (
                      <Link key={d} href={href("day", d)} className={cn("py-0.5 tabular-nums", n > 0 && "bg-violet-500/25 font-semibold", d === today && "ring-1 ring-brand-500")} title={n ? `${n}` : undefined}>
                        {i + 1}
                      </Link>
                    );
                  })}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
