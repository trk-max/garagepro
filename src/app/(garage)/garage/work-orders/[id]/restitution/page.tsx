import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/garage/print-button";
import { Button } from "@/components/ui/button";
import { displayPlate, fmt, formatDateTime, woNumber } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { requirePageAccess } from "@/lib/session";
import { listHandovers } from "@/server/handover";
import { getSettings } from "@/server/settings";
import { getWorkOrder } from "@/server/work-orders";

type PageProps = { params: Promise<{ id: string }> };

/**
 * V16 Lot 4 — printable « Bon de restitution » (latest handover): mileage and fuel at departure, checklist, work
 * done, the customer's signature (image) and the fingerprint of the frozen signed document.
 */
export default async function HandoverPage({ params }: PageProps) {
  await requirePageAccess("viewWorkOrders");
  const { id } = await params;
  const [wo, handovers, settings, { t, lang }] = await Promise.all([getWorkOrder(id), listHandovers(id), getSettings(), getI18n()]);
  if (!wo) notFound();
  const h = handovers[0];
  const l = t.v16.lot4.handover;
  const yes = (b: boolean) => (b ? t.v16.lot4.intake.yes : t.v16.lot4.intake.no);
  const lines = wo.lines.filter((x) => !x.voidedAt && x.approvalStatus === "APPROVED");
  return (
    <div className="space-y-4 bg-muted/30 p-3 sm:p-6 print:bg-white print:p-0">
      <div className="mx-auto flex max-w-[210mm] gap-2 print:hidden">
        <Button asChild variant="ghost">
          <Link href={`/garage/work-orders/${wo.id}`}>{t.common.back}</Link>
        </Button>
        <span className="ms-auto" />
        <PrintButton />
      </div>
      <article className="paper mx-auto max-w-[210mm] space-y-4 bg-white p-10 text-sm text-zinc-900 shadow-sm max-sm:p-4 print:max-w-none print:p-0 print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b pb-4">
          <div>
            <h2 className="text-xl font-bold">{settings.legalName || settings.garageName}</h2>
            {settings.address && <p className="whitespace-pre-line">{settings.address}</p>}
          </div>
          <div className="text-end">
            <p className="text-2xl font-bold uppercase tracking-wide">{l.printTitle}</p>
            <p className="font-mono">{woNumber(wo.number)}</p>
          </div>
        </header>
        <p>
          {wo.customer.name} · {wo.vehicle.make} {wo.vehicle.model} · <span dir="ltr">{displayPlate(wo.vehicle.plate)}</span>
        </p>
        {!h ? (
          <p>{l.none}</p>
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
              <dt className="text-zinc-600">{t.workOrders.mileageIn}</dt>
              <dd dir="ltr">{wo.mileageIn ?? "—"}</dd>
              <dt className="text-zinc-600">{l.mileageOut}</dt>
              <dd dir="ltr">{h.mileageOut}</dd>
              <dt className="text-zinc-600">{l.fuelOut}</dt>
              <dd>{h.fuelLevelOut ? `${h.fuelLevelOut}/4` : "—"}</dd>
              <dt className="text-zinc-600">{l.workExplained}</dt>
              <dd>{yes(h.checklist.workExplained)}</dd>
              <dt className="text-zinc-600">{l.oldParts}</dt>
              <dd>{l.oldPartsOptions[h.checklist.oldParts]}</dd>
              <dt className="text-zinc-600">{l.keysReturned}</dt>
              <dd>{yes(h.checklist.keysReturned)}</dd>
              <dt className="text-zinc-600">{l.clean}</dt>
              <dd>{yes(h.checklist.clean)}</dd>
              {h.notes && (
                <>
                  <dt className="text-zinc-600">{l.notes}</dt>
                  <dd>{h.notes}</dd>
                </>
              )}
            </dl>
            <ul className="list-disc ps-5">
              {lines.map((x) => (
                <li key={x.id}>{x.description}</li>
              ))}
            </ul>
            <div className="rounded border p-3">
              <p>{fmt(l.done, { date: formatDateTime(h.createdAt, lang), name: h.signature?.signerName ?? "—" })}</p>
              {h.by && <p className="text-xs text-zinc-600">{fmt(l.by, { name: h.by })}</p>}
              {h.signature && (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/signatures/${h.signature.id}/image`} alt={t.v16.lot4.signature.image} className="mt-2 h-20 bg-white" />
                  <p className="mt-1 text-xs text-zinc-600" dir="ltr">
                    {t.v16.lot4.signature.fingerprint} {h.signature.documentHash}
                  </p>
                </>
              )}
            </div>
          </>
        )}
      </article>
    </div>
  );
}
