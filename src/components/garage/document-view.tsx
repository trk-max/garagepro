import type { LineType } from "@prisma/client";
import { displayPlate, fmt, formatDate, formatKm, formatMoney, formatQty, woNumber, type Lang } from "@/lib/format";
import type { Dictionary } from "@/lib/i18n/fr";
import { DocFooter, DocLogo } from "@/components/garage/doc-brand";

export type DocumentData = {
  kind: "quote" | "invoice";
  number: string;
  date: Date;
  garage: { name: string; address: string | null; phone: string | null; email: string | null; taxId: string | null; footer: string | null };
  customer: { name: string; phone: string; address: string | null; taxId: string | null };
  vehicle: { plate: string; make: string; model: string; mileage: number | null };
  workOrderNumber: number;
  lines: { type: LineType; description: string; quantityX100: number; unitPrice: number; totalHt: number }[];
  totals: { totalHt: number; taxByRate: { rateBp: number; tax: number }[]; stampDuty: number; totalTtc: number };
};

/** A4 printable quote / invoice. Print with the browser (Ctrl+P → PDF). */
export function DocumentView({ doc, t, lang, logo }: { doc: DocumentData; t: Dictionary; lang: Lang; logo?: string | null }) {
  const title = doc.kind === "invoice" ? t.invoices.invoice : t.invoices.quote;
  const money = (m: number) => formatMoney(m, lang);

  return (
    <article className="paper mx-auto max-w-[210mm] bg-white p-10 text-sm text-zinc-900 max-sm:p-4 shadow-sm print:max-w-none print:p-0 print:shadow-none">
      <header className="flex flex-wrap items-start justify-between gap-6 border-b pb-6">
        <div>
          <DocLogo logo={logo} name={doc.garage.name} />
          <h2 className="text-xl font-bold">{doc.garage.name}</h2>
          {doc.garage.address && <p className="whitespace-pre-line">{doc.garage.address}</p>}
          {doc.garage.phone && <p dir="ltr">{doc.garage.phone}</p>}
          {doc.garage.email && <p dir="ltr">{doc.garage.email}</p>}
          {doc.garage.taxId && (
            <p>
              {t.common.taxId}: <span dir="ltr">{doc.garage.taxId}</span>
            </p>
          )}
        </div>
        <div className="text-end">
          <p className="text-2xl font-bold uppercase tracking-wide">{title}</p>
          <p className="font-mono">{doc.number}</p>
          <p>{formatDate(doc.date, lang)}</p>
          <p className="text-xs text-zinc-500">
            {t.invoices.workOrder} {woNumber(doc.workOrderNumber)}
          </p>
        </div>
      </header>

      <section className="grid gap-6 py-6 sm:grid-cols-2">
        <div className="rounded-md border p-3">
          <p className="mb-1 text-xs font-semibold uppercase text-zinc-500">{t.invoices.billTo}</p>
          <p className="font-medium">{doc.customer.name}</p>
          <p dir="ltr">{doc.customer.phone}</p>
          {doc.customer.address && <p className="whitespace-pre-line">{doc.customer.address}</p>}
          {doc.customer.taxId && (
            <p>
              {t.common.taxId}: <span dir="ltr">{doc.customer.taxId}</span>
            </p>
          )}
        </div>
        <div className="rounded-md border p-3">
          <p className="mb-1 text-xs font-semibold uppercase text-zinc-500">{t.invoices.vehicle}</p>
          <p className="font-medium">
            {doc.vehicle.make} {doc.vehicle.model}
          </p>
          <p dir="ltr">{displayPlate(doc.vehicle.plate)}</p>
          <p>
            {t.invoices.mileage}: <span dir="ltr">{formatKm(doc.vehicle.mileage, lang)}</span>
          </p>
        </div>
      </section>

      {/* Phones: the lines scroll inside the paper, the page never scrolls sideways (print unchanged). */}
      <div className="overflow-x-auto print:overflow-visible">
      <table className="w-full min-w-[30rem] border-collapse print:min-w-0">
        <thead>
          <tr className="border-y bg-zinc-50 text-xs uppercase text-zinc-600">
            <th className="px-2 py-2 text-start">{t.invoices.designation}</th>
            <th className="px-2 py-2 text-end">{t.common.quantity}</th>
            <th className="px-2 py-2 text-end">{t.common.unitPrice}</th>
            <th className="px-2 py-2 text-end">{t.invoices.totalHt}</th>
          </tr>
        </thead>
        <tbody>
          {doc.lines.map((line, i) => (
            <tr key={i} className="border-b">
              <td className="px-2 py-2">
                {line.description}
                <span className="ms-2 text-xs text-zinc-500">({t.lineType[line.type]})</span>
              </td>
              <td className="px-2 py-2 text-end tabular-nums">{formatQty(line.quantityX100, lang)}</td>
              <td className="px-2 py-2 text-end tabular-nums" dir="ltr">{money(line.unitPrice)}</td>
              <td className="px-2 py-2 text-end tabular-nums" dir="ltr">{money(line.totalHt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      <dl className="ms-auto mt-4 w-full max-w-xs space-y-1">
        <div className="flex justify-between">
          <dt>{t.invoices.totalHt}</dt>
          <dd className="tabular-nums" dir="ltr">{money(doc.totals.totalHt)}</dd>
        </div>
        {doc.totals.taxByRate.map((r) => (
          <div key={r.rateBp} className="flex justify-between">
            <dt>{fmt(t.invoices.vat, { rate: r.rateBp / 100 })}</dt>
            <dd className="tabular-nums" dir="ltr">{money(r.tax)}</dd>
          </div>
        ))}
        <div className="flex justify-between">
          <dt>{t.invoices.stampDuty}</dt>
          <dd className="tabular-nums" dir="ltr">{money(doc.totals.stampDuty)}</dd>
        </div>
        <div className="flex justify-between border-t pt-2 text-base font-bold">
          <dt>{t.invoices.totalTtc}</dt>
          <dd className="tabular-nums" dir="ltr">{money(doc.totals.totalTtc)}</dd>
        </div>
      </dl>

      <p className="mt-10 text-center text-xs text-zinc-500">{doc.kind === "quote" ? t.invoices.quoteValidity : t.invoices.thanks}</p>
      <DocFooter garage={doc.garage} text={doc.garage.footer} taxIdLabel={t.common.taxId} />
    </article>
  );
}
