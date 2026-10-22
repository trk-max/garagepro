import Link from "next/link";
import { BellRing, CalendarClock } from "lucide-react";
import { PlateChip } from "@/components/garage/badges";
import { fmt, formatDate, formatMoney, type Lang } from "@/lib/format";
import type { Dictionary } from "@/lib/i18n/fr";
import type { TodoFigure, TodoRow } from "@/server/todo-details";

/**
 * Lines of an « À traiter » item: for a car, plate (PlateChip), make / model, customer, order / invoice number and
 * the key figure; for an invoice with money due, total / paid / balance / due date / next payment, and « Relancer
 * le client » (the invoice's reminder panel). `compact`: the overview cards; otherwise the page of one item.
 */
export function TodoRows({ rows, t, lang, tz, compact = false }: { rows: TodoRow[]; t: Dictionary; lang: Lang; tz: string; compact?: boolean }) {
  return (
    <ul className="divide-y rounded-md border text-sm" data-testid="todo-rows">
      {rows.map((r) => (
        <li key={r.id} className={r.tone === "danger" ? "bg-gp-danger-bg/40" : undefined} data-testid="todo-row">
          <Row r={r} t={t} lang={lang} tz={tz} compact={compact} />
        </li>
      ))}
    </ul>
  );
}

function figureText(f: TodoFigure, t: Dictionary, lang: Lang): string {
  const d = t.todo.detail;
  switch (f.kind) {
    case "money": return formatMoney(f.amount, lang);
    case "days": return fmt(d.since, { n: f.days });
    case "late": return fmt(d.late, { n: f.days });
    case "minutes": return fmt(d.minutes, { n: f.minutes });
    case "noInvoice": return d.noInvoice;
    case "unread": return fmt(d.unread, { n: f.n });
    case "text": return f.text;
  }
}

function Row({ r, t, lang, tz, compact }: { r: TodoRow; t: Dictionary; lang: Lang; tz: string; compact: boolean }) {
  const d = t.todo.detail;
  const p = t.pay.promise;
  const danger = r.tone === "danger";
  const figure = r.figure ? figureText(r.figure, t, lang) : null;
  return (
    <div className="flex flex-col gap-1.5 px-3 py-2">
      <Link href={r.href} className="flex min-w-0 items-start gap-3 rounded-sm hover:underline-offset-4 [&:hover_.gp-title]:underline">
        <span className="min-w-0 flex-1">
          {r.car ? (
            <>
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <PlateChip plate={r.car.plate} />
                {r.car.vehicle && <span className="gp-title font-medium">{r.car.vehicle}</span>}
                {r.car.ref && <span className="font-mono text-xs text-muted-foreground" dir="ltr">{r.car.ref}</span>}
              </span>
              {r.car.customer && <span className="block truncate text-xs text-muted-foreground">{r.car.customer}</span>}
              {!r.figure || r.figure.kind !== "text" ? null : <span className="block truncate text-xs">{r.figure.text}</span>}
            </>
          ) : (
            <>
              <span className="gp-title block truncate font-medium">{r.title}</span>
              {r.sub && <span className="block truncate text-xs text-muted-foreground">{r.sub}</span>}
            </>
          )}
          {r.missing && <span className="block truncate text-xs text-gp-danger-ink">{r.missing.map((f) => t.customers[f]).join(" · ")}</span>}
        </span>
        <span className="flex shrink-0 flex-col items-end gap-0.5 text-end">
          {figure && r.figure?.kind !== "text" && (
            <span className={`text-sm font-semibold tabular-nums ${danger || r.figure?.kind === "late" ? "text-gp-danger-ink" : ""}`} dir={r.figure?.kind === "money" ? "ltr" : undefined}>
              {figure}
            </span>
          )}
          {figure && r.figure?.kind === "text" && !r.car && <span className="text-xs tabular-nums" dir="ltr">{figure}</span>}
          {r.at && !r.invoice && <span className="text-xs text-muted-foreground tabular-nums">{formatDate(r.at, lang, tz)}</span>}
        </span>
      </Link>
      {r.invoice && <InvoiceFacts r={r} t={t} lang={lang} tz={tz} compact={compact} />}
      {r.invoice && !compact && (
        <div className="flex flex-wrap gap-2">
          {r.remindHref && (
            <Link href={r.remindHref} className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-gp-line px-3 text-xs font-medium hover:bg-gp-hover" data-testid="todo-remind">
              <BellRing className="size-3.5" aria-hidden /> {p.remind}
            </Link>
          )}
          <Link href={`${r.href}#promesse`} className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-gp-line px-3 text-xs font-medium hover:bg-gp-hover">
            <CalendarClock className="size-3.5" aria-hidden /> {d.setNext}
          </Link>
        </div>
      )}
    </div>
  );
}

function InvoiceFacts({ r, t, lang, tz, compact }: { r: TodoRow; t: Dictionary; lang: Lang; tz: string; compact: boolean }) {
  const d = t.todo.detail;
  const p = t.pay.promise;
  const inv = r.invoice!;
  const next = inv.next ? (
    <span className={inv.next.overdue ? "font-semibold text-gp-danger-ink" : "font-medium"} data-testid={inv.next.overdue ? "promise-overdue" : "promise-next"}>
      {inv.next.overdue && `${p.overdue} · `}
      {formatDate(inv.next.at, lang, tz)}
      {inv.next.amount ? <span dir="ltr"> · {formatMoney(inv.next.amount, lang)}</span> : null}
    </span>
  ) : (
    <span className="text-muted-foreground">{p.toSet}</span>
  );
  if (compact) {
    return (
      <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
        <span>
          {d.due} {formatDate(inv.due, lang, tz)}
        </span>
        <span>
          {d.next}: {next}
        </span>
      </p>
    );
  }
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-md bg-muted/40 px-3 py-2 text-xs sm:grid-cols-5">
      <Fact label={d.total} value={<span dir="ltr">{formatMoney(inv.total, lang)}</span>} />
      <Fact label={d.paid} value={<span dir="ltr">{formatMoney(inv.paid, lang)}</span>} />
      <Fact label={d.balance} value={<span dir="ltr" className="font-semibold">{formatMoney(inv.balance, lang)}</span>} />
      <Fact label={d.due} value={formatDate(inv.due, lang, tz)} />
      <Fact label={d.next} value={next} />
    </dl>
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
