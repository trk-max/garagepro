import { PaymentMethod } from "@prisma/client";
import { cancelOccurrencePaymentAction, createExpenseAction, payOccurrenceAction, setExpenseActiveAction, updateExpenseAction } from "@/actions/expenses";
import { ActionButton, ActionForm } from "@/components/action-form";
import { ReasonButton } from "@/components/team/prompt-action";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, Field, NativeSelect, PageHeader, Textarea } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { dbDay } from "@/lib/expense-schedule";
import { formatDate, formatDay, formatMoney } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { requirePageAccess } from "@/lib/session";
import { cn } from "@/lib/utils";
import { EXPENSE_CATEGORIES, EXPENSE_FREQUENCIES } from "@/lib/validators";
import { expensesOverview } from "@/server/expenses";
import { supplierOptions } from "@/server/purchasing";
import { getSettings } from "@/server/settings";

const dt = (m: number) => (m / 1000).toFixed(3);

/** Fixed and one-off costs, their due dates, and what was paid (administrator + manager). */
export default async function FixedCostsPage() {
  const staff = await requirePageAccess("manageExpenses");
  const [{ t, lang }, o, suppliers, settings] = await Promise.all([getI18n(), expensesOverview(staff), supplierOptions(), getSettings()]);
  const v = t.v7.fixedCosts;
  const day = (d: string) => formatDay(d, lang, { day: "numeric", month: "short", year: "numeric" });
  const methods = Object.values(PaymentMethod);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <PageHeader title={v.title} />
      <p className="text-sm text-muted-foreground">{v.intro}</p>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card>
          <CardTitle>{v.toPay}</CardTitle>
          {o.toPay.length === 0 ? (
            <p className="text-sm text-muted-foreground">{v.nothingToPay}</p>
          ) : (
            <ul className="divide-y text-sm">
              {o.toPay.map((x) => (
                <li key={x.id} className="py-2">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className={cn("tabular-nums", x.overdue && "font-semibold text-red-600 dark:text-red-400")}>{day(x.day)}</span>
                    {x.overdue && <span className="f-label border border-red-600 px-1.5 text-[0.625rem] text-red-700 dark:text-red-400">{v.overdue}</span>}
                    <span className="font-medium">{x.expense.label}</span>
                    <span className="text-xs text-muted-foreground">{v.categories[x.expense.category as keyof typeof v.categories] ?? x.expense.category}</span>
                    <span className="ms-auto tabular-nums">{formatMoney(x.amount, lang)}</span>
                  </div>
                  <details className="mt-1">
                    <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">{v.pay}</summary>
                    <ActionForm action={payOccurrenceAction.bind(null, x.id)} className="mt-2 grid gap-2 sm:grid-cols-4">
                      <Field label={v.paidDay}>
                        <Input name="paidDay" type="date" required dir="ltr" defaultValue={o.today} max={o.today} />
                      </Field>
                      <Field label={v.paidAmount}>
                        <Input name="paidAmount" inputMode="decimal" required dir="ltr" defaultValue={dt(x.amount)} />
                      </Field>
                      <Field label={v.method}>
                        <NativeSelect name="method" defaultValue="TRANSFER">
                          {methods.map((m) => (
                            <option key={m} value={m}>
                              {t.paymentMethod[m]}
                            </option>
                          ))}
                        </NativeSelect>
                      </Field>
                      <Field label={v.reference}>
                        <Input name="reference" maxLength={80} />
                      </Field>
                      <div className="sm:col-span-4">
                        <Button type="submit" size="sm">
                          {v.pay}
                        </Button>
                      </div>
                    </ActionForm>
                  </details>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-muted-foreground">{v.settledHint}</p>
        </Card>

        <Card>
          <CardTitle>{v.add}</CardTitle>
          <ActionForm action={createExpenseAction} className="grid gap-3 sm:grid-cols-2">
            <Field label={v.label} className="sm:col-span-2">
              <Input name="label" required maxLength={120} placeholder={v.labelPlaceholder} />
            </Field>
            <Field label={v.category}>
              <NativeSelect name="category" defaultValue="RENT">
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {v.categories[c]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label={v.frequency}>
              <NativeSelect name="frequency" defaultValue="MONTHLY">
                {EXPENSE_FREQUENCIES.map((f) => (
                  <option key={f} value={f}>
                    {v.frequencies[f]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label={v.amount}>
              <Input name="amount" inputMode="decimal" required dir="ltr" />
            </Field>
            <Field label={v.firstDueDate} hint={v.firstDueHint}>
              <Input name="firstDueDate" type="date" required dir="ltr" defaultValue={o.today} />
            </Field>
            <Field label={v.endDate}>
              <Input name="endDate" type="date" dir="ltr" />
            </Field>
            <Field label={v.supplier}>
              <NativeSelect name="supplierId" defaultValue="">
                <option value="">—</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label={v.notes} className="sm:col-span-2">
              <Textarea name="notes" rows={2} maxLength={500} />
            </Field>
            <div className="sm:col-span-2">
              <Button type="submit">{v.create}</Button>
            </div>
          </ActionForm>
        </Card>
      </div>

      <Card>
        <CardTitle>{v.list}</CardTitle>
        {o.expenses.length === 0 ? (
          <p className="text-sm text-muted-foreground">{v.none}</p>
        ) : (
          <ul className="divide-y text-sm">
            {o.expenses.map((e) => (
              <li key={e.id} className={cn("py-2", !e.active && "text-muted-foreground")}>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-medium">{e.label}</span>
                  {!e.active && <span className="f-label border px-1.5 text-[0.625rem]">{v.stopped}</span>}
                  <span className="text-xs">{v.categories[e.category as keyof typeof v.categories] ?? e.category}</span>
                  <span className="text-xs">{v.frequencies[e.frequency as keyof typeof v.frequencies] ?? e.frequency}</span>
                  <span className="text-xs text-muted-foreground">
                    {day(dbDay(e.firstDueDate))}
                    {e.endDate && ` → ${day(dbDay(e.endDate))}`}
                  </span>
                  {e.supplier && <span className="text-xs">{e.supplier.name}</span>}
                  <span className="ms-auto tabular-nums">{formatMoney(e.amount, lang)}</span>
                  <ActionButton size="sm" variant="ghost" className="h-7" action={setExpenseActiveAction.bind(null, e.id, !e.active)}>
                    {e.active ? v.stop : v.restart}
                  </ActionButton>
                </div>
                <details className="mt-1">
                  <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">{v.edit}</summary>
                  <p className="mt-1 text-xs text-muted-foreground">{v.editHint}</p>
                  <ActionForm action={updateExpenseAction.bind(null, e.id)} reset={false} className="mt-2 grid gap-2 sm:grid-cols-3">
                    <Field label={v.label}>
                      <Input name="label" required maxLength={120} defaultValue={e.label} />
                    </Field>
                    <Field label={v.category}>
                      <NativeSelect name="category" defaultValue={e.category}>
                        {EXPENSE_CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {v.categories[c]}
                          </option>
                        ))}
                      </NativeSelect>
                    </Field>
                    <Field label={v.amount}>
                      <Input name="amount" inputMode="decimal" required dir="ltr" defaultValue={dt(e.amount)} />
                    </Field>
                    <Field label={v.endDate}>
                      <Input name="endDate" type="date" dir="ltr" defaultValue={e.endDate ? dbDay(e.endDate) : ""} disabled={e.frequency === "ONCE"} />
                    </Field>
                    <Field label={v.supplier}>
                      <NativeSelect name="supplierId" defaultValue={e.supplierId ?? ""}>
                        <option value="">—</option>
                        {suppliers.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </NativeSelect>
                    </Field>
                    <Field label={v.notes}>
                      <Input name="notes" maxLength={500} defaultValue={e.notes ?? ""} />
                    </Field>
                    <div className="sm:col-span-3">
                      <Button type="submit" size="sm" variant="outline">
                        {t.common.save}
                      </Button>
                    </div>
                  </ActionForm>
                </details>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardTitle>{v.paid}</CardTitle>
        {o.paid.length === 0 ? (
          <p className="text-sm text-muted-foreground">{v.nonePaid}</p>
        ) : (
          <ul className="divide-y text-sm">
            {o.paid.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <span className="font-medium">{p.expense.label}</span>
                <span className="text-xs text-muted-foreground">
                  {v.dueOn} {day(dbDay(p.dueDate))}
                </span>
                <span className="text-xs">
                  {v.paidDay} {p.paidAt ? formatDate(p.paidAt, lang, settings.timezone) : ""}
                </span>
                {p.method && <span className="text-xs">{t.paymentMethod[p.method]}</span>}
                {p.reference && <span className="text-xs text-muted-foreground">{p.reference}</span>}
                <span className="ms-auto tabular-nums">{formatMoney(p.paidAmount ?? p.amount, lang)}</span>
                <ReasonButton className="h-6" question={v.unpayReason} action={cancelOccurrencePaymentAction.bind(null, p.id)}>
                  {v.unpay}
                </ReasonButton>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
