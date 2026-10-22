import { Download } from "lucide-react";
import { PlateChip } from "@/components/garage/badges";
import { nameOf } from "@/components/agenda/agenda-ui";
import { Card, CardTitle } from "@/components/ui/field";
import { fmt, formatDate, formatKm, formatMoney, type Lang } from "@/lib/format";
import type { Dictionary } from "@/lib/i18n/fr";
import type { companyAgenda } from "@/server/agenda";

type Plan = Awaited<ReturnType<typeof companyAgenda>>;

export const monthKeyOf = (d: Date | null) => (d ? d.toISOString().slice(0, 7) : "");

/** Company portal: maintenance plan of the whole fleet, by month, indicative cost (only for roles that see amounts), export. */
export function CompanyPlan({ plan, t, lang }: { plan: Plan; t: Dictionary; lang: Lang }) {
  const c = t.v12.company;
  const months = new Map<string, Plan["rows"]>();
  for (const r of plan.rows) months.set(monthKeyOf(r.dueDate), [...(months.get(monthKeyOf(r.dueDate)) ?? []), r]);
  const label = (key: string) =>
    key ? new Intl.DateTimeFormat(lang === "ar" ? "ar-TN" : lang === "en" ? "en-GB" : "fr-FR", { month: "long", year: "numeric", timeZone: "UTC", numberingSystem: "latn" }).format(new Date(`${key}-15T12:00:00Z`)) : c.noDate;
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2">
        <CardTitle>{c.title}</CardTitle>
        <span className="ms-auto flex gap-2">
          <a href="/api/entreprise/agenda?format=xlsx" className="inline-flex h-9 items-center gap-1 rounded-full border px-3 text-xs">
            <Download className="size-3.5" aria-hidden /> {c.export}
          </a>
          <a href="/api/entreprise/agenda?format=csv" className="inline-flex h-9 items-center gap-1 rounded-full border px-3 text-xs">
            <Download className="size-3.5" aria-hidden /> {c.exportCsv}
          </a>
        </span>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">{c.hint}</p>
      {plan.rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{c.none}</p>
      ) : (
        <div className="space-y-4">
          {[...months.entries()].map(([key, rows]) => {
            const total = rows.reduce((s, r) => s + (r.priceTtc ?? 0), 0);
            return (
              <div key={key || "none"}>
                <div className="flex flex-wrap items-baseline gap-2 border-b pb-1">
                  <h3 className="font-semibold capitalize">{label(key)}</h3>
                  {plan.money && total > 0 && (
                    <span className="ms-auto text-xs text-muted-foreground" dir="ltr">
                      {fmt(c.monthTotal, { amount: formatMoney(total, lang) })}
                    </span>
                  )}
                </div>
                <ul className="divide-y text-sm">
                  {rows.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                      <PlateChip plate={r.vehicle.plate} />
                      <span className="font-medium">{nameOf(r.item, lang)}</span>
                      <span className="text-muted-foreground">{r.dueDate ? formatDate(r.dueDate, lang) : formatKm(r.dueKm, lang)}</span>
                      <span className="rounded-full bg-muted px-2 text-xs">{t.v12.estimate}</span>
                      {plan.money && r.priceTtc !== null && (
                        <span className="ms-auto text-xs" dir="ltr">
                          {formatMoney(r.priceTtc, lang)}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
