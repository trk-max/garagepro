import Link from "next/link";
import { notFound } from "next/navigation";
import { DocumentView } from "@/components/garage/document-view";
import { PrintButton } from "@/components/garage/print-button";
import { Button } from "@/components/ui/button";
import { computeTotals, lineTotalHt, woNumber } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { requirePageAccess } from "@/lib/session";
import { getSettings } from "@/server/settings";
import { getWorkOrder } from "@/server/work-orders";

type PageProps = { params: Promise<{ id: string }> };

export default async function QuotePage({ params }: PageProps) {
  await requirePageAccess("printQuote");
  const { id } = await params;
  const [wo, settings, { t, lang }] = await Promise.all([getWorkOrder(id), getSettings(), getI18n()]);
  if (!wo) notFound();

  const totals = computeTotals(wo.lines, settings.stampDuty);

  return (
    <div className="space-y-4 bg-muted/30 p-6 print:bg-white print:p-0">
      <div className="mx-auto flex max-w-[210mm] gap-2 print:hidden">
        <Button asChild variant="ghost">
          <Link href={`/garage/work-orders/${wo.id}`}>{t.common.back}</Link>
        </Button>
        <span className="ms-auto" />
        <PrintButton />
      </div>
      <DocumentView
        t={t}
        lang={lang}
        doc={{
          kind: "quote",
          number: `D-${woNumber(wo.number).slice(3)}`,
          date: new Date(),
          garage: {
            name: settings.garageName,
            address: settings.address,
            phone: settings.phone,
            email: settings.email,
            taxId: settings.taxId,
            footer: settings.invoiceFooter,
          },
          customer: { name: wo.customer.name, phone: wo.customer.phone, address: wo.customer.address, taxId: wo.customer.taxId },
          vehicle: { plate: wo.vehicle.plate, make: wo.vehicle.make, model: wo.vehicle.model, mileage: wo.mileageIn ?? wo.vehicle.mileage },
          workOrderNumber: wo.number,
          lines: wo.lines.map((l) => ({ ...l, totalHt: lineTotalHt(l) })),
          totals,
        }}
      />
    </div>
  );
}
