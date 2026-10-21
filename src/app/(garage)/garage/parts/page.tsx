import Link from "next/link";
import { createPartAction, moveStockAction, updatePartAction } from "@/actions/catalog";
import { correctMovementAction } from "@/actions/stock";
import { ReasonButton } from "@/components/team/prompt-action";
import { supplierOptions } from "@/server/purchasing";
import { ActionForm } from "@/components/action-form";
import { SearchForm } from "@/components/garage/search-form";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, Field, NativeSelect, PageHeader, Table, Td, Th } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { formatDateTime, formatMoney, formatQty, woNumber } from "@/lib/format";
import { LiveRefresh } from "@/components/live-refresh";
import { getI18n } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { requirePageAccess } from "@/lib/session";
import { cn } from "@/lib/utils";
import { isLow, listParts, recentMovements } from "@/server/parts";

type PageProps = { searchParams: Promise<{ q?: string; low?: string }> };

const dt = (millimes: number) => (millimes / 1000).toFixed(3);
const qty = (x100: number) => String(x100 / 100);

export default async function PartsPage({ searchParams }: PageProps) {
  const { q, low } = await searchParams;
  const staff = await requirePageAccess("viewStock");
  const canEdit = can(staff.role, "manageStock");
  const [{ t, lang }, parts, movements, suppliers] = await Promise.all([getI18n(), listParts(q, low === "1"), recentMovements(30), canEdit ? supplierOptions() : []]);
  const v = t.v7.stock;
  const canRequest = can(staff.role, "requestPurchase");

  return (
    <div className="mx-auto grid max-w-7xl gap-6 p-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0">
        <PageHeader title={t.parts.title}>
          <LiveRefresh url="/api/staff/live?topic=stock" liveLabel={t.portal.live} reconnectingLabel={t.portal.reconnecting} />
          <SearchForm placeholder={t.parts.searchPlaceholder} defaultValue={q} hidden={{ low }} />
          {canRequest && (
            <Button asChild size="sm">
              <Link href="/garage/purchase-orders/new?prefill=low">{t.purchase.new}</Link>
            </Button>
          )}
          <Link
            href={low === "1" ? "/garage/parts" : "/garage/parts?low=1"}
            className={cn("chip-tap rounded-full border px-3 py-1 text-xs", low === "1" ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent")}
          >
            {t.parts.lowOnly}
          </Link>
        </PageHeader>

        {parts.length === 0 ? (
          <p className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">{t.parts.empty}</p>
        ) : (
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
                    <span className={cn(p.stockX100 <= 0 ? "font-semibold text-red-700 dark:text-red-400" : isLow(p) ? "font-semibold text-amber-700 dark:text-amber-400" : "")}>
                      {formatQty(p.stockX100, lang)}
                    </span>{" "}
                    <span className="text-xs text-muted-foreground">{p.unit}</span>
                    {isLow(p) && <div className="text-xs text-amber-700 dark:text-amber-400">{t.parts.low}</div>}
                  </Td>
                  <Td className="text-end tabular-nums text-muted-foreground">{p.reservedX100 ? formatQty(p.reservedX100, lang) : "—"}</Td>
                  <Td className={cn("text-end tabular-nums", p.stockX100 - p.reservedX100 <= 0 && "font-semibold text-red-700 dark:text-red-400")}>{formatQty(p.stockX100 - p.reservedX100, lang)}</Td>
                  <Td className="text-end tabular-nums text-muted-foreground" dir="ltr">{formatMoney(p.costPrice, lang)}</Td>
                  <Td className="text-end tabular-nums" dir="ltr">{formatMoney(p.salePrice, lang)}</Td>
                  {canEdit && (
                    <Td className="w-48">
                      <details>
                        <summary className="cursor-pointer text-xs text-primary">{t.parts.adjust}</summary>
                        <ActionForm action={moveStockAction.bind(null, p.id)} className="mt-2 space-y-2">
                          <Input name="delta" required inputMode="decimal" placeholder="+10 / -2" dir="ltr" aria-label={t.parts.delta} />
                          <NativeSelect name="reason" defaultValue="PURCHASE" aria-label={t.parts.reason}>
                            <option value="PURCHASE">{t.parts.reasons.PURCHASE}</option>
                            <option value="ADJUSTMENT">{t.parts.reasons.ADJUSTMENT}</option>
                            <option value="SUPPLIER_RETURN">{t.parts.reasons.SUPPLIER_RETURN}</option>
                          </NativeSelect>
                          <NativeSelect name="supplierId" defaultValue="" aria-label={v.returnSupplier}>
                            <option value="">{v.returnSupplier} —</option>
                            {suppliers.map((sup) => (
                              <option key={sup.id} value={sup.id}>
                                {sup.name}
                              </option>
                            ))}
                          </NativeSelect>
                          <Input name="note" placeholder={t.common.notes} />
                          <Button type="submit" size="sm" className="w-full">
                            {t.common.save}
                          </Button>
                        </ActionForm>
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
        )}
      </div>

      <div className="space-y-6">
        {canEdit && (
          <Card>
            <CardTitle>{t.parts.new}</CardTitle>
            <ActionForm action={createPartAction} className="grid grid-cols-2 gap-3">
              <Field label={t.parts.sku}>
                <Input name="sku" required dir="ltr" className="uppercase" />
              </Field>
              <Field label={t.parts.brand}>
                <Input name="brand" />
              </Field>
              <Field label={t.parts.name} className="col-span-2">
                <Input name="name" required />
              </Field>
              <Field label={`${t.parts.costPrice} (DT)`}>
                <Input name="costPrice" inputMode="decimal" dir="ltr" />
              </Field>
              <Field label={`${t.parts.salePrice} (DT)`}>
                <Input name="salePrice" inputMode="decimal" required dir="ltr" />
              </Field>
              <Field label={t.parts.stock}>
                <Input name="stock" inputMode="decimal" dir="ltr" />
              </Field>
              <Field label={t.parts.minStock}>
                <Input name="minStock" inputMode="decimal" dir="ltr" />
              </Field>
              <Field label={t.parts.unit}>
                <Input name="unit" placeholder="pce, L, kit" />
              </Field>
              <div className="col-span-2">
                <Button type="submit" className="w-full">
                  {t.common.create}
                </Button>
              </div>
            </ActionForm>
          </Card>
        )}

        <Card>
          <CardTitle>{t.parts.movements}</CardTitle>
          <ul className="space-y-2 text-sm">
            {movements.map((m) => (
              <li key={m.id} className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate">
                    <span className="font-mono text-xs text-muted-foreground">{m.part.sku}</span> {m.part.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t.parts.reasons[m.reason]}
                    {m.workOrder && (
                      <>
                        {" · "}
                        <Link href={`/garage/work-orders/${m.workOrder.id}`} className="hover:underline">
                          {woNumber(m.workOrder.number)}
                        </Link>
                      </>
                    )}
                    {m.supplier && ` · ${m.supplier.name}`}
                    {" · "}
                    {formatDateTime(m.createdAt, lang)}
                  </p>
                  {m.note && <p className="text-xs text-muted-foreground">{m.note}</p>}
                  {m.correctedBy ? (
                    <p className="text-xs text-amber-700 dark:text-amber-400">{v.corrected}</p>
                  ) : (
                    canEdit &&
                    ["PURCHASE", "ADJUSTMENT", "SUPPLIER_RETURN"].includes(m.reason) && (
                      <ReasonButton className="mt-1 h-6" question={v.correctReason} action={correctMovementAction.bind(null, m.id)}>
                        {v.correct}
                      </ReasonButton>
                    )
                  )}
                </div>
                <span dir="ltr" className={cn("shrink-0 font-medium tabular-nums", m.deltaX100 > 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400")}>
                  {m.deltaX100 > 0 ? "+" : ""}
                  {formatQty(m.deltaX100, lang)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
