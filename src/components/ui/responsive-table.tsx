"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Table that turns into stacked cards on phones (< 640px).
 *
 * Each body cell gets a `data-label` copied from its column header, and the
 * CSS in globals.css (`.rtable`) shows that label in front of the value when
 * the screen is narrow. On tablets and computers it is a normal table that
 * scrolls sideways if it is too wide. Cells under an empty header (action
 * buttons…) get no label.
 */
export function ResponsiveTable({ className, ...props }: React.ComponentProps<"table">) {
  const ref = React.useRef<HTMLTableElement>(null);

  React.useLayoutEffect(() => {
    const table = ref.current;
    if (!table) return;
    labelCells(table);
    // Rows can change without a reload (live refresh, filters): label them again.
    const observer = new MutationObserver(() => labelCells(table));
    observer.observe(table, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return (
    <div className="rtable-wrap overflow-x-auto rounded-lg border bg-card">
      <table ref={ref} className={cn("rtable w-full text-sm [&_tbody_tr]:transition-colors [&_tbody_tr:hover]:bg-accent/50", className)} {...props} />
    </div>
  );
}

function labelCells(table: HTMLTableElement) {
  const headers = Array.from(table.querySelectorAll<HTMLTableCellElement>(":scope > thead > tr:last-child > th"));
  // Column index → header text (a header with colSpan covers several columns).
  const labels: string[] = [];
  for (const th of headers) {
    const text = th.textContent?.trim() ?? "";
    for (let i = 0; i < (th.colSpan || 1); i++) labels.push(text);
  }
  for (const row of Array.from(table.querySelectorAll<HTMLTableRowElement>(":scope > tbody > tr"))) {
    let col = 0;
    for (const cell of Array.from(row.cells)) {
      const label = cell.colSpan > 1 ? "" : (labels[col] ?? "");
      if (label) {
        if (cell.getAttribute("data-label") !== label) cell.setAttribute("data-label", label);
      } else if (cell.hasAttribute("data-label")) {
        cell.removeAttribute("data-label");
      }
      col += cell.colSpan || 1;
    }
  }
}
