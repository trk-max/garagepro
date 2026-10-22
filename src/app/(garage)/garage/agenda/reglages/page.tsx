import Link from "next/link";
import { createStarterCatalogueAction, saveAgendaSettingsAction, saveItemAction } from "@/actions/agenda";
import { ActionButton, ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, Field, NativeSelect, PageHeader, Textarea } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { DEFAULT_AGENDA_TEMPLATES, STARTER_ITEMS } from "@/lib/agenda";
import { fmt, formatKm } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { requirePageAccess } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { listItems, type AgendaItem } from "@/server/agenda";
import { getSettings } from "@/server/settings";

/** V12 — catalogue of maintenance items (typed by the garage), thresholds, messages, automatic sending (off). */
export default async function AgendaSettingsPage() {
  const staff = await requirePageAccess("configureAgenda");
  const [{ t, lang }, settings, items, parts, packages] = await Promise.all([
    getI18n(),
    getSettings(),
    listItems(true),
    prisma.part.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, sku: true, name: true }, take: 1000 }),
    prisma.servicePackage.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const v = t.v12.settings;
  const starter = new Map(STARTER_ITEMS.map((s) => [s.code, s]));
  const example = (code: string) => {
    const s = starter.get(code);
    if (!s) return null;
    const parts = [s.exampleKm ? formatKm(s.exampleKm, lang) : null, s.exampleMonths ? `${s.exampleMonths} ${lang === "ar" ? "شهرًا" : lang === "en" ? "months" : "mois"}` : null].filter(Boolean);
    return parts.length ? fmt(v.example, { value: parts.join(" / ") }) : null;
  };
  const canAuto = can(staff, "manageSettings");

  const itemForm = (item: AgendaItem | null) => (
    <ActionForm action={saveItemAction.bind(null, item?.id ?? null)} reset={!item} className="grid gap-3 sm:grid-cols-3">
      <Field label={v.nameFr}>
        <Input name="nameFr" required maxLength={80} defaultValue={item?.nameFr ?? ""} />
      </Field>
      <Field label={v.nameAr}>
        <Input name="nameAr" maxLength={80} defaultValue={item?.nameAr ?? ""} dir="rtl" />
      </Field>
      <Field label={v.nameEn}>
        <Input name="nameEn" maxLength={80} defaultValue={item?.nameEn ?? ""} />
      </Field>
      <Field label={v.keywords} className="sm:col-span-3">
        <Input name="keywords" defaultValue={item?.keywords.join(", ") ?? ""} />
      </Field>
      <Field label={v.intervalKm}>
        <Input name="intervalKm" inputMode="numeric" dir="ltr" defaultValue={item?.intervalKm ?? ""} placeholder={v.noReference} />
      </Field>
      <Field label={v.intervalMonths}>
        <Input name="intervalMonths" inputMode="numeric" dir="ltr" defaultValue={item?.intervalMonths ?? ""} placeholder={v.noReference} />
      </Field>
      <label className="flex items-end gap-2 pb-2 text-sm">
        <input type="checkbox" name="isActive" defaultChecked={item ? item.isActive : true} className="size-4" /> {v.active}
      </label>
      {item && example(item.code) && <p className="text-xs text-amber-700 sm:col-span-3 dark:text-amber-400">{example(item.code)}</p>}
      <Field label={v.parts}>
        <NativeSelect name="partIds" multiple defaultValue={item?.partIds ?? []} className="h-28">
          {parts.map((p) => (
            <option key={p.id} value={p.id}>
              {p.sku} · {p.name}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label={v.packages}>
        <NativeSelect name="packageIds" multiple defaultValue={item?.packageIds ?? []} className="h-28">
          {packages.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <div className="flex items-end">
        <Button type="submit">{item ? v.save : v.add}</Button>
      </div>
    </ActionForm>
  );

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
      <PageHeader title={v.title}>
        <Link href="/garage/agenda" className="text-sm underline-offset-4 hover:underline">
          {t.v12.nav}
        </Link>
      </PageHeader>

      <Card>
        <CardTitle>{v.thresholds}</CardTitle>
        <ActionForm action={saveAgendaSettingsAction} reset={false} className="grid gap-3 sm:grid-cols-3">
          <Field label={v.minCases}>
            <Input name="agendaMinCases" inputMode="numeric" dir="ltr" defaultValue={settings.agendaMinCases} />
          </Field>
          <Field label={v.goodCases}>
            <Input name="agendaGoodCases" inputMode="numeric" dir="ltr" defaultValue={settings.agendaGoodCases} />
          </Field>
          <Field label={v.leadDays}>
            <Input name="agendaLeadDays" inputMode="numeric" dir="ltr" defaultValue={settings.agendaLeadDays} />
          </Field>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="agendaAutoSend" defaultChecked={settings.agendaAutoSend} disabled={!canAuto && !settings.agendaAutoSend} className="size-4" />
            <span>
              {v.autoSend}
              <span className="block text-xs text-gp-muted">{canAuto ? v.autoSendHint : v.adminOnlyAuto}</span>
            </span>
          </label>
          <Field label={v.autoMin}>
            <NativeSelect name="agendaAutoMinConfidence" defaultValue={settings.agendaAutoMinConfidence}>
              {(["GOOD", "MEDIUM", "LOW"] as const).map((c) => (
                <option key={c} value={c}>
                  {t.v12.confidence[c]}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label={v.tplFr} className="sm:col-span-3">
            <Textarea name="tplAgendaFr" rows={2} maxLength={500} defaultValue={settings.tplAgendaFr ?? ""} placeholder={DEFAULT_AGENDA_TEMPLATES.fr} />
          </Field>
          <Field label={v.tplAr} className="sm:col-span-3">
            <Textarea name="tplAgendaAr" rows={2} maxLength={500} dir="rtl" defaultValue={settings.tplAgendaAr ?? ""} placeholder={DEFAULT_AGENDA_TEMPLATES.ar} />
          </Field>
          <p className="text-xs text-gp-muted sm:col-span-3">{v.tplHint}</p>
          <p className="text-xs text-gp-muted sm:col-span-3">{fmt(v.confidenceDoc, { good: settings.agendaGoodCases, min: settings.agendaMinCases })}</p>
          <div>
            <Button type="submit">{v.save}</Button>
          </div>
        </ActionForm>
      </Card>

      <Card>
        <CardTitle>{v.catalogue}</CardTitle>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <ActionButton action={createStarterCatalogueAction} variant="secondary">
            {v.starter}
          </ActionButton>
          <p className="flex-1 text-xs text-gp-muted">{v.starterHint}</p>
        </div>
        <div className="space-y-4">
          {items.map((item) => (
            <details key={item.id} className="rounded-[14px] border p-3" data-item={item.code}>
              <summary className="cursor-pointer text-sm font-medium">
                {item.nameFr}
                {item.nameAr && <span className="ms-2 text-gp-muted">· {item.nameAr}</span>}
                <span className="ms-2 text-xs text-gp-muted" dir="ltr">
                  {[item.intervalKm ? formatKm(item.intervalKm, lang) : null, item.intervalMonths ? `${item.intervalMonths} m` : null].filter(Boolean).join(" / ") || v.noReference}
                </span>
                {!item.isActive && <span className="ms-2 text-xs text-gp-danger-ink">(✕ {v.active})</span>}
              </summary>
              <div className="mt-3">{itemForm(item)}</div>
            </details>
          ))}
        </div>
        <div className="mt-6 border-t pt-4">
          <p className="mb-3 text-sm font-medium">{v.add}</p>
          {itemForm(null)}
        </div>
      </Card>
    </div>
  );
}
