import Link from "next/link";
import { FileSignature } from "lucide-react";
import { Card, CardTitle, Field, NativeSelect, Textarea } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { contractCategoriesFor, fieldShown, type ContractCategory, type Expiry, type TemplateClause, type TemplateField } from "@/lib/contracts";
import { fmt, formatDay, type Lang } from "@/lib/format";
import type { Dictionary } from "@/lib/i18n/fr";
import type { StaffUser } from "@/lib/session";
import { cn } from "@/lib/utils";
import { listContracts, type ContractFilter } from "@/server/contracts";

const STATUS_TONE: Record<string, string> = {
  DRAFT: "border-border text-muted-foreground",
  VALIDATION: "border-amber-500 text-amber-700 dark:text-amber-400",
  LEGAL_REVIEW: "border-fuchsia-500 text-fuchsia-700 dark:text-fuchsia-400",
  APPROVED: "border-blue-500 text-blue-700 dark:text-blue-400",
  PENDING_SIGNATURE: "border-brand-500 text-brand-500",
  SIGNED: "border-emerald-600 text-emerald-700 dark:text-emerald-400",
  ACTIVE: "border-emerald-600 text-emerald-700 dark:text-emerald-400",
  EXPIRED: "border-border text-muted-foreground",
  TERMINATED: "border-red-600 text-red-700 dark:text-red-400",
  ARCHIVED: "border-border text-muted-foreground line-through",
};

type Ctr = Dictionary["ctr"];

export const fieldLabel = (t: Dictionary, key: string) => t.ctr.fields[key as keyof Ctr["fields"]] ?? key;
export const optionLabel = (t: Dictionary, v: string) => t.ctr.options[v as keyof Ctr["options"]] ?? v;
export const subtypeLabel = (t: Dictionary, s: string | null | undefined) => (s ? (t.ctr.subtype[s as keyof Ctr["subtype"]] ?? s) : "");
export const categoryLabel = (t: Dictionary, c: string) => t.ctr.category[c as ContractCategory] ?? c;

export function ContractStatusBadge({ status, t }: { status: string; t: Dictionary }) {
  return <span className={cn("f-label border px-2 py-0.5 text-[0.625rem]", STATUS_TONE[status])}>{t.ctr.status[status as keyof Ctr["status"]] ?? status}</span>;
}

/** "20 oct. 2027 · dans 12 j" / "sans date de fin" / "durée indéterminée". */
export function ContractEnd({ endDay, indefinite, expiry, t, lang }: { endDay: string | null; indefinite: boolean; expiry: Expiry; t: Dictionary; lang: Lang }) {
  if (!endDay) return <span className="text-xs text-muted-foreground">{indefinite ? t.ctr.indefinite : t.ctr.noEnd}</span>;
  const when =
    expiry.state === "SOON" ? (expiry.daysLeft === 0 ? t.ctr.endsToday : fmt(t.ctr.daysLeft, { n: expiry.daysLeft ?? 0 })) : expiry.state === "PAST" ? fmt(t.ctr.daysPast, { n: -(expiry.daysLeft ?? 0) }) : null;
  return (
    <span className="text-xs">
      {formatDay(endDay, lang, { day: "numeric", month: "short", year: "numeric" })}
      {when && <span className={cn("ms-2 font-semibold", expiry.state === "PAST" ? "text-red-600 dark:text-red-400" : "text-amber-700 dark:text-amber-400")}>{when}</span>}
    </span>
  );
}

