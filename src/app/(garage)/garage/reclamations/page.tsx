import Link from "next/link";
import { ClaimStatus } from "@prisma/client";
import { Star } from "lucide-react";
import { updateClaimAction } from "@/actions/claims";
import { ActionForm } from "@/components/action-form";
import { PlateChip } from "@/components/garage/badges";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, NativeSelect, PageHeader, Textarea } from "@/components/ui/field";
import { fmt, formatDateTime, woNumber } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { requirePageAccess } from "@/lib/session";
import { cn } from "@/lib/utils";
import { listClaims, listFeedback } from "@/server/claims";

type PageProps = { searchParams: Promise<{ status?: string }> };

const STATUS_TONE: Record<ClaimStatus, string> = {
  OPEN: "border-brand-500 text-brand-500",
  IN_PROGRESS: "border-amber-500 text-amber-600 dark:text-amber-400",
  RESOLVED: "border-emerald-600 text-emerald-700 dark:text-emerald-400",
};

/** Customer complaints (to answer) and ratings left on the site. */
export default async function ClaimsAdminPage({ searchParams }: PageProps) {
  await requirePageAccess("manageClaims");
  const { status: raw } = await searchParams;
  const status = (Object.values(ClaimStatus) as string[]).includes(raw ?? "") ? (raw as ClaimStatus) : undefined;
  const [{ t, lang }, claims, feedback] = await Promise.all([getI18n(), listClaims(status), listFeedback()]);
  const c = t.claims;

  return (
    <div className="mx-auto max-w-6xl p-6">
      <PageHeader title={c.staffTitle} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <nav className="flex flex-wrap gap-1" aria-label={c.staffTitle}>
            {[undefined, ...Object.values(ClaimStatus)].map((s) => (
              <Link
                key={s ?? "all"}
                href={s ? `/garage/reclamations?status=${s}` : "/garage/reclamations"}
                className={cn("f-label border px-3 py-2", s === status ? "border-foreground text-foreground" : "border-border text-muted-foreground hover:text-foreground")}
              >
                {s ? c.status[s] : c.all}
              </Link>
            ))}
          </nav>

          {claims.length === 0 && <p className="border border-dashed p-10 text-center text-sm text-muted-foreground">{c.empty}</p>}

          {claims.map((claim) => (
            <Card key={claim.id}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-muted-foreground">REC-{String(claim.number).padStart(4, "0")}</span>
                <span className={cn("f-label border px-2 py-0.5 text-[0.625rem]", STATUS_TONE[claim.status])}>{c.status[claim.status]}</span>
                <span className="f-label text-[0.625rem] text-muted-foreground">{c.categories[claim.category]}</span>
                <time className="ms-auto text-xs text-muted-foreground">{formatDateTime(claim.createdAt, lang)}</time>
              </div>
              <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className="font-medium">{claim.customer ? <Link href={`/garage/customers/${claim.customer.id}`} className="underline-offset-4 hover:underline">{claim.name}</Link> : claim.name}</span>
                <a href={`tel:${claim.phone.replace(/\s/g, "")}`} className="text-muted-foreground hover:text-foreground" dir="ltr">
                  {claim.phone}
                </a>
                {claim.email && <span className="text-muted-foreground">{claim.email}</span>}
                {claim.plate && <PlateChip plate={claim.plate} />}
                {claim.workOrder && (
                  <Link href={`/garage/work-orders/${claim.workOrder.id}`} className="font-mono text-xs underline-offset-4 hover:underline">
                    {c.linkedOrder} {woNumber(claim.workOrder.number)}
                  </Link>
                )}
              </p>
              <p className="mt-3 whitespace-pre-line border-s-2 border-border ps-3 text-sm">{claim.message}</p>

              <ActionForm action={updateClaimAction.bind(null, claim.id)} reset={false} className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
                <Textarea name="response" rows={2} maxLength={2000} defaultValue={claim.response ?? ""} placeholder={c.response} aria-label={c.response} />
                <div className="flex flex-col gap-2">
                  <NativeSelect name="status" defaultValue={claim.status} aria-label={c.status[claim.status]}>
                    {Object.values(ClaimStatus).map((s) => (
                      <option key={s} value={s}>
                        {c.status[s]}
                      </option>
                    ))}
                  </NativeSelect>
                  <Button type="submit" size="sm">
                    {c.save}
                  </Button>
                </div>
              </ActionForm>
              {claim.handledBy && <p className="mt-2 text-xs text-muted-foreground">{fmt(c.handledBy, { name: claim.handledBy.name })}</p>}
            </Card>
          ))}
        </div>

        <aside className="space-y-4">
          <Card>
            <CardTitle>{t.reports.feedbackTitle}</CardTitle>
            <p className="flex items-baseline gap-2">
              <span className="text-3xl font-semibold tabular-nums">{feedback.average ? feedback.average.toFixed(1) : "—"}</span>
              <span className="text-sm text-muted-foreground">/ 5 · {feedback.count}</span>
            </p>
          </Card>
          <Card>
            <CardTitle>{c.feedbackList}</CardTitle>
            {feedback.latest.length === 0 ? (
              <p className="text-sm text-muted-foreground">{c.noFeedback}</p>
            ) : (
              <ul className="divide-y text-sm">
                {feedback.latest.map((f) => (
                  <li key={f.id} className="py-3">
                    <p className="flex items-center gap-1" aria-label={fmt(t.feedback.stars, { n: f.rating })}>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <Star key={n} className={cn("size-3.5", n <= f.rating ? "fill-brand-500 text-brand-500" : "text-muted-foreground")} aria-hidden />
                      ))}
                      <time className="ms-auto text-xs text-muted-foreground">{formatDateTime(f.createdAt, lang)}</time>
                    </p>
                    {f.comment && <p className="mt-1 whitespace-pre-line">{f.comment}</p>}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {f.customer?.name ?? f.name ?? ""}
                      {f.workOrder && (
                        <Link href={`/garage/work-orders/${f.workOrder.id}`} className="ms-2 font-mono hover:underline">
                          {woNumber(f.workOrder.number)}
                        </Link>
                      )}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}
