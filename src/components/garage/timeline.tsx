import type { WorkOrderEvent } from "@prisma/client";
import { fmt, formatDateTime, formatMoney, type Lang } from "@/lib/format";
import type { Dictionary } from "@/lib/i18n/fr";

type EventWithActor = WorkOrderEvent & { actor: { name: string } | null };

/** One line describing a repair-order event (also used by the dashboard activity feed). */
export function describeEvent(e: Pick<WorkOrderEvent, "type" | "data">, t: Dictionary, lang: Lang): string {
  const d = (e.data ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const statusLabel = (v: unknown) => (typeof v === "string" && v in t.status ? t.status[v as keyof Dictionary["status"]] : str(v));
  switch (e.type) {
    case "STATUS_CHANGED":
      return fmt(t.events.STATUS_CHANGED, { from: statusLabel(d.from), to: statusLabel(d.to) });
    case "ASSIGNED":
      return d.to ? fmt(t.events.ASSIGNED, { to: str(d.to) }) : t.events.UNASSIGNED;
    case "LINE_ADDED":
    case "LINE_REMOVED":
      return fmt(t.events[e.type], { description: str(d.description) });
    case "PACKAGE_APPLIED":
      return fmt(t.events.PACKAGE_APPLIED, { name: str(d.name) });
    case "INVOICED":
      return fmt(t.events.INVOICED, { number: str(d.number) });
    case "PAYMENT":
      return fmt(t.events.PAYMENT, { amount: formatMoney(typeof d.amount === "number" ? d.amount : 0, lang) });
    default:
      return t.events[e.type];
  }
}

export function Timeline({ events, t, lang }: { events: EventWithActor[]; t: Dictionary; lang: Lang }) {
  return (
    <ol className="space-y-3">
      {events.map((e) => (
        <li key={e.id} className="flex gap-3 text-sm">
          <span className={`mt-1.5 size-2 shrink-0 rounded-full ${e.type === "NOTE" ? "bg-amber-500" : "bg-border"}`} aria-hidden />
          <div className="min-w-0 flex-1">
            <p>
              <span className="font-medium">
                {e.actor?.name ?? (e.type === "CUSTOMER_MESSAGE" || e.type === "QUOTE_APPROVED" ? t.events.customer : t.events.system)}
              </span>{" "}
              <span className="text-muted-foreground">{describeEvent(e, t, lang)}</span>
            </p>
            {e.body && <p className="mt-1 whitespace-pre-line rounded-md bg-amber-50 px-3 py-2 dark:bg-amber-950/30">{e.body}</p>}
            <time className="text-xs text-muted-foreground">{formatDateTime(e.createdAt, lang)}</time>
          </div>
        </li>
      ))}
    </ol>
  );
}
