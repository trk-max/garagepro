import Link from "next/link";
import { notFound } from "next/navigation";
import { DocumentView } from "@/components/garage/document-view";
import { PrintButton } from "@/components/garage/print-button";
import { Button } from "@/components/ui/button";
import { getI18n } from "@/lib/i18n/server";
import { requirePageAccess } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getCreditNote, type InvoiceSnapshot } from "@/server/invoices";
import { getSettings } from "@/server/settings";

type PageProps = { params: Promise<{ id: string }> };

/** V16 Lot 4 — printable credit note (avoir) of an invoice: its own number, the invoice it cancels, the reason. */
export default async function CreditNotePage({ params }: PageProps) {
  await requirePageAccess("viewClientInvoices");
  const { id } = await params;
  const row = await prisma.creditNote.findUnique({ where: { creditOfInvoiceId: id }, select: { id: true } });
  if (!row) notFound();
  const [note, inv, settings, { t, lang }] = await Promise.all([
    getCreditNote(row.id),
    prisma.invoice.findUnique({ where: { id }, select: { snapshot: true } }),
    getSettings(),
    getI18n(),
  ]);
  if (!note || !inv) notFound();
  const s = inv.snapshot as unknown as InvoiceSnapshot;
  const garage = s.garage ?? { name: settings.garageName, address: settings.address ?? null, phone: settings.phone ?? null, email: settings.email ?? null, taxId: settings.taxId ?? null, footer: settings.invoiceFooter ?? null };
  return (
    <div className="space-y-4 bg-muted/30 p-3 sm:p-6 print:bg-white print:p-0">
      <div className="mx-auto flex max-w-[210mm] gap-2 print:hidden">
        <Button asChild variant="ghost">
          <Link href={`/garage/invoices/${id}`}>{t.common.back}</Link>
        </Button>
        <span className="ms-auto" />
        <PrintButton />
      </div>
      <DocumentView
        t={t}
        lang={lang}
        logo={settings.logoDataUrl}
        doc={{
          kind: "invoice",
          number: note.number,
          date: note.issuedAt,
          garage,
          customer: note.snapshot.customer,
          vehicle: note.snapshot.vehicle,
          workOrderNumber: note.snapshot.workOrderNumber,
          lines: note.snapshot.lines,
          totals: { totalHt: note.totalHt, taxByRate: note.snapshot.taxByRate, stampDuty: note.stampDuty, totalTtc: note.totalTtc },
          creditNote: { invoiceNumber: note.creditOf.number, invoiceDate: note.creditOf.issuedAt, reason: note.reason, sha256: note.snapshotHash },
        }}
      />
    </div>
  );
}
