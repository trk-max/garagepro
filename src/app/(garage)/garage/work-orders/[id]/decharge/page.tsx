import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/garage/print-button";
import { Button } from "@/components/ui/button";
import { displayPlate, fmt, formatDate, formatDateTime, formatMoney, lineTotalHt, woNumber } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { prisma } from "@/lib/prisma";
import { requirePageAccess } from "@/lib/session";
import type { Prisma } from "@prisma/client";
import { signWaiverAction } from "@/actions/lot4";
import { ActionForm } from "@/components/action-form";
import { SignaturePad } from "@/components/garage/signature-pad";
import { can } from "@/lib/permissions";
import { safetyWaiverMissing } from "@/server/work-orders";
import { getSettings } from "@/server/settings";

type PageProps = { params: Promise<{ id: string }> };

/**
 * V16 Lot 3 — printable safety waiver: the « Sécurité » lines the customer refused, the warning, and the places
 * to sign (paper). The team then ticks « Décharge signée » before « Prêt ». A tablet signature (table Signature,
 * kind SAFETY_WAIVER) comes with Lot 4.
 */
export default async function SafetyWaiverPage({ params }: PageProps) {
  const staff = await requirePageAccess("viewWorkOrders");
  const { id } = await params;
  const [wo, settings, { t, lang }] = await Promise.all([
    prisma.workOrder.findUnique({
      where: { id },
      select: {
        id: true,
        number: true,
        customer: { select: { name: true } },
        vehicle: { select: { plate: true, make: true, model: true } },
        lines: {
          where: { priority: "SAFETY", approvalStatus: "REFUSED", voidedAt: null },
          orderBy: [{ position: "asc" }, { createdAt: "asc" }],
          select: { id: true, description: true, quantityX100: true, unitPrice: true, taxRateBp: true },
        },
      },
    }),
    getSettings(),
    getI18n(),
  ]);
  if (!wo) notFound();
  const r = t.v16.lot3.refusal;
  // V16 Lot 4: the waiver can also be signed on the tablet (Signature SAFETY_WAIVER), instead of paper.
  const [missing, tabletSig] = await Promise.all([
    safetyWaiverMissing(prisma as unknown as Prisma.TransactionClient, wo.id),
    prisma.signature.findFirst({ where: { workOrderId: wo.id, kind: "SAFETY_WAIVER" }, orderBy: { signedAt: "desc" } }),
  ]);
  const today = formatDate(new Date(), lang, settings.timezone);

  return (
    <div className="space-y-4 bg-muted/30 p-6 print:bg-white print:p-0">
      <div className="mx-auto flex max-w-[210mm] gap-2 print:hidden">
        <Button asChild variant="ghost">
          <Link href={`/garage/work-orders/${wo.id}`}>{t.common.back}</Link>
        </Button>
        <span className="ms-auto" />
        <PrintButton />
      </div>
      {wo.lines.length > 0 && (tabletSig || (missing.length > 0 && can(staff, "recordSafetyWaiver"))) && (
        <section className="mx-auto max-w-[210mm] rounded-[18px] border border-gp-line bg-gp-card p-4 print:hidden" data-testid="waiver-tablet">
          {tabletSig ? (
            <p className="text-sm">{fmt(t.v16.lot4.signature.waiverSigned, { name: tabletSig.signerName, date: formatDateTime(tabletSig.signedAt, lang) })}</p>
          ) : (
            <ActionForm action={signWaiverAction.bind(null, wo.id)} reset={false} className="grid gap-3">
              <p className="text-sm font-medium">{t.v16.lot4.signature.waiverTablet}</p>
              <label className="grid gap-1 text-sm">
                {t.v16.lot4.signature.signerName}
                <input name="signerName" required minLength={2} maxLength={120} defaultValue={wo.customer.name} className="h-10 rounded-md border bg-background px-3" />
              </label>
              <SignaturePad required />
              <div>
                <Button type="submit">{t.v16.lot4.signature.submit}</Button>
              </div>
            </ActionForm>
          )}
        </section>
      )}
      <article className="mx-auto max-w-[210mm] space-y-5 bg-white p-10 text-[13px] leading-relaxed text-black shadow print:shadow-none" data-testid="safety-waiver">
        <header className="flex items-start justify-between gap-4 border-b pb-4">
          <div>
            <p className="text-base font-semibold">{settings.garageName}</p>
            {settings.address && <p>{settings.address}</p>}
            {settings.phone && <p dir="ltr">{settings.phone}</p>}
          </div>
          <div className="text-end">
            <h1 className="text-xl font-bold uppercase tracking-wide">{r.waiverTitle}</h1>
            <p className="font-mono">{woNumber(wo.number)}</p>
          </div>
        </header>

        {wo.lines.length === 0 ? (
          <p>{r.waiverNone}</p>
        ) : (
          <>
            <p>
              {fmt(r.waiverIntro, {
                name: wo.customer.name,
                vehicle: `${wo.vehicle.make} ${wo.vehicle.model}`,
                plate: displayPlate(wo.vehicle.plate),
                garage: settings.garageName,
              })}
            </p>
            <ul className="list-disc space-y-1 ps-6">
              {wo.lines.map((l) => (
                <li key={l.id}>
                  <span className="font-medium">{l.description}</span> — <span dir="ltr">{formatMoney(lineTotalHt(l), lang)}</span> HT
                </li>
              ))}
            </ul>
            <p>{r.waiverBody}</p>
            <p>{fmt(r.waiverPlace, { date: today })}</p>
            <div className="grid grid-cols-2 gap-8 pt-6">
              <div className="h-32 border p-2 text-xs">{r.waiverSignature}</div>
              <div className="h-32 border p-2 text-xs">{r.waiverGarage}</div>
            </div>
          </>
        )}
      </article>
    </div>
  );
}
