import Link from "next/link";
import { saveCounterAction, saveQueueSettingsAction, saveReasonAction } from "@/actions/accueil";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, Field, NativeSelect, PageHeader } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { REASON_KINDS } from "@/lib/accueil";
import { getI18n } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { requirePageAccess } from "@/lib/session";
import { getQueueSettings, listCounters, listReasons } from "@/server/accueil";

/** V15 — reception settings: queue rules, waiting-room screen, printer, visit reasons, counters. */
export default async function ReceptionSettingsPage() {
  const staff = await requirePageAccess("configureReception");
  const [{ t }, qs, reasons, counters] = await Promise.all([getI18n(), getQueueSettings(), listReasons(true), listCounters(true)]);
  const v = t.v15.settings;
  const num = (name: keyof typeof qs, label: string, min: number, max: number) => (
    <Field label={label}>
      <Input name={name} type="number" min={min} max={max} required defaultValue={String(qs[name] ?? "")} dir="ltr" className="h-9" />
    </Field>
  );

  type ReasonRow = (typeof reasons)[number];
  const reasonForm = (r: ReasonRow | null) => (
    <ActionForm key={r?.id ?? "new"} action={saveReasonAction.bind(null, r?.id ?? null)} reset={!r} className="grid items-end gap-2 border-t py-3 sm:grid-cols-[5rem_4rem_1fr_1fr_1fr_9rem_4rem_auto]">
      <Field label={v.code}>
        <Input name="code" required maxLength={20} defaultValue={r?.code ?? ""} dir="ltr" className="h-9 font-mono uppercase" />
      </Field>
      <Field label={v.prefix}>
        <Input name="prefix" required maxLength={2} defaultValue={r?.prefix ?? ""} dir="ltr" className="h-9 font-mono uppercase" />
      </Field>
      <Field label={v.nameFr}>
        <Input name="nameFr" required maxLength={60} defaultValue={r?.nameFr ?? ""} className="h-9" />
      </Field>
      <Field label={v.nameAr}>
        <Input name="nameAr" maxLength={60} defaultValue={r?.nameAr ?? ""} dir="rtl" className="h-9" />
      </Field>
      <Field label={v.nameEn}>
        <Input name="nameEn" maxLength={60} defaultValue={r?.nameEn ?? ""} className="h-9" />
      </Field>
      <Field label={v.kind}>
        <NativeSelect name="kind" defaultValue={r?.kind ?? "OTHER"}>
          {REASON_KINDS.map((k) => (
            <option key={k} value={k}>
              {t.v15.kinds[k]}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label={v.position}>
        <Input name="position" type="number" min={0} max={999} defaultValue={String(r?.position ?? reasons.length + 1)} dir="ltr" className="h-9" />
      </Field>
      <div className="flex flex-wrap items-center gap-3 pb-1 text-sm">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" name="fast" defaultChecked={r?.fast ?? false} className="size-4" /> {v.fast}
        </label>
        {r && (
          <label className="flex items-center gap-1.5">
            <input type="checkbox" name="isActive" defaultChecked={r.isActive} className="size-4" /> {v.active}
          </label>
        )}
        <Button type="submit" size="sm">
          {r ? v.save : v.add}
        </Button>
      </div>
    </ActionForm>
  );

  type CounterRow = (typeof counters)[number];
  const counterForm = (c: CounterRow | null) => (
    <ActionForm key={c?.id ?? "new"} action={saveCounterAction.bind(null, c?.id ?? null)} reset={!c} className="grid items-end gap-2 border-t py-3 sm:grid-cols-[1fr_1fr_5rem_auto]">
      <Field label={v.counterName}>
        <Input name="name" required maxLength={40} defaultValue={c?.name ?? ""} className="h-9" />
      </Field>
      <Field label={v.counterNameAr}>
        <Input name="nameAr" maxLength={40} defaultValue={c?.nameAr ?? ""} dir="rtl" className="h-9" />
      </Field>
      <Field label={v.position}>
        <Input name="position" type="number" min={0} max={999} defaultValue={String(c?.position ?? counters.length + 1)} dir="ltr" className="h-9" />
      </Field>
      <div className="flex items-center gap-3 pb-1 text-sm">
        {c && (
          <label className="flex items-center gap-1.5">
            <input type="checkbox" name="isActive" defaultChecked={c.isActive} className="size-4" /> {v.active}
          </label>
        )}
        <Button type="submit" size="sm">
          {c ? v.save : v.add}
        </Button>
      </div>
    </ActionForm>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <PageHeader title={v.title} subtitle={v.subtitle}>
        <Link href="/garage/accueil" className="inline-flex h-10 items-center rounded-full border px-4 text-sm hover:bg-muted">
          {t.v15.desk.title}
        </Link>
        {can(staff, "manageReceptionDevices") && (
          <Link href="/garage/settings#accueil-appareils" className="inline-flex h-10 items-center rounded-full border px-4 text-sm hover:bg-muted">
            {t.v15.devices.title}
          </Link>
        )}
      </PageHeader>

      <Card>
        <CardTitle>{v.queue}</CardTitle>
        <ActionForm action={saveQueueSettingsAction} reset={false} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {num("waitWindow", v.waitWindow, 1, 500)}
          {num("waitMinTickets", v.waitMinTickets, 1, 100)}
          {num("apptWindowMin", v.apptWindowMin, 0, 240)}
          {num("maxCalls", v.maxCalls, 1, 10)}
          {num("callTimeoutSec", v.callTimeoutSec, 10, 3600)}
          {num("aheadThreshold", v.aheadThreshold, 0, 20)}
          {num("waitAlertMin", v.waitAlertMin, 1, 600)}
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="fastFirst" defaultChecked={qs.fastFirst} className="size-4" /> {v.fastFirst}
          </label>

          <h3 className="mt-2 text-sm font-semibold sm:col-span-2 lg:col-span-3">{v.screen}</h3>
          <Field label={v.screenLangMode}>
            <NativeSelect name="screenLangMode" defaultValue={qs.screenLangMode}>
              <option value="ALTERNATE">{v.langAlternate}</option>
              <option value="SIDE">{v.langSide}</option>
            </NativeSelect>
          </Field>
          <Field label={v.screenTheme}>
            <NativeSelect name="screenTheme" defaultValue={qs.screenTheme}>
              <option value="DARK">{v.dark}</option>
              <option value="LIGHT">{v.light}</option>
            </NativeSelect>
          </Field>
          <label className="flex items-center gap-2 text-sm sm:col-span-2 lg:col-span-3">
            <input type="checkbox" name="screenMaskedPlate" defaultChecked={qs.screenMaskedPlate} className="size-4" /> {v.screenMaskedPlate}
          </label>

          <h3 className="mt-2 text-sm font-semibold sm:col-span-2 lg:col-span-3">{v.printer}</h3>
          <Field label={v.printerHost} hint={v.printerHint}>
            <Input name="printerHost" maxLength={253} defaultValue={qs.printerHost ?? ""} dir="ltr" placeholder="192.168.1.50" className="h-9" />
          </Field>
          {num("printerPort", v.printerPort, 1, 65535)}
          <div className="flex items-end sm:col-span-2 lg:col-span-3">
            <Button type="submit">{v.save}</Button>
          </div>
        </ActionForm>
      </Card>

      <Card>
        <CardTitle>{v.reasons}</CardTitle>
        <p className="-mt-2 mb-2 text-sm text-muted-foreground">{v.reasonsHint}</p>
        {reasons.map((r) => reasonForm(r))}
        {reasonForm(null)}
      </Card>

      <Card>
        <CardTitle>{v.counters}</CardTitle>
        {counters.map((c) => counterForm(c))}
        {counterForm(null)}
      </Card>
    </div>
  );
}
