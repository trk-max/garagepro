import Link from "next/link";
import { CalendarCheck2, PackagePlus } from "lucide-react";
import { Chip, type ChipTone } from "@/components/ui/redesign/chip";
import { EmptyState, PillLink, Surface, SurfaceHeader } from "@/components/ui/redesign/surface";
import { displayPlate, fmt, formatDate, formatKm, formatMoney, formatQty, type Lang } from "@/lib/format";
import type { Dictionary } from "@/lib/i18n/fr";
import type { MissingKey } from "@/lib/agenda";

/** Shared display helpers of the agenda (server components). Every due date is labelled "estimation". */

type Named = { nameFr: string; nameAr: string | null; nameEn: string | null };
export const nameOf = (item: Named, lang: Lang) => (lang === "ar" ? item.nameAr : lang === "en" ? item.nameEn : null) || item.nameFr;

const CONF_TONE: Record<string, ChipTone> = { GOOD: "success", MEDIUM: "accent", LOW: "neutral" };
const STATUS_TONE: Record<string, ChipTone> = { PROPOSED: "neutral", VALIDATED: "accent", SENT: "accent", BOOKED: "success", DONE: "success", IGNORED: "neutral" };

export function ConfidenceChip({ value, t }: { value: string | null; t: Dictionary }) {
  if (!value) return <Chip tone="danger">{t.v12.method.IMPOSSIBLE}</Chip>;
  const c = t.v12.confidence[value as keyof Dictionary["v12"]["confidence"]] ?? value;
  return <Chip tone={CONF_TONE[value] ?? "neutral"}>{fmt(t.v12.confidenceLabel, { level: c })}</Chip>;
}

export function StatusChip({ value, t }: { value: string; t: Dictionary }) {
  return <Chip tone={STATUS_TONE[value] ?? "neutral"}>{t.v12.status[value as keyof Dictionary["v12"]["status"]] ?? value}</Chip>;
}

export type DueLike = { dueDate: Date | null; dueKm: number | null; dueKmLow: number | null; dueKmHigh: number | null; dueDateLow: Date | null; dueDateHigh: Date | null; method: string; missing: unknown };

export const missingText = (missing: unknown, t: Dictionary) =>
  (Array.isArray(missing) ? (missing as MissingKey[]) : []).map((m) => t.v12.missing[m] ?? m).join(", ");

/** "12 janv. 2027 · vers 54 000 km (estimation)", or "estimation impossible: …". */
export function DueText({ f, t, lang }: { f: DueLike; t: Dictionary; lang: Lang }) {
  if (f.method === "IMPOSSIBLE") return <span className="text-gp-danger-ink">{fmt(t.v12.impossible, { missing: missingText(f.missing, t) })}</span>;
  return (
    <span>
      {f.dueDate && <span className="font-medium">{formatDate(f.dueDate, lang)}</span>}
      {f.dueDate && f.dueKm !== null && " · "}
      {f.dueKm !== null && <span dir="ltr">{fmt(t.v12.aroundKm, { km: formatKm(f.dueKm, lang) })}</span>}{" "}
      <span className="text-xs text-gp-muted">({t.v12.estimate})</span>
    </span>
  );
}

export function RangeText({ f, t, lang }: { f: DueLike; t: Dictionary; lang: Lang }) {
  if (f.dueDateLow && f.dueDateHigh && f.dueDateLow.getTime() !== f.dueDateHigh.getTime()) return <>{fmt(t.v12.range, { low: formatDate(f.dueDateLow, lang), high: formatDate(f.dueDateHigh, lang) })}</>;
  if (f.dueKmLow !== null && f.dueKmHigh !== null && f.dueKmLow !== f.dueKmHigh) return <span dir="ltr">{fmt(t.v12.range, { low: formatKm(f.dueKmLow, lang), high: formatKm(f.dueKmHigh, lang) })}</span>;
  return null;
}

export const priceText = (priceTtc: number | null, lang: Lang, t: Dictionary) => (priceTtc === null ? t.v12.noPrice : formatMoney(priceTtc, lang));

type DashRow = { id: string; dueDate: Date | null; dueKm: number | null; item: Named; vehicle: { id: string; plate: string } };
type DashPart = { id: string; sku: string; name: string; unit: string; neededX100: number; availableX100: number };

/** Dashboard block (V10.3 personal layout): due within 30 days + parts to order in advance. */
export function AgendaDashCard({ t, lang, count, rows, parts, canOrder }: { t: Dictionary; lang: Lang; count: number; rows: DashRow[]; parts: DashPart[] | null; canOrder: boolean }) {
  const v = t.v12;
  return (
    <Surface aria-labelledby="ov-agenda">
      <SurfaceHeader id="ov-agenda" title={t.v103.dash.blocks.agenda} hint={fmt(v.dueSoon, { n: count })}>
        <PillLink href="/garage/agenda?to=30" variant="outline" className="h-10">
          {v.nav}
        </PillLink>
      </SurfaceHeader>
      <div className="grid gap-4 md:grid-cols-2">
        {rows.length === 0 ? (
          <EmptyState icon={CalendarCheck2} title={v.empty} />
        ) : (
          <ul className="-mx-2">
            {rows.map((r) => (
              <li key={r.id}>
                <Link href={`/garage/vehicules/${r.vehicle.id}/entretien`} className="flex min-h-12 items-center gap-3 rounded-[14px] px-3 py-2 hover:bg-gp-hover">
                  <span className="font-mono text-xs" dir="ltr">{displayPlate(r.vehicle.plate)}</span>
                  <span className="min-w-0 flex-1 truncate text-[13px]">{nameOf(r.item, lang)}</span>
                  <span className="text-xs text-gp-muted">{r.dueDate ? formatDate(r.dueDate, lang) : formatKm(r.dueKm, lang)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {parts && (
          <div>
            <p className="mb-2 text-sm font-medium">{v.parts.title}</p>
            {parts.length === 0 ? (
              <p className="text-[13px] text-gp-muted">{v.parts.none}</p>
            ) : (
              <ul className="space-y-1 text-[13px]">
                {parts.slice(0, 5).map((p) => (
                  <li key={p.id} className="flex items-center gap-2">
                    <PackagePlus className="size-4 text-gp-muted" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-mono text-xs text-gp-muted">{p.sku}</span> {p.name}
                    </span>
                    <span className="text-xs tabular-nums" dir="ltr">
                      {fmt(v.parts.line, { need: formatQty(p.neededX100, lang), available: formatQty(p.availableX100, lang) })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {canOrder && parts.length > 0 && (
              <PillLink href="/garage/purchase-orders/new" variant="outline" className="mt-3 h-10">
                {v.parts.order}
              </PillLink>
            )}
            <p className="mt-2 text-xs text-gp-muted">{v.parts.hint}</p>
          </div>
        )}
      </div>
    </Surface>
  );
}
