import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/garage/print-button";
import { RepairOrderView } from "@/components/garage/repair-order-view";
import { Button } from "@/components/ui/button";
import { computeTotals, lineTotalHt } from "@/lib/format";
import { fr } from "@/lib/i18n/fr";
import { getI18n } from "@/lib/i18n/server";
import { cleanBodyZones, estimateOf, readRepairClauses, renderRepairClauses } from "@/lib/repair-order";
import { requirePageAccess } from "@/lib/session";
import { getSettings } from "@/server/settings";
import { getWorkOrder } from "@/server/work-orders";

type PageProps = { params: Promise<{ id: string }> };

/** V10.6 — printable « Ordre de réparation et prise en charge » (A4, French), signed by hand. */
export default async function RepairOrderPage({ params }: PageProps) {
  await requirePageAccess("printQuote");
  const { id } = await params;
  const [wo, settings, { t }] = await Promise.all([getWorkOrder(id), getSettings(), getI18n()]);
  if (!wo) notFound();
  // V16: voided lines are not part of the work any more.
  // V16 Lot 2: nor the lines the customer refused.
  const liveLines = wo.lines.filter((l) => !l.voidedAt && l.approvalStatus !== "REFUSED");

  const linesTtc = liveLines.length ? computeTotals(liveLines, settings.stampDuty).totalTtc : null;
  const registry = settings.registryNumber ? `${settings.registryNumber}${settings.registryCity ? ` (${settings.registryCity})` : ""}` : null;
  const c = wo.customer;
  const idLine = [c.nationalId ? `CIN ${c.nationalId}` : null, c.taxId ? `MF ${c.taxId}` : null].filter(Boolean).join(" · ") || null;

  return (
    <div className="space-y-4 bg-muted/30 p-6 print:bg-white print:p-0">
      <div className="mx-auto flex max-w-[210mm] gap-2 print:hidden">
        <Button asChild variant="ghost">
          <Link href={`/garage/work-orders/${wo.id}`}>{t.common.back}</Link>
        </Button>
        <span className="ms-auto" />
        <PrintButton />
      </div>
      <RepairOrderView
        logo={settings.logoDataUrl}
        doc={{
          garage: {
            name: settings.legalName || settings.garageName,
            address: settings.legalAddress || settings.address,
            phone: settings.phone,
            email: settings.email,
            taxId: settings.taxId,
            registry,
            footer: settings.invoiceFooter,
          },
          customer: { name: c.name, idLine, address: c.address, phone: c.phone },
          vehicle: {
            make: wo.vehicle.make,
            model: wo.vehicle.model,
            plate: wo.vehicle.plate,
            vin: wo.vehicle.vin,
            mileage: wo.mileageIn ?? wo.vehicle.mileage,
            fuelLevel: wo.fuelLevel,
            bodyZones: cleanBodyZones(wo.bodyChecklist),
            bodyNotes: wo.bodyDamageNotes,
          },
          number: wo.number,
          createdAt: wo.createdAt,
          promisedAt: wo.promisedAt,
          complaint: wo.complaint,
          // Document language: French labels whatever the interface language.
          lines: liveLines.map((l) => ({ description: l.description, kind: fr.lineType[l.type], quantityX100: l.quantityX100, totalHt: lineTotalHt(l) })),
          partsOrigin: wo.partsOrigin,
          estimate: estimateOf(linesTtc, wo.estimateTtc),
          deposit: wo.depositAmount ? { amount: wo.depositAmount, method: fr.paymentMethod[(wo.depositMethod ?? "CASH") as keyof typeof fr.paymentMethod] ?? wo.depositMethod ?? "" } : null,
          clauses: renderRepairClauses(readRepairClauses(settings.repairClauses), settings),
          reviewed: settings.repairClausesReviewedAt ? { day: settings.repairClausesReviewedAt } : null,
        }}
      />
    </div>
  );
}
