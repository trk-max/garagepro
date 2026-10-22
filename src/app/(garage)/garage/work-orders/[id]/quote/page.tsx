import Link from "next/link";
import { notFound } from "next/navigation";
import { DocumentView } from "@/components/garage/document-view";
import { PrintButton } from "@/components/garage/print-button";
import { Button } from "@/components/ui/button";
import { computeTotals, lineTotalHt, woNumber } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import type { QuoteSnapshot } from "@/lib/quote";
import { prisma } from "@/lib/prisma";
import { requirePageAccess } from "@/lib/session";
import { getSettings } from "@/server/settings";
import { getWorkOrder } from "@/server/work-orders";

type PageProps = { params: Promise<{ id: string }>; searchParams: Promise<{ v?: string }> };

export default async function QuotePage({ params, searchParams }: PageProps) {
  await requirePageAccess("printQuote");
  const { id } = await params;
  const { v } = await searchParams;
  const [wo, settings, { t, lang }] = await Promise.all([getWorkOrder(id), getSettings(), getI18n()]);
  if (!wo) notFound();
  // V16 Lot 2: a versioned quote prints its FROZEN copy (number, version, validity, priority, part condition,
  // supplement totals, fingerprint) — the requested version (?v=2) or the latest one.
  const version = Number(v);
  const quote = await prisma.quote.findFirst({
    where: { workOrderId: wo.id, ...(Number.isInteger(version) && version > 0 ? { version } : {}) },
    orderBy: { version: "desc" },
  });
  const snap = quote ? (quote.snapshot as unknown as QuoteSnapshot) : null;
  // V16: voided lines are not part of the work any more; V16 Lot 2: nor the refused ones.
  const liveLines = wo.lines.filter((l) => !l.voidedAt && l.approvalStatus !== "REFUSED");

  const totals = computeTotals(liveLines, settings.stampDuty);

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
        logo={settings.logoDataUrl}
        doc={{
          kind: "quote",
          number: quote ? quote.number : `D-${woNumber(wo.number).slice(3)}`,
          date: quote ? quote.sentAt : new Date(),
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
          lines: snap ? snap.lines : liveLines.map((l) => ({ ...l, totalHt: lineTotalHt(l) })),
          totals: snap ? snap.totals : totals,
          ...(quote && snap
            ? {
                quote: {
                  version: quote.version,
                  validUntil: quote.validUntil,
                  previousTtc: snap.previousTtc,
                  newTotalTtc: snap.newTotalTtc,
                  supplement: quote.kind === "SUPPLEMENT",
                  sha256: quote.snapshotHash,
                  announcedTtc: snap.announcedTtc ?? null,
                },
              }
            : {}),
        }}
      />
    </div>
  );
}
