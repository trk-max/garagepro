import type { Setting } from "@prisma/client";
import { saveRepairTermsAction, setRepairTermsReviewAction } from "@/actions/repair-order";
import { ActionButton, ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, Field, Textarea } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { fmt, formatDateTime, type Lang } from "@/lib/format";
import type { Dictionary } from "@/lib/i18n/fr";
import { MAX_CLAUSES, readRepairClauses } from "@/lib/repair-order";

/**
 * Paramètres → « Conditions de l'ordre de réparation » (V10.6): the articles printed on the repair
 * order, the storage fee / grace period / abandonment delay, the invoice mentions, and the lawyer's
 * validation (administrator only, who / when, cleared by any change).
 */
export function SettingsRepairOrder({ t, lang, settings, reviewerName, canReview }: { t: Dictionary; lang: Lang; settings: Setting; reviewerName: string | null; canReview: boolean }) {
  const l = t.legal.terms;
  const clauses = readRepairClauses(settings.repairClauses);
  const free = Math.max(0, Math.min(2, MAX_CLAUSES - clauses.length));
  const rows = [...clauses, ...Array.from({ length: free }, () => ({ title: "", body: "" }))];
  const reviewed = settings.repairClausesReviewedAt;
  return (
    <Card className="lg:col-span-2">
      <CardTitle>{l.title}</CardTitle>
      <p className="mb-3 text-xs text-muted-foreground">{l.intro}</p>

      <div className={`mb-4 rounded-[14px] px-3 py-2 text-sm ${reviewed ? "bg-gp-success-bg text-gp-success-ink" : "bg-gp-accent-tint text-gp-accent-ink"}`} role="status">
        <p>{reviewed ? fmt(l.reviewed, { date: formatDateTime(reviewed, lang), name: reviewerName ?? "—" }) : l.notReviewed}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {canReview ? (
            reviewed ? (
              <ActionButton size="sm" variant="outline" action={setRepairTermsReviewAction.bind(null, false)}>
                {l.unmark}
              </ActionButton>
            ) : (
              <ActionButton size="sm" variant="outline" confirm={l.confirmReviewed} action={setRepairTermsReviewAction.bind(null, true)}>
                {l.markReviewed}
              </ActionButton>
            )
          ) : (
            <span className="text-xs">{l.adminOnly}</span>
          )}
        </div>
      </div>

      <ActionForm action={saveRepairTermsAction} reset={false} successMessage={l.saved} className="grid gap-4">
        <ol className="grid gap-3">
          {rows.map((c, i) => (
            <li key={i} className="grid gap-2 rounded-[14px] border border-gp-line p-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
              <Field label={i < clauses.length ? fmt(l.article, { n: i + 1 }) : l.newArticle}>
                <Input name={`clause_title_${i}`} maxLength={120} defaultValue={c.title} placeholder={l.articleTitle} />
              </Field>
              <Field label={l.articleBody}>
                <Textarea name={`clause_body_${i}`} rows={3} maxLength={2000} defaultValue={c.body} />
              </Field>
            </li>
          ))}
        </ol>
        <p className="text-xs text-muted-foreground">{l.removeHint}</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={l.storageFee}>
            <Input name="storageFeePerDay" inputMode="decimal" required dir="ltr" defaultValue={(settings.storageFeePerDay / 1000).toFixed(3)} />
          </Field>
          <Field label={l.graceHours}>
            <Input name="storageGraceHours" type="number" min={0} max={8760} required dir="ltr" defaultValue={settings.storageGraceHours} />
          </Field>
          <Field label={l.abandonDays}>
            <Input name="abandonmentDays" type="number" min={1} max={3650} required dir="ltr" defaultValue={settings.abandonmentDays} />
          </Field>
        </div>
        <p className="mt-2 text-sm font-semibold">{l.invoiceTitle}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={l.paymentTerms} hint={l.paymentTermsHint}>
            <Textarea name="invoicePaymentTerms" rows={2} maxLength={500} defaultValue={settings.invoicePaymentTerms ?? ""} />
          </Field>
          <Field label={l.penalty}>
            <Textarea name="invoicePenaltyText" rows={2} maxLength={500} defaultValue={settings.invoicePenaltyText ?? ""} />
          </Field>
        </div>
        <div>
          <Button type="submit">{t.common.save}</Button>
        </div>
      </ActionForm>
    </Card>
  );
}
