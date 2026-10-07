"use client";

import Link from "next/link";
import { useState } from "react";
import { Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, NativeSelect } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

export type InvoiceFilterValues = Partial<
  Record<"number" | "dateMode" | "date" | "from" | "to" | "customer" | "plate" | "totalMin" | "totalMax" | "dueMin" | "dueMax" | "status", string>
>;

/** GET form: filters live in the URL, so a filtered list can be bookmarked or shared. */
export function InvoiceFilters({ values }: { values: InvoiceFilterValues }) {
  const { t } = useI18n();
  const f = t.invoiceFilters;
  const [mode, setMode] = useState<"exact" | "range">(values.dateMode === "range" ? "range" : "exact");

  return (
    <form method="get" className="mb-4 grid gap-3 rounded-lg border bg-muted/20 p-4 sm:grid-cols-2 lg:grid-cols-6">
      <Field label={f.number}>
        <Input name="number" defaultValue={values.number} placeholder="F2026-" dir="ltr" />
      </Field>

      <div className="flex flex-col gap-1.5 text-sm lg:col-span-2">
        <div className="flex items-center gap-2">
          <span className="font-medium">{f.dateMode}</span>
          <div className="inline-flex rounded-md border p-0.5 text-xs" role="radiogroup">
            {(["exact", "range"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                onClick={() => setMode(m)}
                className={cn("rounded px-2 py-0.5", mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent")}
              >
                {m === "exact" ? f.exact : f.range}
              </button>
            ))}
          </div>
        </div>
        <input type="hidden" name="dateMode" value={mode} />
        {mode === "exact" ? (
          <Input type="date" name="date" defaultValue={values.date} aria-label={f.date} dir="ltr" />
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <label className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">{f.from}</span>
              <Input type="date" name="from" defaultValue={values.from} dir="ltr" />
            </label>
            <label className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">{f.to}</span>
              <Input type="date" name="to" defaultValue={values.to} dir="ltr" />
            </label>
          </div>
        )}
      </div>

      <Field label={f.customer}>
        <Input name="customer" defaultValue={values.customer} />
      </Field>
      <Field label={f.vehicle}>
        <Input name="plate" defaultValue={values.plate} placeholder="215 TU 8841" dir="ltr" />
      </Field>
      <Field label={f.status}>
        <NativeSelect name="status" defaultValue={values.status ?? ""}>
          <option value="">{f.anyStatus}</option>
          <option value="ISSUED">{t.invoiceStatus.ISSUED}</option>
          <option value="PARTIAL">{t.invoiceStatus.PARTIAL}</option>
          <option value="PAID">{t.invoiceStatus.PAID}</option>
          <option value="OVERDUE">{f.overdue}</option>
        </NativeSelect>
      </Field>

      <Field label={`${f.totalMin} (DT)`}>
        <Input name="totalMin" defaultValue={values.totalMin} inputMode="decimal" dir="ltr" />
      </Field>
      <Field label={`${f.totalMax} (DT)`}>
        <Input name="totalMax" defaultValue={values.totalMax} inputMode="decimal" dir="ltr" />
      </Field>
      <Field label={`${f.dueMin} (DT)`}>
        <Input name="dueMin" defaultValue={values.dueMin} inputMode="decimal" dir="ltr" />
      </Field>
      <Field label={`${f.dueMax} (DT)`}>
        <Input name="dueMax" defaultValue={values.dueMax} inputMode="decimal" dir="ltr" />
      </Field>

      <div className="flex items-end gap-2 lg:col-span-2">
        <Button type="submit" className="flex-1">
          <Filter className="size-4" aria-hidden /> {f.apply}
        </Button>
        <Button asChild variant="ghost">
          <Link href="/garage/invoices">{f.reset}</Link>
        </Button>
      </div>
    </form>
  );
}
