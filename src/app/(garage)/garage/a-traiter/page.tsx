import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { TODO_ICONS } from "@/components/shell/todo-icons";
import { todoLabel } from "@/components/shell/todo-label";
import { Card, PageHeader } from "@/components/ui/field";
import { fmt, formatDate, type Lang } from "@/lib/format";
import type { Dictionary } from "@/lib/i18n/fr";
import { getI18n } from "@/lib/i18n/server";
import { getStaff } from "@/lib/session";
import type { TodoItem } from "@/lib/todo";
import { getSettings } from "@/server/settings";
import { getTodo } from "@/server/todo";
import { todoDetails, type TodoRow } from "@/server/todo-details";

/**
 * V10.4 — "À traiter": the bell's list with details. Same counts as the bell (getTodo,
 * cached per request, already filtered by role + per-user access); the first lines of each item come from
 * todoDetails, called only for the visible items that have a count.
 */
export default async function TodoPage() {
  const staff = await getStaff();
  if (!staff) redirect("/login");
  const [{ t, lang }, settings, { list }] = await Promise.all([getI18n(), getSettings(), getTodo(staff)]);
  const keys = [...list.incomplete, ...list.approval].map((i) => i.key);
  const rows = await todoDetails(keys, staff);
  const ctx = { t, lang, tz: settings.timezone, rows };

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <PageHeader title={t.todo.title} subtitle={t.todo.subtitle} />
      {list.total === 0 ? (
        <Card>
          <p className="text-sm text-muted-foreground">{t.todo.none}</p>
        </Card>
      ) : (
        <>
          <Group title={t.todo.incomplete} items={list.incomplete} ctx={ctx} />
          <Group title={t.todo.approval} items={list.approval} ctx={ctx} />
        </>
      )}
    </div>
  );
}

type Ctx = { t: Dictionary; lang: Lang; tz: string; rows: Partial<Record<string, TodoRow[] | null>> };

function Group({ title, items, ctx }: { title: string; items: TodoItem[]; ctx: Ctx }) {
  const total = items.reduce((s, i) => s + i.count, 0);
  return (
    <section aria-label={title} className="space-y-3">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        {title}
        <span className="rounded-full bg-gp-accent-tint px-2.5 text-sm text-gp-accent-ink tabular-nums">{total}</span>
      </h2>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{ctx.t.todo.noneGroup}</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {items.map((i) => (
            <li key={i.key} className="min-w-0">
              <Item item={i} ctx={ctx} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Item({ item, ctx }: { item: TodoItem; ctx: Ctx }) {
  const { t, lang, tz } = ctx;
  const Icon = TODO_ICONS[item.key];
  const rows = ctx.rows[item.key] ?? null;
  const rest = rows ? item.count - rows.length : 0;
  return (
    <Card className="h-full space-y-3">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gp-accent-tint text-gp-accent-ink" aria-hidden>
          <Icon className="size-4" />
        </span>
        <h3 className="min-w-0 flex-1 text-sm leading-snug font-semibold">{todoLabel(t, item.key)}</h3>
        <span className="min-w-7 rounded-full bg-gp-primary px-2 text-center text-sm font-semibold text-gp-primary-ink tabular-nums">{item.count}</span>
      </div>
      {rows && rows.length > 0 && (
        <ul className="divide-y rounded-md border text-sm">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={r.href} className="flex items-center gap-3 px-3 py-2 hover:bg-muted/50">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{r.title}</span>
                  {r.sub && <span className="block truncate text-xs text-muted-foreground">{r.sub}</span>}
                  {r.missing && <span className="block truncate text-xs text-gp-danger-ink">{r.missing.map((f) => t.customers[f]).join(" · ")}</span>}
                </span>
                {r.at && <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{formatDate(r.at, lang, tz)}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="text-muted-foreground">{rest > 0 ? fmt(t.todo.more, { n: rest }) : ""}</span>
        <Link href={item.href} className="inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline">
          {t.todo.open} <ArrowRight className="size-4 rtl:rotate-180" aria-hidden />
        </Link>
      </div>
    </Card>
  );
}
