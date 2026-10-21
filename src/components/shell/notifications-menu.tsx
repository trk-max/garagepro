"use client";

import Link from "next/link";
import { ArrowRight, Bell } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { TODO_ICONS } from "@/components/shell/todo-icons";
import { todoLabel } from "@/components/shell/todo-label";
import { useI18n } from "@/lib/i18n/client";
import type { TodoItem, TodoList } from "@/lib/todo";

/**
 * V10.4 — bell = "À traiter": what is incomplete, then what waits for a manager /
 * administrator decision, each line with its count and a link to the list. The items
 * are already filtered by role on the server (src/server/todo.ts). "Tout voir" opens
 * /garage/a-traiter with the details.
 */
export function NotificationsMenu({ todo }: { todo: TodoList }) {
  const { t } = useI18n();
  const label = todo.total > 0 ? `${t.todo.title} (${todo.total})` : t.todo.title;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={label}
        title={label}
        className="gp-pill-t relative grid size-11 place-items-center rounded-full text-gp-ink outline-none hover:bg-gp-hover focus-visible:ring-2 focus-visible:ring-gp-accent"
      >
        <Bell className="size-[18px]" aria-hidden />
        {todo.total > 0 && <span className="absolute end-2.5 top-2.5 size-2.5 rounded-full border-2 border-gp-card bg-gp-accent" aria-hidden />}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={12} className="max-h-[min(36rem,calc(100dvh-7rem))] w-[min(22rem,calc(100vw-1.5rem))] overflow-y-auto rounded-[20px] p-2">
        <DropdownMenuLabel className="px-3 text-sm text-gp-ink">{t.todo.title}</DropdownMenuLabel>
        {todo.total === 0 ? (
          <p className="px-3 py-4 text-sm text-gp-muted">{t.todo.none}</p>
        ) : (
          <>
            <Section title={t.todo.incomplete} items={todo.incomplete} />
            <Section title={t.todo.approval} items={todo.approval} />
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="rounded-full px-3 py-2.5 font-medium">
          <Link href="/garage/a-traiter">
            <span className="flex-1">{t.todo.seeAll}</span>
            <ArrowRight className="size-4 rtl:rotate-180" aria-hidden />
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Section({ title, items }: { title: string; items: TodoItem[] }) {
  const { t } = useI18n();
  if (items.length === 0) return null;
  return (
    <>
      <DropdownMenuLabel className="px-3 pt-3 pb-1 text-xs font-semibold tracking-wide text-gp-muted uppercase">{title}</DropdownMenuLabel>
      {items.map(({ key, href, count }) => {
        const Icon = TODO_ICONS[key];
        return (
          <DropdownMenuItem key={key} asChild className="items-start rounded-2xl px-3 py-2">
            <Link href={href}>
              <Icon className="mt-0.5 size-4 shrink-0 text-gp-muted" aria-hidden />
              <span className="flex-1 text-sm leading-snug">{todoLabel(t, key)}</span>
              <span className="sr-only">, </span>
              <span className="min-w-6 shrink-0 rounded-full bg-gp-accent-tint px-2 text-center text-xs font-semibold text-gp-accent-ink tabular-nums">{count}</span>
            </Link>
          </DropdownMenuItem>
        );
      })}
    </>
  );
}
