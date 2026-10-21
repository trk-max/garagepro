import Link from "next/link";
import { reviewTemplateAction } from "@/actions/contracts";
import { categoryLabel, fieldLabel, subtypeLabel } from "@/components/garage/contracts";
import { ReasonButton } from "@/components/team/prompt-action";
import { Card, PageHeader } from "@/components/ui/field";
import { fmt, formatDateTime, formatDay } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { requirePageAccess } from "@/lib/session";
import { cn } from "@/lib/utils";
import { listAllTemplates } from "@/server/contracts";

/**
 * Template versions and their legal review (administrator). Marking a version "reviewed by a
 * lawyer" records who / when / note and is audited; it is never automatic and the application
 * never prints "compliant".
 */
export default async function ContractTemplatesPage() {
  const staff = await requirePageAccess("reviewContractTemplates");
  const [{ t, lang }, templates] = await Promise.all([getI18n(), listAllTemplates(staff)]);
  const v = t.ctr;

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
      <PageHeader title={v.templates}>
        <Link href="/garage/contrats" className="text-sm underline-offset-4 hover:underline">
          {v.title}
        </Link>
      </PageHeader>
      <p className="border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">{v.reviewWarning}</p>
      {templates.map((x) => (
        <Card key={x.id} className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold">{x.subtype ? subtypeLabel(t, x.subtype) : x.title}</h2>
            <span className="text-xs text-muted-foreground">
              {categoryLabel(t, x.category)} · {fmt(v.version, { n: x.version })} · {x.jurisdiction}
            </span>
            <span className={cn("f-label ms-auto border px-2 py-0.5 text-[0.625rem]", x.reviewStatus === "REVIEWED" ? "border-emerald-600 text-emerald-700 dark:text-emerald-400" : "border-amber-500 text-amber-700 dark:text-amber-400")}>
              {v.reviewState[x.reviewStatus as keyof typeof v.reviewState] ?? x.reviewStatus}
            </span>
          </div>
          {x.reviewStatus === "REVIEWED" && x.reviewedAt && (
            <p className="text-xs text-muted-foreground">
              {fmt(v.legalReviewed, { date: formatDateTime(x.reviewedAt, lang), name: x.reviewedBy ?? "—" })}
              {x.reviewNote ? ` — ${x.reviewNote}` : ""}
            </p>
          )}
          <ul className="list-disc ps-5 text-sm">
            {x.legalRefs.map((r) => (
              <li key={r.ref}>
                <span className="font-medium">{r.ref}</span> — {r.subject} <span className="text-xs text-muted-foreground">({v.confidence[r.confidence]})</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">{fmt(v.verifiedOn, { date: formatDay(x.verifiedDay, lang, { day: "numeric", month: "long", year: "numeric" }) })}</p>
          {x.unverified.length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer">{v.unverifiedTitle}</summary>
              <ul className="list-disc ps-5 text-muted-foreground">
                {x.unverified.map((u) => (
                  <li key={u}>{u}</li>
                ))}
              </ul>
            </details>
          )}
          <details className="text-xs">
            <summary className="cursor-pointer">
              {v.fieldsList} ({x.fields.length}) · {v.clausesList} ({x.clauses.length})
            </summary>
            <p className="mt-1">{x.fields.map((f) => `${fieldLabel(t, f.key)} (${f.required ? v.required : v.optional})`).join(" · ")}</p>
            <ol className="mt-2 list-decimal space-y-1 ps-5" lang="fr" dir="ltr">
              {x.clauses.map((c) => (
                <li key={c.key}>
                  <span className="font-medium">{c.title}</span> ({c.required ? v.required : v.optional}) — {c.body}
                </li>
              ))}
            </ol>
          </details>
          <div>
            {x.reviewStatus === "REVIEWED" ? (
              <ReasonButton question={v.unreviewNote} action={reviewTemplateAction.bind(null, x.id, false)}>
                {v.unreview}
              </ReasonButton>
            ) : (
              <ReasonButton question={v.reviewNote} action={reviewTemplateAction.bind(null, x.id, true)}>
                {v.review}
              </ReasonButton>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}
