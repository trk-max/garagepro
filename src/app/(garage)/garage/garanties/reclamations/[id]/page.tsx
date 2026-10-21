import Link from "next/link";
import { notFound } from "next/navigation";
import { PaymentMethod } from "@prisma/client";
import { addRefundAction, claimAmountsAction, moveClaimAction, voidRefundAction } from "@/actions/warranties";
import { ActionForm } from "@/components/action-form";
import { PlateChip } from "@/components/garage/badges";
import { ClaimBadge, WarrantyBadge } from "@/components/garage/warranty";
import { ReasonButton } from "@/components/team/prompt-action";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, Field, NativeSelect, PageHeader, Textarea } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { utcToZoned } from "@/lib/booking";
import { fmt, formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { requirePageAccess } from "@/lib/session";
import { cn } from "@/lib/utils";
import { CLAIM_TRANSITIONS, claimNumber, warrantyValidity } from "@/lib/warranty";
import { getSettings } from "@/server/settings";
import { getClaim } from "@/server/warranties";

type PageProps = { params: Promise<{ id: string }> };

const dt = (m: number) => (m / 1000).toFixed(3);

/** One warranty claim. Amounts, decision and refunds: administrator and manager only (removed on the server). */
export default async function WarrantyClaimPage({ params }: PageProps) {
  const { id } = await params;
  const staff = await requirePageAccess("manageWarranties");
  const [{ t, lang }, claim, settings] = await Promise.all([getI18n(), getClaim(staff, id), getSettings()]);
  if (!claim) notFound();
  const c = t.v7.claim;
  const v = t.v7.warranty;
  const tz = settings.timezone;
  const today = utcToZoned(new Date(), tz).date;
  const showMoney = can(staff, "viewWarrantyMoney") && claim.money !== null;
  const w = claim.warranty;
  const validity = warrantyValidity(
    { startDay: utcToZoned(w.startsAt, tz).date, endDay: w.endsAt ? utcToZoned(w.endsAt, tz).date : null, endKm: w.endKm, voided: !!w.voidedAt },
    today,
    w.vehicle.mileage,
  );
  const nexts = CLAIM_TRANSITIONS[claim.status];

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <PageHeader title={fmt(c.title, { n: claimNumber(claim.number) })}>
        <ClaimBadge status={claim.status} t={t} />
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle>{c.description}</CardTitle>
          <p className="whitespace-pre-line text-sm">{claim.description}</p>
          <p className="mt-3 text-xs text-muted-foreground">
            {fmt(c.opened, { date: formatDateTime(claim.openedAt, lang, tz) })}
            {claim.openedBy && ` ${fmt(c.by, { name: claim.openedBy })}`}
          </p>
          {claim.decidedAt && (
            <p className="text-xs text-muted-foreground">
              {fmt(c.decided, { date: formatDateTime(claim.decidedAt, lang, tz) })}
              {claim.decidedBy && ` ${fmt(c.by, { name: claim.decidedBy })}`}
            </p>
          )}
          {claim.decision && <p className="mt-2 border-s-2 ps-3 text-sm whitespace-pre-line">{claim.decision}</p>}

          <p className="label-tech mt-5 mb-2">{c.warranty}</p>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <WarrantyBadge v={validity} t={t} />
            <Link href={`/garage/garanties/${w.id}`} className="font-medium underline-offset-4 hover:underline">
              {w.label}
            </Link>
            <span className="f-label text-[0.625rem] text-muted-foreground">{v.kind[w.kind as "REPAIR" | "PART"]}</span>
            <PlateChip plate={w.vehicle.plate} />
            {w.supplier && <span className="text-xs">{w.supplier.name}</span>}
          </div>
          {!showMoney && <p className="mt-4 text-xs text-muted-foreground">{c.amountsHidden}</p>}
        </Card>

        {showMoney && claim.money && (
          <Card>
            <CardTitle>{c.amounts}</CardTitle>
            <dl className="mb-4 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted-foreground">{c.amountClaimed}</dt>
              <dd className="text-end tabular-nums">{formatMoney(claim.money.amountClaimed, lang)}</dd>
              <dt className="text-muted-foreground">{c.accepted}</dt>
              <dd className="text-end tabular-nums">{claim.money.amountAccepted === null ? "—" : formatMoney(claim.money.amountAccepted, lang)}</dd>
              <dt className="text-muted-foreground">{c.received}</dt>
              <dd className="text-end tabular-nums">{formatMoney(claim.money.received, lang)}</dd>
              <dt className="font-semibold">{c.expected}</dt>
              <dd className="text-end font-semibold tabular-nums">{formatMoney(claim.money.expected, lang)}</dd>
            </dl>
            {claim.status !== "CLOSED" && (
              <ActionForm action={claimAmountsAction.bind(null, claim.id)} reset={false} className="grid gap-3 sm:grid-cols-3">
                <Field label={c.costParts}>
                  <Input name="costParts" inputMode="decimal" dir="ltr" defaultValue={dt(claim.money.costParts)} />
                </Field>
                <Field label={c.costLabor}>
                  <Input name="costLabor" inputMode="decimal" dir="ltr" defaultValue={dt(claim.money.costLabor)} />
                </Field>
                <Field label={c.amountClaimed}>
                  <Input name="amountClaimed" inputMode="decimal" dir="ltr" defaultValue={dt(claim.money.amountClaimed)} />
                </Field>
                <div className="sm:col-span-3">
                  <Button type="submit" variant="outline">
                    {c.saveAmounts}
                  </Button>
                </div>
              </ActionForm>
            )}

            {nexts.length > 0 && (
              <ActionForm action={moveClaimAction.bind(null, claim.id)} className="mt-5 grid gap-3 border-t pt-4 sm:grid-cols-2">
                <Field label={c.next}>
                  <NativeSelect name="to" defaultValue={nexts[0]}>
                    {nexts.map((s) => (
                      <option key={s} value={s}>
                        {c.move[s as keyof typeof c.move]}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                {claim.status === "SUBMITTED" && (
                  <Field label={c.amountAccepted} hint={c.decisionHint}>
                    <Input name="amountAccepted" inputMode="decimal" dir="ltr" />
                  </Field>
                )}
                {claim.status === "SUBMITTED" && (
                  <Field label={c.decision} className="sm:col-span-2">
                    <Textarea name="decision" rows={2} maxLength={1000} />
                  </Field>
                )}
                <div className="sm:col-span-2">
                  <Button type="submit">{c.apply}</Button>
                </div>
              </ActionForm>
            )}
            {claim.status === "CLOSED" && <p className="text-xs text-muted-foreground">{c.closedHint}</p>}
          </Card>
        )}
      </div>

      {showMoney && claim.refunds && (
        <Card>
          <CardTitle>{c.refunds}</CardTitle>
          {claim.refunds.length === 0 ? (
            <p className="mb-3 text-sm text-muted-foreground">{c.noRefunds}</p>
          ) : (
            <ul className="mb-4 divide-y text-sm">
              {claim.refunds.map((r) => (
                <li key={r.id} className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 py-2", r.voidedAt && "text-muted-foreground line-through")}>
                  <span>{formatDate(r.receivedAt, lang, tz)}</span>
                  <span className="text-xs">{t.paymentMethod[r.method]}</span>
                  {r.reference && <span className="text-xs text-muted-foreground">{r.reference}</span>}
                  <span className="ms-auto tabular-nums">{formatMoney(r.amount, lang)}</span>
                  {r.voidedAt ? (
                    <span className="w-full text-xs no-underline">({r.voidReason})</span>
                  ) : (
                    <ReasonButton className="h-6" question={c.voidRefundReason} action={voidRefundAction.bind(null, r.id)}>
                      {c.voidRefund}
                    </ReasonButton>
                  )}
                </li>
              ))}
            </ul>
          )}
          {(claim.status === "ACCEPTED" || claim.status === "PARTIAL") && claim.money && claim.money.expected > 0 && (
            <ActionForm action={addRefundAction.bind(null, claim.id)} className="grid gap-3 sm:grid-cols-4">
              <Field label={c.amount}>
                <Input name="amount" inputMode="decimal" required dir="ltr" defaultValue={dt(claim.money.expected)} />
              </Field>
              <Field label={c.receivedDay}>
                <Input name="receivedDay" type="date" required dir="ltr" defaultValue={today} max={today} />
              </Field>
              <Field label={c.method}>
                <NativeSelect name="method" defaultValue="TRANSFER">
                  {Object.values(PaymentMethod).map((m) => (
                    <option key={m} value={m}>
                      {t.paymentMethod[m]}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label={c.reference}>
                <Input name="reference" maxLength={80} />
              </Field>
              <div className="sm:col-span-4">
                <Button type="submit" variant="outline">
                  {c.addRefund}
                </Button>
              </div>
            </ActionForm>
          )}
        </Card>
      )}
    </div>
  );
}
