import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { createWarrantyAction } from "@/actions/warranties";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, Field, NativeSelect, Textarea } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { fmt, formatDay, formatKm, type Lang } from "@/lib/format";
import type { Dictionary } from "@/lib/i18n/fr";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import type { StaffUser } from "@/lib/session";
import { cn } from "@/lib/utils";
import type { Validity } from "@/lib/warranty";
import { supplierOptions } from "@/server/purchasing";
import { listWarranties } from "@/server/warranties";

const VALIDITY_TONE: Record<Validity["status"], string> = {
  ACTIVE: "border-emerald-600 text-emerald-700 dark:text-emerald-400",
  EXPIRED: "border-border text-muted-foreground",
  VOID: "border-border text-muted-foreground line-through",
  UNKNOWN: "border-amber-500 text-amber-700 dark:text-amber-400",
};

const CLAIM_TONE: Record<string, string> = {
  OPEN: "border-brand-500 text-brand-500",
  SUBMITTED: "border-amber-500 text-amber-700 dark:text-amber-400",
  ACCEPTED: "border-emerald-600 text-emerald-700 dark:text-emerald-400",
  PARTIAL: "border-emerald-600 text-emerald-700 dark:text-emerald-400",
  REJECTED: "border-red-600 text-red-700 dark:text-red-400",
  CLOSED: "border-border text-muted-foreground",
};

export function WarrantyBadge({ v, t }: { v: Validity; t: Dictionary }) {
  return <span className={cn("f-label border px-2 py-0.5 text-[0.625rem]", VALIDITY_TONE[v.status])}>{t.v7.warranty.status[v.status]}</span>;
}

export function ClaimBadge({ status, t }: { status: string; t: Dictionary }) {
  const label = t.v7.claim.status[status as keyof Dictionary["v7"]["claim"]["status"]] ?? status;
  return <span className={cn("f-label border px-2 py-0.5 text-[0.625rem]", CLAIM_TONE[status])}>{label}</span>;
}

/** "jusqu'au 12 mars 2027 · 85 000 km · 120 j restants" */
export function ValidityText({ endDay, endKm, v, t, lang }: { endDay: string | null; endKm: number | null; v: Validity; t: Dictionary; lang: Lang }) {
  const w = t.v7.warranty;
  const parts: string[] = [];
  if (endDay) parts.push(formatDay(endDay, lang, { day: "numeric", month: "short", year: "numeric" }));
  if (endKm !== null) parts.push(formatKm(endKm, lang));
  if (v.status === "ACTIVE" && v.daysLeft !== null) parts.push(fmt(w.daysLeft, { n: v.daysLeft }));
  if (v.status === "ACTIVE" && v.kmLeft !== null) parts.push(fmt(w.kmLeft, { n: v.kmLeft }));
  if (v.status === "EXPIRED" && v.endedBy) parts.push(w.endedBy[v.endedBy]);
  return <span className="text-xs text-muted-foreground">{parts.join(" · ")}</span>;
}

/** Work order page: its warranties and the form to add one (repair or part). */
export async function WarrantyCard({ workOrderId, staff, t, lang }: { workOrderId: string; staff: StaffUser; t: Dictionary; lang: Lang }) {
  if (!can(staff, "manageWarranties")) return null;
  const w = t.v7.warranty;
  const [list, suppliers, lines] = await Promise.all([
    listWarranties(staff, { workOrderId }),
    supplierOptions(),
    prisma.workOrderLine.findMany({ where: { workOrderId, type: "PART" }, select: { id: true, description: true }, orderBy: { position: "asc" } }),
  ]);
  return (
    <Card>
      <CardTitle>{w.title}</CardTitle>
      {list.length === 0 ? (
        <p className="mb-3 text-sm text-muted-foreground">{w.none}</p>
      ) : (
        <ul className="mb-3 divide-y text-sm">
          {list.map((x) => (
            <li key={x.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
              <WarrantyBadge v={x.validity} t={t} />
              <span className="f-label text-[0.625rem] text-muted-foreground">{w.kind[x.kind as "REPAIR" | "PART"]}</span>
              <Link href={`/garage/garanties/${x.id}`} className="font-medium underline-offset-4 hover:underline">
                {x.label}
              </Link>
              {x.supplier && <span className="text-xs">{x.supplier.name}</span>}
              <ValidityText endDay={x.endDay} endKm={x.endKm} v={x.validity} t={t} lang={lang} />
              {x.openClaims > 0 && <span className="ms-auto text-xs font-semibold text-brand-500">{fmt(w.openClaims, { n: x.openClaims })}</span>}
            </li>
          ))}
        </ul>
      )}
      <details className="rounded-md border border-dashed p-3">
        <summary className="cursor-pointer text-sm font-medium">
          <ShieldCheck className="me-1 inline size-4" aria-hidden /> {w.add}
        </summary>
        <p className="mt-2 text-xs text-muted-foreground">{w.addHint}</p>
        <ActionForm action={createWarrantyAction.bind(null, workOrderId)} className="mt-3 grid gap-3 sm:grid-cols-3">
          <Field label={w.origin}>
            <NativeSelect name="kind" defaultValue="REPAIR">
              <option value="REPAIR">{w.kind.REPAIR}</option>
              <option value="PART">{w.kind.PART}</option>
            </NativeSelect>
          </Field>
          <Field label={w.label} className="sm:col-span-2">
            <Input name="label" required maxLength={200} placeholder={w.labelPlaceholder} />
          </Field>
          <Field label={w.months}>
            <Input name="months" type="number" min={1} max={240} dir="ltr" />
          </Field>
          <Field label={w.endDate}>
            <Input name="endDate" type="date" dir="ltr" />
          </Field>
          <Field label={w.km}>
            <Input name="km" type="number" min={1} max={1000000} dir="ltr" />
          </Field>
          <Field label={w.supplier} hint={w.supplierHint}>
            <NativeSelect name="supplierId" defaultValue="">
              <option value="">—</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label={w.line} className="sm:col-span-2">
            <NativeSelect name="lineId" defaultValue="">
              <option value="">—</option>
              {lines.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.description}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label={w.terms} className="sm:col-span-3">
            <Textarea name="terms" rows={2} maxLength={1000} />
          </Field>
          <div className="sm:col-span-3">
            <Button type="submit" variant="outline">
              {w.create}
            </Button>
          </div>
        </ActionForm>
      </details>
    </Card>
  );
}
