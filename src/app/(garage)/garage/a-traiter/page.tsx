import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { TODO_ICONS } from "@/components/shell/todo-icons";
import { todoLabel } from "@/components/shell/todo-label";
import { TodoRows } from "@/components/shell/todo-rows";
import { Card, PageHeader } from "@/components/ui/field";
import { fmt, type Lang } from "@/lib/format";
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
 * todoDetails, called only for the visible items that have a count. « Voir les N » opens the page of the item
 * (/garage/a-traiter/[key]: exactly its records); « Ouvrir le module » the module's own list (old links).
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
            <li key={i.key} id={i.key} className="min-w-0 scroll-mt-24">
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
  const danger = item.tone === "danger";
  return (
    <Card className={`h-full space-y-3${danger ? " border-gp-danger-ink/40" : ""}`} data-testid={`todo-card-${item.key}`}>
      <div className="flex items-start gap-3">
        <span className={`grid size-9 shrink-0 place-items-center rounded-full ${danger ? "bg-gp-danger-bg text-gp-danger-ink" : "bg-gp-accent-tint text-gp-accent-ink"}`} aria-hidden>
          <Icon className="size-4" />
        </span>
        <h3 className="min-w-0 flex-1 text-sm leading-snug font-semibold">
          <Link href={item.target} className="hover:underline">
            {todoLabel(t, item.key)}
          </Link>
        </h3>
        <span className={`min-w-7 rounded-full px-2 text-center text-sm font-semibold tabular-nums ${danger ? "bg-gp-danger-ink text-white" : "bg-gp-primary text-gp-primary-ink"}`}>{item.count}</span>
      </div>
      {rows && rows.length > 0 && <TodoRows rows={rows} t={t} lang={lang} tz={tz} compact />}
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-muted-foreground">{rest > 0 ? fmt(t.todo.more, { n: rest }) : ""}</span>
        <span className="flex flex-wrap items-center gap-3">
          <Link href={item.href} className="text-muted-foreground underline-offset-4 hover:underline">
            {t.todo.module}
          </Link>
          <Link href={item.target} className="inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline" data-testid={`todo-see-${item.key}`}>
            {fmt(t.todo.seeN, { n: item.count })} <ArrowRight className="size-4 rtl:rotate-180" aria-hidden />
          </Link>
        </span>
      </div>
    </Card>
  );
}
