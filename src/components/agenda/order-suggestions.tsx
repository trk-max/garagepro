import { CalendarCheck2, Plus } from "lucide-react";
import { addForecastToOrderAction } from "@/actions/agenda";
import { ActionButton } from "@/components/action-form";
import { ConfidenceChip, DueText, nameOf, priceText } from "@/components/agenda/agenda-ui";
import { Card, CardTitle } from "@/components/ui/field";
import { fmt, formatDate, type Lang } from "@/lib/format";
import type { Dictionary } from "@/lib/i18n/fr";
import { can } from "@/lib/permissions";
import type { StaffUser } from "@/lib/session";
import { suggestionsForOrder } from "@/server/agenda";

/** Work order page: "À faire aussi sur cette voiture" — upcoming forecasts, one-click add to the quote. */
export async function OrderSuggestions({ workOrderId, locked, staff, t, lang }: { workOrderId: string; locked: boolean; staff: StaffUser; t: Dictionary; lang: Lang }) {
  if (!can(staff, "viewAgenda")) return null;
  const rows = await suggestionsForOrder(workOrderId);
  if (rows.length === 0) return null;
  const v = t.v12;
  const canAdd = can(staff, "manageAgenda") && !locked;
  const seePrice = can(staff, "viewFinance") || can(staff, "printQuote");
  return (
    <Card>
      <CardTitle>
        <span className="inline-flex items-center gap-2">
          <CalendarCheck2 className="size-4" aria-hidden /> {v.order.title}
        </span>
      </CardTitle>
      <p className="mb-3 text-xs text-muted-foreground">{v.order.hint}</p>
      <ul className="divide-y text-sm" data-testid="order-suggestions">
        {rows.map((f) => {
          const linked = f.item.packageIds.length > 0 || f.item.partIds.length > 0;
          return (
            <li key={f.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
              <span className="font-medium">{nameOf(f.item, lang)}</span>
              <span className="text-xs">
                <DueText f={f} t={t} lang={lang} />
              </span>
              <ConfidenceChip value={f.confidence} t={t} />
              {f.warrantyUntil && <span className="text-xs text-gp-success-ink">{fmt(v.warranty, { date: formatDate(f.warrantyUntil, lang) })}</span>}
              {seePrice && f.priceTtc !== null && (
                <span className="text-xs" dir="ltr">
                  {priceText(f.priceTtc, lang, t)}
                </span>
              )}
              <span className="ms-auto">
                {canAdd &&
                  (linked ? (
                    <ActionButton size="sm" variant="outline" action={addForecastToOrderAction.bind(null, workOrderId, f.id)} successMessage={v.order.added}>
                      <Plus className="size-4" aria-hidden /> {v.order.add}
                    </ActionButton>
                  ) : (
                    <span className="text-xs text-muted-foreground">{v.order.noLink}</span>
                  ))}
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