/** Template fields of the contract form (all shown; conditional ones say when they apply). */
export function ContractFieldInputs({ fields, values, t }: { fields: TemplateField[]; values: Record<string, string>; t: Dictionary }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {fields.map((f) => {
        const name = `f_${f.key}`;
        const label = `${fieldLabel(t, f.key)}${f.required ? ` (${t.ctr.requiredMark})` : ""}`;
        const hint = f.showIf ? fmt(t.ctr.onlyIf, { field: fieldLabel(t, f.showIf.key), value: optionLabel(t, f.showIf.equals) }) : undefined;
        const v = values[f.key] ?? "";
        const wide = f.type === "textarea" || label.length > 60;
        return (
          <Field key={f.key} label={label} hint={hint} className={cn(wide && "sm:col-span-2", f.showIf && !fieldShown(f, values) && "opacity-70")}>
            {f.type === "textarea" ? (
              <Textarea name={name} defaultValue={v} rows={3} maxLength={4000} />
            ) : f.type === "select" ? (
              <NativeSelect name={name} defaultValue={v}>
                <option value="">—</option>
                {(f.options ?? []).map((o) => (
                  <option key={o} value={o}>
                    {optionLabel(t, o)}
                  </option>
                ))}
              </NativeSelect>
            ) : f.type === "date" ? (
              <Input name={name} type="date" defaultValue={v} dir="ltr" />
            ) : f.type === "number" ? (
              <Input name={name} type="number" inputMode="numeric" min={f.min} max={f.max} step={1} defaultValue={v} dir="ltr" />
            ) : f.type === "money" ? (
              <Input name={name} inputMode="decimal" defaultValue={v} dir="ltr" />
            ) : (
              <Input name={name} defaultValue={v} maxLength={300} />
            )}
          </Field>
        );
      })}
    </div>
  );
}

/** Optional clauses: ticked = printed. Required clauses are not listed (always printed). */
export function ClauseChoices({ clauses, excluded, t }: { clauses: TemplateClause[]; excluded: string[]; t: Dictionary }) {
  const optional = clauses.filter((c) => !c.required);
  if (optional.length === 0) return null;
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{t.ctr.clausesTitle}</legend>
      <p className="text-xs text-muted-foreground">{t.ctr.clausesHint}</p>
      {optional.map((c) => (
        <label key={c.key} className="flex items-center gap-2 text-sm">
          <input type="hidden" name={`clause_present_${c.key}`} value="1" />
          <input type="checkbox" name={`clause_${c.key}`} defaultChecked={!excluded.includes(c.key)} className="size-4" />
          {c.title}
        </label>
      ))}
    </fieldset>
  );
}

/** Start / end / duration (no end for a repair contract; a CDI ignores them, the server refuses an end). */
export function ContractDateInputs({ category, startDay, endDay, durationMonths, t }: { category: string; startDay: string; endDay?: string | null; durationMonths?: number | null; t: Dictionary }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Field label={t.ctr.startDate}>
        <Input name="startDay" type="date" required defaultValue={startDay} dir="ltr" />
      </Field>
      {category !== "REPAIR" && (
        <>
          <Field label={t.ctr.duration} hint={t.ctr.durationHint}>
            <Input name="durationMonths" type="number" min={1} max={120} defaultValue={durationMonths ?? ""} dir="ltr" />
          </Field>
          <Field label={t.ctr.endDate}>
            <Input name="endDay" type="date" defaultValue={endDay ?? ""} dir="ltr" />
          </Field>
        </>
      )}
    </div>
  );
}

/**
 * Contracts linked to a customer / vehicle / work order / supplier / employee, shown on that page.
 * Only the categories the viewer may see (employment: administrator + HR); nothing for the others.
 */
export async function RelatedContracts({
  staff,
  filter,
  t,
  lang,
  newHref,
  newLabel,
}: {
  staff: StaffUser;
  filter: ContractFilter;
  t: Dictionary;
  lang: Lang;
  newHref?: string | null;
  newLabel?: string;
}) {
  if (contractCategoriesFor(staff, "view").length === 0) return null;
  const rows = await listContracts(staff, { ...filter, take: 20 });
  return (
    <Card>
      <CardTitle className="flex items-center gap-2">
        <FileSignature className="size-4" aria-hidden /> {t.ctr.related}
      </CardTitle>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t.ctr.relatedNone}</p>
      ) : (
        <ul className="divide-y text-sm">
          {rows.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-2 py-2">
              <Link href={`/garage/contrats/${c.id}`} className="font-mono text-xs underline-offset-4 hover:underline">
                {c.number}
              </Link>
              <ContractStatusBadge status={c.status} t={t} />
              <span className="min-w-0 flex-1 truncate">{c.title}</span>
              <ContractEnd endDay={c.endDay} indefinite={c.indefinite} expiry={c.expiry} t={t} lang={lang} />
            </li>
          ))}
        </ul>
      )}
      {newHref && (
        <Link href={newHref} className="mt-3 inline-block text-sm font-medium underline-offset-4 hover:underline">
          + {newLabel ?? t.ctr.new}
        </Link>
      )}
    </Card>
  );
}
