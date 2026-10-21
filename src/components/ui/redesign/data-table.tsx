"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import { ListFilter, Search } from "lucide-react";
import { fmt } from "@/lib/format";
import { cn } from "@/lib/utils";

export type DataColumn = { key: string; header: string; className?: string };
/** One row: cells already rendered (server components can pass them), plus what search/filter read. */
export type DataRow = { id: string; href: string; linkLabel: string; cells: Record<string, ReactNode>; search: string; filter?: string };

/**
 * Rounded table with a search pill, a filter pill, a checkbox column, row hover
 * and clickable rows. The first cell holds a real link (keyboard and screen
 * readers); a click anywhere else on the row opens the same page.
 */
export function DataTable({
  caption,
  columns,
  rows,
  filters,
  labels,
  toolbar,
}: {
  caption: string;
  columns: DataColumn[];
  rows: DataRow[];
  filters?: { value: string; label: string }[];
  labels: { search: string; filter: string; all: string; selectRow: string; selectAll: string; selected: string; empty: string };
  toolbar?: ReactNode;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => (!filter || r.filter === filter) && (!needle || r.search.toLowerCase().includes(needle)));
  }, [rows, q, filter]);
  const allPicked = shown.length > 0 && shown.every((r) => picked.has(r.id));
  const toggle = (id: string) => setPicked((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {toolbar}
        <label className="relative ms-auto flex min-w-0 flex-1 basis-48 sm:max-w-64">
          <span className="sr-only">{labels.search}</span>
          <Search className="pointer-events-none absolute start-4 top-1/2 size-4 -translate-y-1/2 text-gp-muted" aria-hidden />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={labels.search}
            className="h-11 w-full rounded-full border border-gp-line bg-gp-card ps-10 pe-4 text-sm outline-none placeholder:text-gp-muted focus-visible:ring-2 focus-visible:ring-gp-accent"
          />
        </label>
        {filters && filters.length > 0 && (
          <label className="relative flex">
            <span className="sr-only">{labels.filter}</span>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="h-11 appearance-none rounded-full border border-gp-line bg-gp-card ps-4 pe-10 text-sm outline-none focus-visible:ring-2 focus-visible:ring-gp-accent"
            >
              <option value="">{labels.all}</option>
              {filters.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
            <ListFilter className="pointer-events-none absolute end-4 top-1/2 size-4 -translate-y-1/2 text-gp-muted" aria-hidden />
          </label>
        )}
      </div>
      {picked.size > 0 && <p className="mb-2 text-[13px] text-gp-muted" role="status">{fmt(labels.selected, { n: picked.size })}</p>}
      <div className="overflow-x-auto rounded-[18px] bg-gp-panel p-1.5">
        <table className="w-full min-w-[720px] border-separate border-spacing-0 text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="text-[13px] text-gp-muted">
              <th scope="col" className="w-10 px-3 py-3 text-start">
                <input type="checkbox" checked={allPicked} onChange={() => setPicked(allPicked ? new Set() : new Set(shown.map((r) => r.id)))} aria-label={labels.selectAll} className="size-4 accent-[var(--gp-accent)]" />
              </th>
              {columns.map((c) => (
                <th key={c.key} scope="col" className={cn("px-3 py-3 text-start font-medium whitespace-nowrap", c.className)}>{c.header}</th>
              ))}
            </tr>
          </thead>
          <tbody className="[&>tr>td]:bg-gp-card [&>tr:first-child>td:first-child]:rounded-ss-[14px] [&>tr:first-child>td:last-child]:rounded-se-[14px] [&>tr:last-child>td:first-child]:rounded-es-[14px] [&>tr:last-child>td:last-child]:rounded-ee-[14px]">
            {shown.length === 0 && (
              <tr>
                <td colSpan={columns.length + 1} className="px-3 py-10 text-center text-gp-muted">{labels.empty}</td>
              </tr>
            )}
            {shown.map((r) => (
              <tr
                key={r.id}
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest("a,button,input,label")) return;
                  router.push(r.href);
                }}
                className="group cursor-pointer [&>td]:border-t [&>td]:border-gp-line [&>td]:transition-colors [&>td]:duration-150 hover:[&>td]:bg-gp-hover first:[&>td]:border-t-0"
              >
                <td className="px-3 py-3">
                  <input type="checkbox" checked={picked.has(r.id)} onChange={() => toggle(r.id)} aria-label={fmt(labels.selectRow, { n: r.linkLabel })} className="size-4 accent-[var(--gp-accent)]" />
                </td>
                {columns.map((c, i) => (
                  <td key={c.key} className={cn("px-3 py-3 align-middle", c.className)}>
                    {i === 0 ? (
                      <Link href={r.href} className="rounded-full font-medium hover:underline">{r.cells[c.key]}</Link>
                    ) : (
                      r.cells[c.key]
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
