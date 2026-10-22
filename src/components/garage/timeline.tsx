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
      // V16: a line of the accepted quote is voided (kept), not deleted.
      return fmt(e.type === "LINE_REMOVED" && d.voided ? t.v16.events.lineVoided : t.events[e.type], { description: str(d.description) });
    case "PACKAGE_APPLIED":
      return fmt(t.events.PACKAGE_APPLIED, { name: str(d.name) });
    case "INVOICED":
      return fmt(t.events.INVOICED, { number: str(d.number) });
    case "PAYMENT":
      return fmt(t.events.PAYMENT, { amount: formatMoney(typeof d.amount === "number" ? d.amount : 0, lang) });
    // V16 Lot 2: decision on a versioned quote (portal or staff), with its number and the accepted amount.
    case "QUOTE_APPROVED":
      return typeof d.decision === "string" && d.decision in t.v16.quote.decision
        ? fmt(t.v16.quote.events.decided, {
            number: str(d.number),
            decision: t.v16.quote.decision[d.decision as keyof Dictionary["v16"]["quote"]["decision"]],
            amount: formatMoney(typeof d.amount === "number" ? d.amount : 0, lang),
          })
        : t.events.QUOTE_APPROVED;
    case "NOTE": {
      // V16 Lot 3: date changes, parts received, « keep / hand back » decision, signed safety waiver.
      const l3 = t.v16.lot3;
      const reasonOf = (v: unknown) => (typeof v === "string" && v in l3.reasons ? l3.reasons[v as keyof typeof l3.reasons] : "");
      const day = (v: unknown) => (typeof v === "string" ? formatDateTime(v, lang) : l3.promise.noDate);
      if (d.promiseRevised)
        return d.partNeedId
          ? fmt(l3.promise.eventPart, { part: str(d.part), old: day(d.old), new: day(d.new), reason: reasonOf(d.promiseReason) })
          : fmt(l3.promise.event, { old: day(d.old), new: day(d.new), reason: reasonOf(d.promiseReason) });
      if (d.partReceived) return fmt(l3.parts.received, { part: str(d.part), number: str(d.receipt) });
      if (typeof d.partsWait === "string" && d.partsWait in l3.parts.decision)
        return fmt(l3.parts.eventDecision, { decision: l3.parts.decision[d.partsWait as keyof typeof l3.parts.decision] });
      if (d.safetyWaiver) return fmt(l3.refusal.events.waiver, { n: Array.isArray(d.lineIds) ? d.lineIds.length : 0 });
      return d.quoteSent
        ? fmt(t.v16.quote.events.sent, {
            kind: (d.kind === "SUPPLEMENT" ? t.v16.quote.kind.SUPPLEMENT : t.v16.quote.kind.INITIAL).toLowerCase(),
            number: str(d.number),
            version: typeof d.version === "number" ? d.version : 1,
            amount: formatMoney(typeof d.totalTtc === "number" ? d.totalTtc : 0, lang),
          })
        : t.events.NOTE;
    }
    default:
      return t.events[e.type];
  }
}

/** V16 — internal details of an event (staff only, never on the portal): reason, delivery override, automatic closing. */
export function eventDetails(e: Pick<WorkOrderEvent, "data">, t: Dictionary, lang: Lang): string[] {
  const d = (e.data ?? {}) as Record<string, unknown>;
  const out: string[] = [];
  if (d.override) out.push(fmt(t.v16.events.override, { amount: formatMoney(typeof d.balanceDue === "number" ? d.balanceDue : 0, lang) }));
  if (typeof d.reason === "string" && d.reason) out.push(fmt(t.v16.events.reason, { reason: d.reason }));
  if (d.auto) out.push(t.v16.events.auto);
  // V16 Lot 3
  if (d.autoParts) out.push(t.v16.lot3.parts.autoWaiting);
  if (typeof d.refusedLines === "number") out.push(fmt(t.v16.lot3.refusal.events.refusedLines, { n: d.refusedLines }));
  if (d.reassembled === true) out.push(t.v16.lot3.refusal.events.reassembled);
  if (d.reassembled === false) out.push(t.v16.lot3.refusal.events.notReassembled);
  if (d.announcedFee) out.push(t.v16.lot3.refusal.announcedFee);
  if (d.partsWait && d.garageCaused) out.push(t.v16.lot3.parts.garageCaused);
  return out;
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
            {eventDetails(e, t, lang).map((x) => (
              <p key={x} className="mt-0.5 text-xs text-gp-accent-ink">
                {x}
              </p>
            ))}
            {e.body && <p className="mt-1 whitespace-pre-line rounded-md bg-amber-50 px-3 py-2 dark:bg-amber-950/30">{e.body}</p>}
            <time className="text-xs text-muted-foreground">{formatDateTime(e.createdAt, lang)}</time>
          </div>
        </li>
      ))}
    </ol>
  );
}
