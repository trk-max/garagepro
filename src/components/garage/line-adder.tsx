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

export function LineAdder({
  action,
  parts,
  laborRate,
}: {
  action: (form: FormData) => Promise<Result>;
  parts: PartOption[];
  laborRate: number;
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
    </ActionForm>
  );
}
