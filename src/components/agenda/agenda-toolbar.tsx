"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { agendaBulkAction, recomputeAgendaAction } from "@/actions/agenda";
import { Button } from "@/components/ui/button";
import { fmt } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";

/**
 * Bulk actions of the Agenda page. The rows stay server-rendered; each selectable row has an
 * <input type="checkbox" name="forecast" value="…">, read here when a button is pressed.
 */
export function AgendaSelection({ canManage, children }: { canManage: boolean; children: ReactNode }) {
  const { t } = useI18n();
  const v = t.v12;
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);
  const [count, setCount] = useState(0);
  const [pending, start] = useTransition();
  const checked = () => [...(box.current?.querySelectorAll<HTMLInputElement>('input[name="forecast"]:checked') ?? [])].map((i) => i.value);

  const run = (fn: (ids: string[]) => Promise<{ ok: true; data: { message: string } } | { ok: false; error: string }>) => {
    const ids = checked();
    if (ids.length === 0) return toast.error(v.actions.none);
    start(async () => {
      const r = await fn(ids);
      if (!r.ok) toast.error(r.error);
      else {
        toast.success(r.data.message);
        router.refresh();
      }
    });
  };

  return (
    <div ref={box} onChange={() => setCount(checked().length)}>
      {canManage && (
        <div className="sticky top-0 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-[18px] border border-gp-line bg-gp-card/95 p-2 shadow-gp backdrop-blur">
          <label className="flex min-h-10 items-center gap-2 px-2 text-sm">
            <input
              type="checkbox"
              className="size-4"
              aria-label={v.actions.selectAll}
              onChange={(e) => {
                for (const i of box.current?.querySelectorAll<HTMLInputElement>('input[name="forecast"]') ?? []) i.checked = e.target.checked;
                setCount(checked().length);
              }}
            />
            {v.actions.selectAll}
          </label>
          <span className="text-xs text-gp-muted">{fmt(v.actions.selected, { n: count })}</span>
          <span className="ms-auto flex flex-wrap gap-2">
            <Button size="sm" disabled={pending} onClick={() => run((ids) => agendaBulkAction("validate", ids))}>
              {v.actions.validate}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() => {
                const ids = checked();
                if (ids.length === 0) return toast.error(v.actions.none);
                router.push(`/garage/agenda/messages?ids=${ids.join(",")}`);
              }}
            >
              {v.actions.prepare}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => {
                const reason = window.prompt(v.actions.ignoreReason)?.trim();
                if (reason) run((ids) => agendaBulkAction("ignore", ids, reason));
              }}
            >
              {v.actions.ignore}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await recomputeAgendaAction();
                  if (!r.ok) toast.error(r.error);
                  else {
                    toast.success(r.data.message);
                    router.refresh();
                  }
                })
              }
            >
              {v.actions.recompute}
            </Button>
          </span>
        </div>
      )}
      {children}
    </div>
  );
}
