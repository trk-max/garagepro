import { updatePartAction } from "@/actions/catalog";
import { ActionForm } from "@/components/action-form";
import { StockMoveForm } from "@/components/stock/stock-move-form";
import { Button } from "@/components/ui/button";
import { Table, Td, Th } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { Dictionary } from "@/lib/i18n/fr";
import { formatMoney, formatQty, type Lang } from "@/lib/format";
import { cn } from "@/lib/utils";
import { isLow, type listParts } from "@/server/parts";

const dt = (millimes: number) => (millimes / 1000).toFixed(3);
const qty = (x100: number) => String(x100 / 100);

type Part = Awaited<ReturnType<typeof listParts>>[number];

/** The former parts table (stock, reserved, available, prices, adjust / edit forms), unchanged, in the V10 colours. */
export function PartsTable({ t, lang, parts, canEdit, suppliers }: { t: Dictionary; lang: Lang; parts: Part[]; canEdit: boolean; suppliers: { id: string; name: string }[] }) {
  const v = t.v7.stock;
  return (
    <Table>
      <thead>
        <tr>
          <Th>{t.parts.sku}</Th>
          <Th>{t.parts.name}</Th>
          <Th className="text-end">{t.parts.stock}</Th>
          <Th className="text-end">{v.reserved}</Th>
          <Th className="text-end">{v.available}</Th>
          <Th className="text-end">{t.parts.costPrice}</Th>
          <Th className="text-end">{t.parts.salePrice}</Th>
          {canEdit && <Th />}
        </tr>
      </thead>
      <tbody>
        {parts.map((p) => (
          <tr key={p.id} className="align-top">
            <Td className="font-mono text-xs">{p.sku}</Td>
            <Td>
              {p.name}
              {p.brand && <span className="text-xs text-muted-foreground"> · {p.brand}</span>}
            </Td>
            <Td className="text-end tabular-nums">
              <span className={cn(p.stockX100 <= 0 ? "font-semibold text-gp-danger-ink" : isLow(p) ? "font-semibold text-gp-accent-ink" : "")}>{formatQty(p.stockX100, lang)}</span>{" "}
              <span className="text-xs text-muted-foreground">{p.unit}</span>
              {isLow(p) && <div className="text-xs text-gp-accent-ink">{t.parts.low}</div>}
            </Td>
            <Td className="text-end tabular-nums text-muted-foreground">{p.reservedX100 ? formatQty(p.reservedX100, lang) : "—"}</Td>
            <Td className={cn("text-end tabular-nums", p.stockX100 - p.reservedX100 <= 0 && "font-semibold text-gp-danger-ink")}>{formatQty(p.stockX100 - p.reservedX100, lang)}</Td>
            <Td className="text-end tabular-nums text-muted-foreground" dir="ltr">{formatMoney(p.costPrice, lang)}</Td>
            <Td className="text-end tabular-nums" dir="ltr">{formatMoney(p.salePrice, lang)}</Td>
            {canEdit && (
              <Td className="w-48">
                <details>
                  <summary className="cursor-pointer text-xs font-medium">{t.parts.adjust}</summary>
                  <StockMoveForm t={t} partId={p.id} suppliers={suppliers} />
                </details>
                <details className="mt-1">
                  <summary className="cursor-pointer text-xs text-muted-foreground">{t.common.edit}</summary>
                  <ActionForm action={updatePartAction.bind(null, p.id)} reset={false} className="mt-2 space-y-2">
                    <Input name="sku" defaultValue={p.sku} required dir="ltr" aria-label={t.parts.sku} />
                    <Input name="name" defaultValue={p.name} required aria-label={t.parts.name} />
                    <Input name="brand" defaultValue={p.brand ?? ""} placeholder={t.parts.brand} />
                    <Input name="unit" defaultValue={p.unit} aria-label={t.parts.unit} />
                    <Input name="costPrice" defaultValue={dt(p.costPrice)} inputMode="decimal" dir="ltr" aria-label={t.parts.costPrice} />
                    <Input name="salePrice" defaultValue={dt(p.salePrice)} inputMode="decimal" required dir="ltr" aria-label={t.parts.salePrice} />
                    <Input name="minStock" defaultValue={qty(p.minStockX100)} inputMode="decimal" dir="ltr" aria-label={t.parts.minStock} />
                    <Button type="submit" size="sm" variant="secondary" className="w-full">
                      {t.common.save}
                    </Button>
                  </ActionForm>
                </details>
              </Td>
            )}
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
