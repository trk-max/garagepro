"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, LayoutDashboard, X } from "lucide-react";
import { toast } from "sonner";
import { saveDashboardLayoutAction } from "@/actions/dashboard";
import { Toggle } from "@/components/ui/redesign/toggle";
import type { BlockId, LayoutEntry } from "@/lib/dashboard-layout";
import { fmt } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

/**
 * V10.3 — "Personnaliser" pill + edit panel of the overview: show / hide each block the user may
 * see, move it up / down (buttons, keyboard accessible), reset to the default, save.
 * Only the blocks passed here (= allowed by the user's effective permissions) are offered.
 * Saved for the signed-in user only (saveDashboardLayoutAction), then the page is re-rendered.
 */
export function DashboardCustomizer({ layout, defaults }: { layout: LayoutEntry[]; defaults: BlockId[] }) {
  const { t } = useI18n();
  const d = t.v103.dash;
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const [items, setItems] = useState<LayoutEntry[]>(layout);
  const [focus, setFocus] = useState<{ id: BlockId; dir: "up" | "down" } | null>(null);
  const [pending, startTransition] = useTransition();

  // Keep the keyboard focus on the arrow of the block that just moved.
  useEffect(() => {
    if (!focus) return;
    const btn = listRef.current?.querySelector<HTMLButtonElement>(`[data-block="${focus.id}"][data-dir="${focus.dir}"]`);
    if (btn && !btn.disabled) btn.focus();
    else listRef.current?.querySelector<HTMLButtonElement>(`[data-block="${focus.id}"]:not(:disabled)`)?.focus();
  }, [focus, items]);

  const open = () => {
    setItems(layout);
    ref.current?.showModal();
  };
  const move = (index: number, dir: "up" | "down") => {
    const to = dir === "up" ? index - 1 : index + 1;
    if (to < 0 || to >= items.length) return;
    const next = [...items];
    [next[index], next[to]] = [next[to]!, next[index]!];
    setItems(next);
    setFocus({ id: items[index]!.id, dir });
  };
  const isDefault = (list: LayoutEntry[]) => list.length === defaults.length && list.every((e, i) => e.visible && e.id === defaults[i]);
  const save = () =>
    startTransition(async () => {
      const result = await saveDashboardLayoutAction(isDefault(items) ? null : items);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(d.saved);
      ref.current?.close();
      router.refresh();
    });

  return (
    <>
      <button
        type="button"
        onClick={open}
        aria-haspopup="dialog"
        className="gp-lift inline-flex h-11 items-center gap-2 rounded-full border border-gp-line bg-gp-card px-5 text-sm font-medium whitespace-nowrap hover:bg-gp-hover"
      >
        <LayoutDashboard className="size-4" aria-hidden /> {d.customize}
      </button>
      <dialog
        ref={ref}
        aria-labelledby="dash-edit-title"
        onClick={(e) => e.target === e.currentTarget && ref.current?.close()}
        className="gp-enter m-auto max-h-[calc(100dvh-2rem)] w-[min(34rem,calc(100vw-1.5rem))] rounded-[28px] border border-gp-line bg-gp-card p-0 text-gp-ink shadow-2xl backdrop:bg-black/40 backdrop:backdrop-blur-sm"
      >
        <div className="sticky top-0 z-10 flex items-start gap-3 bg-gp-card p-5 pb-3">
          <div className="min-w-0 flex-1">
            <h2 id="dash-edit-title" className="text-xl font-semibold tracking-tight">{d.title}</h2>
            <p className="mt-1 text-[13px] text-gp-muted">{d.hint}</p>
          </div>
          <button type="button" onClick={() => ref.current?.close()} aria-label={d.cancel} className="grid size-10 shrink-0 place-items-center rounded-full bg-gp-panel hover:bg-gp-hover">
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <ol ref={listRef} className="space-y-2 px-5">
          {items.map((e, i) => {
            const name = d.blocks[e.id];
            return (
              <li key={e.id} className={cn("flex items-center gap-3 rounded-[18px] bg-gp-panel px-3 py-2.5", !e.visible && "opacity-70")}>
                <Toggle checked={e.visible} label={fmt(d.show, { name })} onChange={(v) => setItems(items.map((x) => (x.id === e.id ? { ...x, visible: v } : x)))} />
                <span className="min-w-0 flex-1 text-sm font-medium">
                  {name}
                  {!e.visible && <span className="ms-2 text-xs font-normal text-gp-muted">{d.hidden}</span>}
                </span>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    data-block={e.id}
                    data-dir="up"
                    disabled={i === 0}
                    onClick={() => move(i, "up")}
                    aria-label={fmt(d.up, { name })}
                    className="grid size-10 place-items-center rounded-full bg-gp-card hover:bg-gp-hover disabled:opacity-30"
                  >
                    <ArrowUp className="size-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    data-block={e.id}
                    data-dir="down"
                    disabled={i === items.length - 1}
                    onClick={() => move(i, "down")}
                    aria-label={fmt(d.down, { name })}
                    className="grid size-10 place-items-center rounded-full bg-gp-card hover:bg-gp-hover disabled:opacity-30"
                  >
                    <ArrowDown className="size-4" aria-hidden />
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
        <div className="sticky bottom-0 mt-3 flex flex-wrap items-center gap-2 bg-gp-card p-5 pt-3">
          <button
            type="button"
            onClick={() => setItems(defaults.map((id) => ({ id, visible: true })))}
            className="inline-flex h-11 items-center rounded-full border border-gp-line px-5 text-sm font-medium hover:bg-gp-hover"
          >
            {d.reset}
          </button>
          <span className="flex-1" />
          <button type="button" onClick={() => ref.current?.close()} className="inline-flex h-11 items-center rounded-full bg-gp-panel px-5 max-sm:hidden text-sm font-medium hover:bg-gp-hover">
            {d.cancel}
          </button>
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="inline-flex h-11 items-center rounded-full bg-gp-primary px-5 text-sm font-medium text-gp-primary-ink hover:opacity-90 disabled:opacity-60"
          >
            {d.save}
          </button>
        </div>
      </dialog>
    </>
  );
}
