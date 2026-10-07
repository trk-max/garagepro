"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { formatMoney, formatQty } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";

export type EditorPart = { id: string; sku: string; name: string; unit: string; costPrice: number; stockX100: number };
export type EditorRow = { partId: string; quantity: string; unitCost: string; remainingX100?: number };

const toNumber = (v: string) => Number(v.replace(/\s/g, "").replace(",", ".")) || 0;

/**
 * Editable list of parts with quantity and unit cost. Rows are posted as JSON
 * in a hidden "lines" input. With `fixedParts` (receiving against an order)
 * rows cannot be added/removed and the remaining quantity is shown.
 */
export function PurchaseLinesEditor({
  parts,
  initialRows,
  fixedParts = false,
}: {
  parts: EditorPart[];
  initialRows: EditorRow[];
  fixedParts?: boolean;
}) {
  const { t, lang } = useI18n();
  const [rows, setRows] = useState<EditorRow[]>(initialRows.length ? initialRows : [{ partId: "", quantity: "1", unitCost: "" }]);
  const byId = useMemo(() => new Map(parts.map((p) => [p.id, p])), [parts]);

  const update = (i: number, patch: Partial<EditorRow>) => setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const total = rows.reduce((sum, r) => {
    const part = byId.get(r.partId);
    const cost = r.unitCost ? Math.round(toNumber(r.unitCost) * 1000) : (part?.costPrice ?? 0);
    return sum + Math.round(toNumber(r.quantity) * cost);
  }, 0);

  const payload = JSON.stringify(rows.filter((r) => r.partId).map(({ partId, quantity, unitCost }) => ({ partId, quantity, unitCost })));

  return (
    <div className="space-y-2">
      <input type="hidden" name="lines" value={payload} />
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 text-xs text-muted-foreground">
              <th className="px-2 py-2 text-start">{t.purchase.part}</th>
              {fixedParts && <th className="px-2 py-2 text-end">{t.receipts.remaining}</th>}
              <th className="w-28 px-2 py-2 text-start">{t.purchase.qty}</th>
              <th className="w-36 px-2 py-2 text-start">{t.purchase.unitCost} (DT)</th>
              {!fixedParts && <th className="w-10" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const part = byId.get(row.partId);
              return (
                <tr key={i} className="border-t">
                  <td className="px-2 py-1.5">
                    {fixedParts ? (
                      <span>
                        <span className="font-mono text-xs text-muted-foreground">{part?.sku}</span> {part?.name}
                      </span>
                    ) : (
                      <NativeSelect value={row.partId} onChange={(e) => update(i, { partId: e.target.value })} aria-label={t.purchase.part}>
                        <option value="">{t.workOrders.choosePart}</option>
                        {parts.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.sku} · {p.name} ({t.parts.stock}: {formatQty(p.stockX100, lang)} {p.unit})
                          </option>
                        ))}
                      </NativeSelect>
                    )}
                  </td>
                  {fixedParts && (
                    <td className="px-2 py-1.5 text-end tabular-nums text-muted-foreground">{formatQty(row.remainingX100 ?? 0, lang)}</td>
                  )}
                  <td className="px-2 py-1.5">
                    <Input value={row.quantity} onChange={(e) => update(i, { quantity: e.target.value })} inputMode="decimal" dir="ltr" aria-label={t.purchase.qty} />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      value={row.unitCost}
                      onChange={(e) => update(i, { unitCost: e.target.value })}
                      inputMode="decimal"
                      dir="ltr"
                      placeholder={part ? (part.costPrice / 1000).toFixed(3) : ""}
                      aria-label={t.purchase.unitCost}
                    />
                  </td>
                  {!fixedParts && (
                    <td className="px-1">
                      <Button type="button" variant="ghost" size="icon-sm" aria-label={t.common.delete} onClick={() => setRows((rs) => rs.filter((_, idx) => idx !== i))}>
                        <Trash2 className="size-4 text-muted-foreground" />
                      </Button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between">
        {!fixedParts ? (
          <Button type="button" variant="outline" size="sm" onClick={() => setRows((rs) => [...rs, { partId: "", quantity: "1", unitCost: "" }])}>
            <Plus className="size-4" aria-hidden /> {t.purchase.addLine}
          </Button>
        ) : (
          <span />
        )}
        <p className="text-sm">
          {t.purchase.total}: <span className="font-semibold tabular-nums" dir="ltr">{formatMoney(total, lang)}</span>
        </p>
      </div>
    </div>
  );
}
