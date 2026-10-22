import { formatMoney, type Lang } from "@/lib/format";
import type { Dictionary } from "@/lib/i18n/fr";

/**
 * V10.6 — legal block under the totals of a quote / invoice: VAT breakdown by rate (base, rate,
 * VAT), amount in French words (invoice), payment terms and late-payment penalties when configured.
 */
export function InvoiceLegal({
  t,
  lang,
  taxByRate,
  amountWords,
  paymentTerms,
  penaltyText,
}: {
  t: Dictionary;
  lang: Lang;
  taxByRate: { rateBp: number; base?: number; tax: number }[];
  amountWords?: string | null;
  paymentTerms?: string | null;
  penaltyText?: string | null;
}) {
  const l = t.legal.invoice;
  const money = (m: number) => formatMoney(m, lang);
  const rows = taxByRate.filter((r) => typeof r.base === "number");
  return (
    <div className="mt-6 space-y-3 break-inside-avoid">
      {rows.length > 0 && (
        <table className="w-full max-w-md border-collapse text-xs">
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
      )}
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
