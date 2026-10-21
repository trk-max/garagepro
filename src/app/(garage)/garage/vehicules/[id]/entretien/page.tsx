import Link from "next/link";
import { notFound } from "next/navigation";
import { createPlanAction, markPlanDoneAction, setPlanActiveAction } from "@/actions/reminders";
import { ActionButton, ActionForm } from "@/components/action-form";
import { PlateChip } from "@/components/garage/badges";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, Field, NativeSelect, PageHeader } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { fmt, formatDate, formatKm } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { requirePageAccess } from "@/lib/session";
import { cn } from "@/lib/utils";
import { vehiclePlans } from "@/server/maintenance";
import { MAINTENANCE_KINDS } from "@/server/reminders";

type PageProps = { params: Promise<{ id: string }> };

/** Staff: maintenance plans of one vehicle (oil change, filters, service…) and their next due date. */
export default async function VehicleMaintenancePage({ params }: PageProps) {
  await requirePageAccess("manageMaintenance");
  const { id } = await params;
  const [data, { t, lang }] = await Promise.all([vehiclePlans(id), getI18n()]);
  if (!data) notFound();
  const { vehicle, plans } = data;
  const m = t.v7.maintenance;
  const today = new Date().toISOString().slice(0, 10);
  const statusCls = { OK: "text-emerald-700 dark:text-emerald-400", SOON: "text-amber-700 dark:text-amber-400", OVERDUE: "text-red-600 dark:text-red-400 font-semibold", UNKNOWN: "text-muted-foreground" } as const;

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 sm:p-6">
      <PageHeader title={m.title}>
        <Link href={`/garage/customers/${vehicle.customerId}#vehicule-${vehicle.id}`} className="text-sm underline-offset-4 hover:underline">
          {vehicle.customer.name}
        </Link>
      </PageHeader>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <PlateChip plate={vehicle.plate} />
        <span className="font-medium">
          {vehicle.make} {vehicle.model}
        </span>
        <span className="text-muted-foreground" dir="ltr">
          {m.lastKm} : {vehicle.mileage === null ? m.kmNotRecorded : formatKm(vehicle.mileage, lang)}
        </span>
      </div>
      {vehicle.customer.reminderOptOut && <p className="border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">{m.optedOut}</p>}

      {plans.length === 0 ? (
        <p className="border border-dashed p-8 text-center text-sm text-muted-foreground">{m.none}</p>
      ) : (
        <div className="space-y-3">
          {plans.map((p) => (
            <Card key={p.id} className={cn(!p.isActive && "opacity-60")}>
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{p.kind === "OTHER" && p.label ? p.label : (m.kinds[p.kind as keyof typeof m.kinds] ?? p.kind)}</p>
                  <p className="text-xs text-muted-foreground">
                    {[p.intervalDays && fmt(m.everyDays, { n: p.intervalDays }), p.intervalKm && fmt(m.everyKm, { n: p.intervalKm.toLocaleString("fr-FR") })].filter(Boolean).join(" · ")}
                  </p>
                  <p className="mt-1 text-sm">
                    {m.lastDone} : {p.lastDoneAt ? formatDate(p.lastDoneAt, lang) : "—"}
                    {p.lastDoneKm !== null && <span dir="ltr"> · {formatKm(p.lastDoneKm, lang)}</span>}
                  </p>
                  <p className="text-sm">
                    {m.next} : {p.due.dueDate ? formatDate(p.due.dueDate, lang) : "—"}
                    {p.due.dueKm !== null && <span dir="ltr"> · {formatKm(p.due.dueKm, lang)}</span>}{" "}
                    <span className={statusCls[p.due.status]}>({m.status[p.due.status]})</span>
                  </p>
                  {p.due.kmUnknown && <p className="text-xs text-amber-700 dark:text-amber-400">{m.kmUnknown}</p>}
                </div>
                <div className="flex flex-col items-end gap-2">
                  {p.isActive && (
                    <ActionForm action={markPlanDoneAction.bind(null, p.id)} reset={false} className="flex flex-wrap items-end gap-2">
                      <Input type="date" name="doneAt" defaultValue={today} className="h-8 w-36" aria-label={m.doneAt} />
                      <Input name="km" inputMode="numeric" placeholder={m.kmPlaceholder} defaultValue={vehicle.mileage ?? ""} className="h-8 w-28" dir="ltr" aria-label={m.kmAt} />
                      <Button type="submit" size="sm">
                        {m.markDone}
                      </Button>
                    </ActionForm>
                  )}
                  <ActionButton size="sm" variant="ghost" action={setPlanActiveAction.bind(null, p.id, !p.isActive)}>
                    {p.isActive ? m.disable : m.enable}
                  </ActionButton>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardTitle>{m.add}</CardTitle>
        <ActionForm action={createPlanAction.bind(null, vehicle.id)} className="grid gap-3 sm:grid-cols-3">
          <Field label={m.kind}>
            <NativeSelect name="kind" defaultValue="OIL">
              {MAINTENANCE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {m.kinds[k]}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label={m.label}>
            <Input name="label" maxLength={80} />
          </Field>
          <div />
          <Field label={m.intervalDays}>
            <Input name="intervalDays" inputMode="numeric" placeholder="180" dir="ltr" />
          </Field>
          <Field label={m.intervalKm}>
            <Input name="intervalKm" inputMode="numeric" placeholder="10000" dir="ltr" />
          </Field>
          <div />
          <Field label={m.lastDone}>
            <Input type="date" name="lastDoneAt" />
          </Field>
          <Field label={m.lastDoneKm}>
            <Input name="lastDoneKm" inputMode="numeric" dir="ltr" />
          </Field>
          <div className="sm:col-span-3">
            <p className="mb-2 text-xs text-muted-foreground">{m.addHint}</p>
            <Button type="submit">{t.common.add}</Button>
          </div>
        </ActionForm>
      </Card>
    </div>
  );
}
