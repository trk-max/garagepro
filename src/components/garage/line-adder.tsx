"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import type { LineType } from "@prisma/client";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Field, NativeSelect } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { formatMoney, formatQty } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";
import type { PartOption } from "@/server/parts";

type Result = { ok: true; data: { redirectTo?: string; warning?: string } } | { ok: false; error: string };

// Same lists as lib/quote (not imported here: that file uses Node's crypto, server only).
const LINE_PRIORITY_KEYS = ["SAFETY", "RECOMMENDED", "WATCH"] as const;
const PART_CONDITION_KEYS = ["NEW", "USED", "EXCHANGE", "REUSED", "CUSTOMER_SUPPLIED"] as const;

export function LineAdder({
  action,
  parts,
  laborRate,
  canAnnounceFee = false,
  comeback = false,
  canBillRework = false,
}: {
  action: (form: FormData) => Promise<Result>;
  parts: PartOption[];
  laborRate: number;
  /** V16 Lot 3 — offer « frais annoncé au client » (labour, before the quote, manageQuotes). */
  canAnnounceFee?: boolean;
  /** V16 Lot 5 — order linked as a comeback: labour is rework, 0 DT unless « bill it » is ticked (manageComebacks). */
  comeback?: boolean;
  canBillRework?: boolean;
}) {
  const { t, lang } = useI18n();
  const [type, setType] = useState<LineType>("LABOR");
  const [partId, setPartId] = useState("");
  const part = parts.find((p) => p.id === partId);

  return (
    <ActionForm action={action} silent className="grid items-end gap-3 rounded-md border border-dashed p-3 sm:grid-cols-[140px_minmax(0,1fr)_100px_130px_auto]">
      <Field label={t.workOrders.type}>
        <NativeSelect name="type" value={type} onChange={(e) => setType(e.target.value as LineType)}>
          <option value="LABOR">{t.lineType.LABOR}</option>
          <option value="PART">{t.lineType.PART}</option>
        </NativeSelect>
      </Field>

      {type === "PART" ? (
        <Field label={t.workOrders.partFromStock}>
          <NativeSelect name="partId" value={partId} onChange={(e) => setPartId(e.target.value)} required>
            <option value="">{t.workOrders.choosePart}</option>
            {parts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.sku} · {p.name}
                {p.brand ? ` (${p.brand})` : ""} — {formatQty(p.stockX100, lang)} {p.unit}
              </option>
            ))}
          </NativeSelect>
        </Field>
      ) : (
        <Field label={t.workOrders.description}>
          <Input name="description" required placeholder={t.workOrders.description} />
        </Field>
      )}

      <Field label={type === "LABOR" ? t.workOrders.hours : t.common.quantity}>
        <Input name="quantity" required inputMode="decimal" defaultValue="1" dir="ltr" />
      </Field>

      <Field label={t.common.unitPrice}>
        <Input
          name="unitPrice"
          inputMode="decimal"
          dir="ltr"
          placeholder={type === "LABOR" ? formatMoney(laborRate, lang) : part ? formatMoney(part.salePrice, lang) : ""}
        />
      </Field>

      <Button type="submit" className="gap-1">
        <Plus className="size-4" aria-hidden /> {t.common.add}
      </Button>

      {/* V16 Lot 2 — shown to the customer on the quote (both optional). */}
      <div className="grid gap-3 sm:col-span-full sm:grid-cols-2">
        <Field label={t.v16.quote.priorityLabel}>
          <NativeSelect name="priority" defaultValue="">
            <option value="">—</option>
            {LINE_PRIORITY_KEYS.map((p) => (
              <option key={p} value={p}>
                {t.v16.quote.priority[p]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        {type === "LABOR" && canAnnounceFee && (
          <label className="flex items-start gap-2 self-end pb-2 text-sm">
            <input type="checkbox" name="announcedFee" className="mt-0.5 size-4" />
            <span>
              {t.v16.lot3.refusal.announcedFeeAdd}
              <span className="block text-xs text-muted-foreground">{t.v16.lot3.refusal.announcedFeeHint}</span>
            </span>
          </label>
        )}
        {type === "LABOR" && comeback && (
          <div className="self-end pb-2 text-sm" data-testid="rework-labour">
            <p className="text-xs text-gp-accent-ink">{t.v16.lot5.comeback.labourFree}</p>
            {canBillRework && (
              <label className="mt-1 flex items-start gap-2">
                <input type="checkbox" name="billRework" className="mt-0.5 size-4" />
                <span>{t.v16.lot5.comeback.billRework}</span>
              </label>
            )}
          </div>
        )}
        {type === "PART" && (
          <Field label={t.v16.quote.conditionLabel}>
            <NativeSelect name="partCondition" defaultValue="">
              <option value="">—</option>
              {PART_CONDITION_KEYS.map((c) => (
                <option key={c} value={c}>
                  {t.v16.quote.condition[c]}
                </option>
              ))}
            </NativeSelect>
          </Field>
        )}
      </div>
    </ActionForm>
  );
}
