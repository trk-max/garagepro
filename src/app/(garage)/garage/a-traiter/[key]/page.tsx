import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { TODO_ICONS } from "@/components/shell/todo-icons";
import { todoLabel } from "@/components/shell/todo-label";
import { TodoRows } from "@/components/shell/todo-rows";
import { Button } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/field";
import { fmt } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { getStaff } from "@/lib/session";
import { isTodoKey, TODO_DEFS, todoKeysFor } from "@/lib/todo";
import { getSettings } from "@/server/settings";
import { DETAIL_LIMIT, todoDetail } from "@/server/todo-details";

type PageProps = { params: Promise<{ key: string }> };

/**
 * « À traiter » — ONE item, where its line in the bell leads: exactly the records it counts (same where clauses as
 * the count), each with the car (plate, make / model, customer), the order / invoice number, the key figure and a
 * direct link. Only the items the person may see (role + per-user access): another key is « not found ».
 */
export default async function TodoItemPage({ params }: PageProps) {
  const staff = await getStaff();
  if (!staff) redirect("/login");
  const { key } = await params;
  if (!isTodoKey(key) || !todoKeysFor(staff).includes(key)) notFound();
  const [{ t, lang }, settings, rows] = await Promise.all([getI18n(), getSettings(), todoDetail(key, staff).catch(() => null)]);
  const Icon = TODO_ICONS[key];
  const def = TODO_DEFS[key];
  const danger = def.tone === "danger";

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
      <Button asChild variant="ghost" size="sm">
        <Link href={`/garage/a-traiter#${key}`}>
          <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden /> {t.todo.detail.back}
        </Link>
      </Button>
      <PageHeader
        title={
          <span className="flex items-start gap-3">
            <span className={`mt-1 grid size-10 shrink-0 place-items-center rounded-full ${danger ? "bg-gp-danger-bg text-gp-danger-ink" : "bg-gp-accent-tint text-gp-accent-ink"}`} aria-hidden>
              <Icon className="size-5" />
            </span>
            <span className="text-2xl sm:text-3xl">{todoLabel(t, key)}</span>
          </span>
        }
        subtitle={rows ? fmt(t.todo.detail.records, { n: rows.length }) : undefined}
      >
        <Button asChild variant="secondary" size="sm">
          <Link href={def.href}>
            {t.todo.module} <ArrowRight className="size-4 rtl:rotate-180" aria-hidden />
          </Link>
        </Button>
      </PageHeader>

      {rows === null ? (
        <Card>
          <p className="text-sm text-muted-foreground">{t.todo.detail.noRows}</p>
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <p className="text-sm text-muted-foreground" data-testid="todo-empty">{t.todo.detail.empty}</p>
        </Card>
      ) : (
        <>
          <TodoRows rows={rows} t={t} lang={lang} tz={settings.timezone} />
          {rows.length >= DETAIL_LIMIT && <p className="text-sm text-muted-foreground">{fmt(t.todo.detail.limited, { n: DETAIL_LIMIT })}</p>}
        </>
      )}
    </div>
  );
}
