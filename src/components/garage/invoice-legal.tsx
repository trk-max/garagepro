import { formatMoney, type Lang } from "@/lib/format";
import type { Dictionary } from "@/lib/i18n/fr";

/** V10.6 — VAT breakdown by rate (base, rate, VAT), printed next to the totals of a quote / invoice. */
export function VatBreakdown({ t, lang, taxByRate }: { t: Dictionary; lang: Lang; taxByRate: { rateBp: number; base?: number; tax: number }[] }) {
  const l = t.legal.invoice;
  const money = (m: number) => formatMoney(m, lang);
  const rows = taxByRate.filter((r) => typeof r.base === "number");
  if (rows.length === 0) return null;
  return (
    <table className="w-full max-w-xs border-collapse text-xs">
      <caption className="mb-1 text-start font-semibold uppercase text-zinc-600">{l.vatBreakdown}</caption>
      <thead>
        <tr className="border-y bg-zinc-50 text-zinc-600">
          <th className="px-2 py-1 text-start">{l.vatRate}</th>
          <th className="px-2 py-1 text-end">{l.vatBase}</th>
          <th className="px-2 py-1 text-end">{l.vatAmount}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.rateBp} className="border-b">
            <td className="px-2 py-1 tabular-nums">{r.rateBp / 100} %</td>
            <td className="px-2 py-1 text-end tabular-nums" dir="ltr">{money(r.base!)}</td>
            <td className="px-2 py-1 text-end tabular-nums" dir="ltr">{money(r.tax)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * V10.6 — under the totals: amount in French words (invoice), payment terms and late-payment
 * penalties when they were configured (frozen on the invoice).
 */
export function InvoiceMentions({ t, amountWords, paymentTerms, penaltyText }: { t: Dictionary; amountWords?: string | null; paymentTerms?: string | null; penaltyText?: string | null }) {
  const l = t.legal.invoice;
  if (!amountWords && !paymentTerms && !penaltyText) return null;
  return (
    <div className="mt-4 space-y-2 break-inside-avoid">
      {amountWords && (
        <p lang="fr" dir="ltr" className="rounded-md border px-3 py-2 text-sm font-medium">
          {amountWords}
        </p>
      )}
      {paymentTerms && (
        <p className="text-xs">
          <span className="font-semibold">{l.paymentTerms} : </span>
          <span className="whitespace-pre-line">{paymentTerms}</span>
        </p>
      )}
      {penaltyText && (
        <p className="text-xs">
          <span className="font-semibold">{l.penalty} : </span>
          <span className="whitespace-pre-line">{penaltyText}</span>
        </p>
      )}
    </div>
  );
}
