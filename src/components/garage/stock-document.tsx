import type { Setting, Supplier } from "@prisma/client";
import { formatDate, formatMoney, formatQty, type Lang } from "@/lib/format";
import type { Dictionary } from "@/lib/i18n/fr";
import { DocFooter, DocLogo } from "@/components/garage/doc-brand";

/** Printable A4 purchase order / goods receipt. */
export function StockDocument({
  title,
  number,
  date,
  garage,
  supplier,
  meta,
  lines,
  t,
  lang,
}: {
  title: string;
  number: string;
  date: Date;
  garage: Setting;
  supplier: Supplier;
  meta: { label: string; value: string }[];
  lines: { sku: string; name: string; unit: string; quantityX100: number; unitCost: number }[];
  t: Dictionary;
  lang: Lang;
}) {
  const total = lines.reduce((s, l) => s + Math.round((l.quantityX100 * l.unitCost) / 100), 0);
  return (
    <article className="paper mx-auto max-w-[210mm] bg-white p-10 text-sm text-zinc-900 shadow-sm print:max-w-none print:p-0 print:shadow-none">
      <header className="flex flex-wrap items-start justify-between gap-6 border-b pb-6">
        <div>
          <DocLogo logo={garage.logoDataUrl} name={garage.garageName} />
          <h2 className="text-xl font-bold">{garage.garageName}</h2>
          {garage.address && <p>{garage.address}</p>}
          {garage.phone && <p dir="ltr">{garage.phone}</p>}
          {garage.taxId && (
            <p>
              {t.common.taxId}: <span dir="ltr">{garage.taxId}</span>
            </p>
          )}
        </div>
        <div className="text-end">
          <p className="text-2xl font-bold uppercase tracking-wide">{title}</p>
          <p className="font-mono">{number}</p>
          <p>{formatDate(date, lang)}</p>
        </div>
      </header>

      <section className="grid gap-6 py-6 sm:grid-cols-2">
        <div className="rounded-md border p-3">
          <p className="mb-1 text-xs font-semibold uppercase text-zinc-500">{t.purchase.supplier}</p>
          <p className="font-medium">{supplier.name}</p>
          {supplier.contact && <p>{supplier.contact}</p>}
          {supplier.phone && <p dir="ltr">{supplier.phone}</p>}
          {supplier.address && <p>{supplier.address}</p>}
        </div>
        <dl className="rounded-md border p-3">
          {meta.map((m) => (
            <div key={m.label} className="flex justify-between gap-2">
              <dt className="text-zinc-500">{m.label}</dt>
              <dd>{m.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <table className="w-full border-collapse">
        <thead>
          <tr className="border-y bg-zinc-50 text-xs uppercase text-zinc-600">
            <th className="px-2 py-2 text-start">{t.parts.sku}</th>
            <th className="px-2 py-2 text-start">{t.parts.name}</th>
            <th className="px-2 py-2 text-end">{t.purchase.qty}</th>
            <th className="px-2 py-2 text-end">{t.purchase.unitCost}</th>
            <th className="px-2 py-2 text-end">{t.purchase.total}</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i} className="border-b">
              <td className="px-2 py-2 font-mono text-xs">{l.sku}</td>
              <td className="px-2 py-2">{l.name}</td>
              <td className="px-2 py-2 text-end tabular-nums">
                {formatQty(l.quantityX100, lang)} {l.unit}
              </td>
              <td className="px-2 py-2 text-end tabular-nums" dir="ltr">{formatMoney(l.unitCost, lang)}</td>
              <td className="px-2 py-2 text-end tabular-nums" dir="ltr">{formatMoney(Math.round((l.quantityX100 * l.unitCost) / 100), lang)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-4 text-end text-base font-bold">
        {t.purchase.total}: <span dir="ltr">{formatMoney(total, lang)}</span>
      </p>
      <DocFooter garage={{ name: garage.garageName, address: garage.address, phone: garage.phone, email: garage.email, taxId: garage.taxId }} taxIdLabel={t.common.taxId} />
    </article>
  );
}
