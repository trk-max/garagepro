import { addExpenseAction, voidExpenseAction } from "@/actions/profit";
import { ActionForm } from "@/components/action-form";
import { ReasonButton } from "@/components/team/prompt-action";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, Field, NativeSelect } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { minutesToHours } from "@/lib/attendance";
import { formatDateTime, formatMoney, type Lang } from "@/lib/format";
import type { Dictionary } from "@/lib/i18n/fr";
import { can } from "@/lib/permissions";
import type { Profit } from "@/lib/profit";
import type { StaffUser } from "@/lib/session";
import { cn } from "@/lib/utils";
import { listExpenses, workOrderProfit } from "@/server/profit";
import { supplierOptions } from "@/server/purchasing";

/** Percentage from basis points, e.g. 4550 → "45,5 %". */
export const pct = (bp: number | null, lang: Lang) => (bp === null ? "—" : `${(bp / 100).toLocaleString(lang === "ar" ? "ar-TN" : lang === "en" ? "en-GB" : "fr-FR", { maximumFractionDigits: 1 })} %`);

/** Profit breakdown lines, shared by the repair card and the report. */
export function ProfitRows({ p, t, lang }: { p: Profit; t: Dictionary; lang: Lang }) {
  const v = t.v7.profit;
  const m = (n: number) => formatMoney(n, lang);
  const rows: [string, string, string?][] = [
    [v.revenue, m(p.revenue)],
    [v.partsCost, `− ${m(p.partsCost)}`],
    [v.expenses, `− ${m(p.expenses)}`],
    [v.grossMargin, m(p.grossMargin), "font-semibold border-t"],
    [`${v.laborCost} (${minutesToHours(p.laborMinutes)} ${v.personHours})`, `− ${m(p.laborCost)}`],
    [v.overhead, `− ${m(p.overhead)}`],
    [v.profit, m(p.profit), cn("font-semibold border-t text-base", p.profit < 0 && "text-red-600 dark:text-red-400")],
    [v.margin, pct(p.marginBp, lang)],
  ];
  return (
    <dl className="text-sm">
      {rows.map(([label, value, cls]) => (
        <div key={label} className={cn("flex justify-between gap-3 py-1", cls)}>
          <dt>{label}</dt>
          <dd className="tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ProfitFlags({ p, t }: { p: Profit; t: Dictionary }) {
  if (p.flags.length === 0) return null;
  return (
    <ul className="mt-2 space-y-1 border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
      <li className="font-semibold">{t.v7.profit.estimated}</li>
      {p.flags.map((f) => (
        <li key={f}>• {t.v7.profit.flags[f]}</li>
      ))}
    </ul>
  );
}

/** Work order page: direct expenses (manager) and real profit (administrator). */
export async function ProfitPanel({ workOrderId, staff, t, lang }: { workOrderId: string; staff: StaffUser; t: Dictionary; lang: Lang }) {
  const showProfit = can(staff, "viewProfit");
  const canExpense = can(staff, "manageExpenses");
  if (!showProfit && !canExpense) return null;
  const [expenses, profit, suppliers] = await Promise.all([listExpenses(workOrderId), showProfit ? workOrderProfit(workOrderId) : null, canExpense ? supplierOptions() : []]);
  const v = t.v7.profit;
  return (
    <Card>
      <CardTitle>{showProfit ? v.title : v.expensesTitle}</CardTitle>
      {profit && (
        <div className="mb-5">
          <ProfitRows p={profit} t={t} lang={lang} />
          <p className="mt-2 text-xs text-muted-foreground">
            {v.collected} : {formatMoney(profit.collected.total, lang)} ({v.customer} {formatMoney(profit.collected.customer, lang)} · {v.insurance}{" "}
            {formatMoney(profit.collected.insurance, lang)}) — {v.collectedHint}
          </p>
          <ProfitFlags p={profit} t={t} />
        </div>
      )}

      <p className="label-tech mb-2">{v.expensesTitle}</p>
      {expenses.length === 0 ? (
        <p className="mb-3 text-sm text-muted-foreground">{v.noExpenses}</p>
      ) : (
        <ul className="mb-3 divide-y text-sm">
          {expenses.map((e) => (
            <li key={e.id} className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 py-2", e.voidedAt && "text-muted-foreground line-through")}>
              <span className="font-medium">{e.description}</span>
              {e.supplier && <span className="text-xs">{e.supplier.name}</span>}
              <span className="text-xs text-muted-foreground">{formatDateTime(e.createdAt, lang)}</span>
              <span className="ms-auto tabular-nums">{formatMoney(e.amount, lang)}</span>
              {e.voidedAt ? (
                <span className="w-full text-xs no-underline">
                  ({v.voided} : {e.voidReason})
                </span>
              ) : (
                canExpense && (
                  <ReasonButton className="h-6" question={v.voidReason} action={voidExpenseAction.bind(null, e.id)}>
                    {v.void}
                  </ReasonButton>
                )
              )}
            </li>
          ))}
        </ul>
      )}
      {canExpense && (
        <ActionForm action={addExpenseAction.bind(null, workOrderId)} className="grid gap-2 sm:grid-cols-[1fr_8rem]">
          <Field label={v.expenseDescription} className="sm:col-span-2">
            <Input name="description" required minLength={2} maxLength={200} placeholder={v.expensePlaceholder} />
          </Field>
          <Field label={`${v.expenseAmount} (DT)`}>
            <Input name="amount" inputMode="decimal" required dir="ltr" />
          </Field>
          <Field label={v.expenseSupplier}>
            <NativeSelect name="supplierId" defaultValue="">
              <option value="">—</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <div className="sm:col-span-2">
            <Button type="submit" variant="outline">
              {v.addExpense}
            </Button>
          </div>
        </ActionForm>
      )}
    </Card>
  );
}
