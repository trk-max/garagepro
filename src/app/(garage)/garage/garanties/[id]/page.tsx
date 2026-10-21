import Link from "next/link";
import { notFound } from "next/navigation";
import { openClaimAction, voidWarrantyAction } from "@/actions/warranties";
import { ActionForm } from "@/components/action-form";
import { PlateChip } from "@/components/garage/badges";
import { ClaimBadge, ValidityText, WarrantyBadge } from "@/components/garage/warranty";
import { ReasonButton } from "@/components/team/prompt-action";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, Field, PageHeader, Textarea } from "@/components/ui/field";
import { fmt, formatDateTime, formatDay, formatKm, formatMoney, woNumber } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { requirePageAccess } from "@/lib/session";
import { claimNumber } from "@/lib/warranty";
import { getWarranty } from "@/server/warranties";

type PageProps = { params: Promise<{ id: string }> };

export default async function WarrantyPage({ params }: PageProps) {
  const { id } = await params;
  const staff = await requirePageAccess("manageWarranties");
  const [{ t, lang }, w] = await Promise.all([getI18n(), getWarranty(staff, id)]);
  if (!w) notFound();
  const v = t.v7.warranty;
  const c = t.v7.claim;
  const showMoney = can(staff.role, "viewWarrantyMoney");
  const canClaim = w.validity.status !== "VOID" && w.validity.status !== "EXPIRED";
  const day = (d: string) => formatDay(d, lang, { day: "numeric", month: "long", year: "numeric" });

  const rows: [string, React.ReactNode][] = [
    [v.origin, `${v.kind[w.kind as "REPAIR" | "PART"]} — ${w.autoWorkOrderId ? v.auto : v.manual}`],
    [v.vehicle, <span key="v" className="inline-flex items-center gap-2"><PlateChip plate={w.vehicle.plate} /> {w.vehicle.make} {w.vehicle.model} · {formatKm(w.vehicle.mileage, lang)}</span>],
    [v.customer, <Link key="c" href={`/garage/customers/${w.customer.id}`} className="underline-offset-4 hover:underline">{w.customer.name}</Link>],
    ...(w.workOrder ? [[v.workOrder, <Link key="wo" href={`/garage/work-orders/${w.workOrder.id}`} className="font-mono underline-offset-4 hover:underline">{woNumber(w.workOrder.number)}</Link>] as [string, React.ReactNode]] : []),
    ...(w.supplier ? [[v.supplier, w.supplier.name] as [string, React.ReactNode]] : []),
    ...(w.part ? [[v.part, `${w.part.sku} · ${w.part.name}`] as [string, React.ReactNode]] : []),
    [v.start, `${day(w.startDay)}${w.startKm !== null ? ` · ${formatKm(w.startKm, lang)}` : ""}`],
    [v.end, <ValidityText key="e" endDay={w.endDay} endKm={w.endKm} v={w.validity} t={t} lang={lang} />],
    ...(w.terms ? [[v.terms, <span key="t" className="whitespace-pre-line">{w.terms}</span>] as [string, React.ReactNode]] : []),
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <PageHeader title={w.label}>
        <WarrantyBadge v={w.validity} t={t} />
        <Link href="/garage/garanties" className="text-sm underline-offset-4 hover:underline">
          {v.title}
        </Link>
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <dl className="space-y-2 text-sm">
            {rows.map(([label, value]) => (
              <div key={label} className="grid grid-cols-[9rem_1fr] gap-2">
                <dt className="text-muted-foreground">{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          {w.validity.status === "UNKNOWN" && <p className="mt-3 border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">{v.unknownHint}</p>}
          {w.validity.kmUnchecked && w.validity.status !== "UNKNOWN" && <p className="mt-3 text-xs text-amber-700 dark:text-amber-400">{v.kmUnchecked}</p>}
          {w.voidedAt && <p className="mt-3 text-xs text-muted-foreground">{fmt(v.voided, { reason: w.voidReason ?? "" })}</p>}
          {showMoney && !w.voidedAt && (
            <ReasonButton className="mt-4" question={v.voidReason} action={voidWarrantyAction.bind(null, w.id)}>
              {v.void}
            </ReasonButton>
          )}
        </Card>

        <Card>
          <CardTitle>{v.claims}</CardTitle>
          {w.claims.length === 0 ? (
            <p className="mb-3 text-sm text-muted-foreground">{v.noClaims}</p>
          ) : (
            <ul className="mb-4 divide-y text-sm">
              {w.claims.map((x) => (
                <li key={x.id} className="space-y-1 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/garage/garanties/reclamations/${x.id}`} className="font-mono text-xs underline-offset-4 hover:underline">
                      {claimNumber(x.number)}
                    </Link>
                    <ClaimBadge status={x.status} t={t} />
                    <time className="ms-auto text-xs text-muted-foreground">{formatDateTime(x.openedAt, lang)}</time>
                  </div>
                  <p className="line-clamp-2">{x.description}</p>
                  {x.money && (
                    <p className="text-xs text-muted-foreground">
                      {c.amountClaimed} : {formatMoney(x.money.amountClaimed, lang)}
                      {x.money.amountAccepted !== null && ` · ${c.accepted} : ${formatMoney(x.money.amountAccepted, lang)}`}
                      {` · ${c.received} : ${formatMoney(x.money.received, lang)}`}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
          {canClaim ? (
            <ActionForm action={openClaimAction.bind(null, w.id)} className="space-y-3">
              <Field label={v.claimDescription}>
                <Textarea name="description" required minLength={3} maxLength={2000} rows={3} placeholder={v.claimPlaceholder} />
              </Field>
              <Button type="submit">{v.openClaim}</Button>
            </ActionForm>
          ) : (
            <p className="text-xs text-muted-foreground">{v.cannotClaim}</p>
          )}
          {!showMoney && <p className="mt-3 text-xs text-muted-foreground">{c.amountsHidden}</p>}
        </Card>
      </div>
    </div>
  );
}
