import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Eye, EyeOff, FileText, MessageCircle, Printer, Trash2 } from "lucide-react";
import { Priority } from "@prisma/client";
import {
  addLineAction,
  addNoteAction,
  applyPackageAction,
  assignAction,
  changeStatusAction,
  createInvoiceAction,
  removeLineAction,
  updateMetaAction,
} from "@/actions/work-orders";
import { deleteMediaAction, toggleMediaAction } from "@/actions/workshop";
import { ActionButton, ActionForm, ActionSelect } from "@/components/action-form";
import { MediaUploader } from "@/components/garage/media-uploader";
import { TrackingCard } from "@/components/garage/tracking-card";
import { LiveRefresh } from "@/components/live-refresh";
import { getBaseUrl } from "@/lib/base-url";
import { InvoiceBadge, PlateChip, PriorityBadge, StatusBadge } from "@/components/garage/badges";
import { LineAdder } from "@/components/garage/line-adder";
import { Timeline } from "@/components/garage/timeline";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, Field, NativeSelect, Table, Td, Textarea, Th } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { computeTotals, displayPlate, fmt, formatDate, formatDateTime, formatKm, formatMoney, formatQty, lineTotalHt, woNumber } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { utcToZoned } from "@/lib/booking";
import { can } from "@/lib/permissions";
import { requirePageAccess } from "@/lib/session";
import { packageOptions } from "@/server/admin";
import { partOptions } from "@/server/parts";
import { getSettings } from "@/server/settings";
import { getVehicleHistory, getWorkOrder, listMechanics } from "@/server/work-orders";
import { NEXT_STEP, TRANSITIONS, isFinal } from "@/server/workflow";

type PageProps = { params: Promise<{ id: string }> };

const toLocalInput = (d: Date | null, tz: string) => {
  if (!d) return "";
  const z = utcToZoned(d, tz);
  return `${z.date}T${z.time}`;
};

export default async function WorkOrderPage({ params }: PageProps) {
  const staff = await requirePageAccess("viewWorkOrders");
  const { id } = await params;
  const wo = await getWorkOrder(id);
  if (!wo) notFound();

  const [{ t, lang }, settings, parts, packages, mechanics, history, baseUrl] = await Promise.all([
    getI18n(),
    getSettings(),
    partOptions(),
    packageOptions(),
    listMechanics(),
    getVehicleHistory(wo.vehicleId, wo.id),
    getBaseUrl(),
  ]);
  const customerApproval = wo.events.find((e) => e.type === "QUOTE_APPROVED");
  const unreadCustomerMessages = wo.events.filter((e) => e.type === "CUSTOMER_MESSAGE").slice(0, 3);

  const final = isFinal(wo.status);
  const linesLocked = final || Boolean(wo.invoice);
  const canInvoice = can(staff?.role, "createInvoice");
  const canSeeInvoice = can(staff?.role, "viewClientInvoices");
  const totals = computeTotals(wo.lines, settings.stampDuty);
  const next = NEXT_STEP[wo.status];

  return (
    <div className="grid min-h-full grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px]">
      {/* ── Center: header, works, diagnosis, history ── */}
      <section className="min-w-0 space-y-5 p-6">
        <header className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-sm text-muted-foreground">{woNumber(wo.number)}</span>
            <PlateChip plate={wo.vehicle.plate} />
            <h1 className="text-xl font-semibold">
              {wo.vehicle.make} {wo.vehicle.model}
            </h1>
            <StatusBadge status={wo.status} t={t} />
            <PriorityBadge priority={wo.priority} t={t} />
            <LiveRefresh url={`/api/staff/stream?topic=wo:${wo.id}`} liveLabel={t.portal.live} reconnectingLabel={t.portal.reconnecting} className="ms-auto" />
          </div>
          {customerApproval && wo.status !== "DELIVERED" && (
            <p className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="size-4" aria-hidden /> {fmt(t.tracking.customerApproved, { date: formatDateTime(customerApproval.createdAt, lang) })}
            </p>
          )}
          {unreadCustomerMessages.length > 0 && !final && (
            <ul className="space-y-1">
              {unreadCustomerMessages.map((m) => (
                <li key={m.id} className="flex items-start gap-2 rounded-md border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-sm">
                  <MessageCircle className="mt-0.5 size-4 shrink-0 text-blue-700 dark:text-blue-400" aria-hidden />
                  <span className="flex-1 whitespace-pre-line">{m.body}</span>
                  <time className="shrink-0 text-xs text-muted-foreground">{formatDateTime(m.createdAt, lang)}</time>
                </li>
              ))}
            </ul>
          )}
          <p className="text-sm text-muted-foreground">
            {t.workOrders.complaint}: <span className="text-foreground">{wo.complaint}</span>
          </p>

          <div className="flex flex-wrap items-center gap-2">
            {next && (
              <ActionButton action={changeStatusAction.bind(null, wo.id, next)}>
                {t.workOrders.nextStep}: {t.status[next]}
              </ActionButton>
            )}
            {!final && (
              <ActionSelect
                key={`status-${wo.status}`}
                ariaLabel={t.workOrders.changeStatus}
                action={changeStatusAction.bind(null, wo.id)}
                defaultValue={wo.status}
                options={[wo.status, ...TRANSITIONS[wo.status]].map((s) => ({ value: s, label: t.status[s] }))}
              />
            )}
            <ActionSelect
              key={`mech-${wo.mechanicId ?? ""}`}
              ariaLabel={t.workOrders.mechanic}
              action={assignAction.bind(null, wo.id)}
              defaultValue={wo.mechanicId ?? ""}
              disabled={final}
              options={[{ value: "", label: t.workOrders.unassigned }, ...mechanics.filter((m) => m.role === "MECHANIC" || m.role === "ADMIN").map((m) => ({ value: m.id, label: m.name }))]}
            />
            <div className="ms-auto flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href={`/garage/work-orders/${wo.id}/quote`} target="_blank">
                  <Printer className="size-4" aria-hidden /> {t.workOrders.printQuote}
                </Link>
              </Button>
              {wo.invoice ? (
                canSeeInvoice && (
                <Button asChild variant="outline" size="sm">
                  <Link href={`/garage/invoices/${wo.invoice.id}`}>
                    <FileText className="size-4" aria-hidden /> {wo.invoice.number}
                  </Link>
                </Button>
                )
              ) : (
                canInvoice &&
                wo.status !== "CANCELLED" && (
                  <ActionButton size="sm" action={createInvoiceAction.bind(null, wo.id)} disabled={wo.lines.length === 0}>
                    <FileText className="size-4" aria-hidden /> {t.workOrders.createInvoice}
                  </ActionButton>
                )
              )}
            </div>
          </div>
        </header>

        {/* ── Lines ── */}
        <Card>
          <CardTitle>{t.workOrders.lines}</CardTitle>
          {linesLocked && (
            <p className="mb-3 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
              {final ? t.workOrders.finalLocked : t.workOrders.locked}
            </p>
          )}

          {wo.lines.length === 0 ? (
            <p className="mb-3 text-sm text-muted-foreground">{t.workOrders.noLines}</p>
          ) : (
            <Table className="mb-3">
              <thead>
                <tr>
                  <Th>{t.workOrders.type}</Th>
                  <Th>{t.workOrders.description}</Th>
                  <Th className="text-end">{t.common.quantity}</Th>
                  <Th className="text-end">{t.common.unitPrice}</Th>
                  <Th className="text-end">{t.invoices.totalHt}</Th>
                  {!linesLocked && <Th />}
                </tr>
              </thead>
              <tbody>
                {wo.lines.map((line) => (
                  <tr key={line.id}>
                    <Td className="text-xs text-muted-foreground">{t.lineType[line.type]}</Td>
                    <Td>
                      {line.description}
                      {line.part && <span className="ms-2 font-mono text-xs text-muted-foreground">{line.part.sku}</span>}
                    </Td>
                    <Td className="text-end tabular-nums">{formatQty(line.quantityX100, lang)}</Td>
                    <Td className="text-end tabular-nums" dir="ltr">{formatMoney(line.unitPrice, lang)}</Td>
                    <Td className="text-end font-medium tabular-nums" dir="ltr">{formatMoney(lineTotalHt(line), lang)}</Td>
                    {!linesLocked && (
                      <Td className="w-10">
                        <ActionButton
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t.common.delete}
                          action={removeLineAction.bind(null, wo.id, line.id)}
                        >
                          <Trash2 className="size-4 text-muted-foreground" />
                        </ActionButton>
                      </Td>
                    )}
                  </tr>
                ))}
              </tbody>
            </Table>
          )}

          {wo.lines.length > 0 && (
            <dl className="ms-auto mb-4 w-full max-w-xs space-y-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t.invoices.totalHt}</dt>
                <dd className="tabular-nums" dir="ltr">{formatMoney(totals.totalHt, lang)}</dd>
              </div>
              {totals.taxByRate.map((r) => (
                <div key={r.rateBp} className="flex justify-between">
                  <dt className="text-muted-foreground">{fmt(t.invoices.vat, { rate: r.rateBp / 100 })}</dt>
                  <dd className="tabular-nums" dir="ltr">{formatMoney(r.tax, lang)}</dd>
                </div>
              ))}
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t.invoices.stampDuty}</dt>
                <dd className="tabular-nums" dir="ltr">{formatMoney(totals.stampDuty, lang)}</dd>
              </div>
              <div className="flex justify-between border-t pt-1 text-base font-semibold">
                <dt>{t.invoices.totalTtc}</dt>
                <dd className="tabular-nums" dir="ltr">{formatMoney(totals.totalTtc, lang)}</dd>
              </div>
            </dl>
          )}

          {!linesLocked && (
            <div className="space-y-3">
              <LineAdder action={addLineAction.bind(null, wo.id)} parts={parts} laborRate={settings.laborRate} />
              {packages.length > 0 && (
                <ActionForm action={applyPackageAction.bind(null, wo.id)} silent className="flex flex-wrap items-end gap-2">
                  <Field label={t.workOrders.applyPackage} className="min-w-60 flex-1">
                    <NativeSelect name="packageId" required defaultValue="">
                      <option value="">{t.workOrders.choosePackage}</option>
                      {packages.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                  <Button type="submit" variant="secondary">
                    {t.common.add}
                  </Button>
                </ActionForm>
              )}
            </div>
          )}
        </Card>

        {/* ── Photos & videos (shared with the customer when "visible") ── */}
        <Card>
          <CardTitle>{t.tracking.media}</CardTitle>
          {wo.status !== "CANCELLED" && can(staff.role, "uploadMedia") && <MediaUploader workOrderId={wo.id} />}
          {wo.media.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">{t.tracking.noMedia}</p>
          ) : (
            <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {wo.media.map((m) => (
                <li key={m.id} className="overflow-hidden rounded-md border">
                  <a href={`/api/media/${m.id}`} target="_blank" rel="noopener" className="block aspect-video bg-muted">
                    {m.kind === "PHOTO" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/api/media/${m.id}`} alt={m.caption ?? ""} loading="lazy" decoding="async" className="size-full object-cover" />
                    ) : (
                      <video src={`/api/media/${m.id}#t=0.5`} preload="metadata" muted className="size-full object-cover" />
                    )}
                  </a>
                  <div className="space-y-1 p-2 text-xs">
                    {m.caption && <p className="line-clamp-2">{m.caption}</p>}
                    <p className="text-muted-foreground">
                      {m.uploadedBy?.name ?? ""} · {formatDateTime(m.createdAt, lang)}
                    </p>
                    {can(staff.role, "uploadMedia") && (
                      <div className="flex items-center gap-1">
                        <ActionButton
                          size="sm"
                          variant={m.visibleToCustomer ? "secondary" : "outline"}
                          className="h-7 flex-1 px-2 text-xs"
                          action={toggleMediaAction.bind(null, m.id, !m.visibleToCustomer)}
                        >
                          {m.visibleToCustomer ? <Eye className="size-3.5" aria-hidden /> : <EyeOff className="size-3.5" aria-hidden />}
                          {m.visibleToCustomer ? t.tracking.visible : t.tracking.hidden}
                        </ActionButton>
                        <ActionButton size="icon-sm" variant="ghost" aria-label={t.common.delete} confirm={`${t.common.delete} ?`} action={deleteMediaAction.bind(null, m.id)}>
                          <Trash2 className="size-3.5 text-muted-foreground" />
                        </ActionButton>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* ── Diagnosis & planning ── */}
        <Card>
          <CardTitle>{t.workOrders.diagnosis}</CardTitle>
          <ActionForm action={updateMetaAction.bind(null, wo.id)} reset={false} className="grid gap-3 sm:grid-cols-3">
            <Field label={t.workOrders.diagnosis} className="sm:col-span-3">
              <Textarea name="diagnosis" defaultValue={wo.diagnosis ?? ""} placeholder={t.workOrders.diagnosisPlaceholder} rows={3} disabled={final} />
            </Field>
            <Field label={t.workOrders.priority}>
              <NativeSelect name="priority" defaultValue={wo.priority} disabled={final}>
                {Object.values(Priority).map((p) => (
                  <option key={p} value={p}>
                    {t.priority[p]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label={t.workOrders.promisedAt}>
              <Input name="promisedAt" type="datetime-local" min="2000-01-01T00:00" max="2100-12-31T23:59" defaultValue={toLocalInput(wo.promisedAt, settings.timezone)} dir="ltr" disabled={final} />
            </Field>
            <Field label={t.workOrders.mileageIn}>
              <Input name="mileageIn" type="number" min={0} defaultValue={wo.mileageIn ?? ""} dir="ltr" disabled={final} />
            </Field>
            {!final && (
              <div className="sm:col-span-3">
                <Button type="submit" variant="secondary">
                  {t.workOrders.saveDiagnosis}
                </Button>
              </div>
            )}
          </ActionForm>
        </Card>

        {/* ── Timeline ── */}
        <Card>
          <CardTitle>{t.workOrders.timeline}</CardTitle>
          <ActionForm action={addNoteAction.bind(null, wo.id)} silent className="mb-4 flex gap-2">
            <Input name="body" required placeholder={t.workOrders.notePlaceholder} />
            <Button type="submit" variant="secondary">
              {t.common.add}
            </Button>
          </ActionForm>
          <Timeline events={wo.events} t={t} lang={lang} />
        </Card>
      </section>

      {/* ── Right: customer, vehicle, history, invoice ── */}
      <aside className="space-y-4 border-s bg-muted/20 p-5">
        {!final && can(staff.role, "manageTracking") && (
          <TrackingCard
            workOrderId={wo.id}
            pin={wo.trackingPin}
            link={`${baseUrl}/suivi?plate=${wo.vehicle.plate}`}
            shareText={
              wo.trackingPin
                ? fmt(t.tracking.shareMessage, {
                    name: wo.customer.name.split(/\s+/)[0] ?? wo.customer.name,
                    vehicle: `${wo.vehicle.make} ${wo.vehicle.model}`,
                    url: `${baseUrl}/suivi?plate=${wo.vehicle.plate}`,
                    plate: displayPlate(wo.vehicle.plate),
                    pin: wo.trackingPin,
                    garage: settings.garageName,
                  })
                : ""
            }
            phone={wo.customer.phone}
          />
        )}
        {wo.appointment && (
          <p className="rounded-md border bg-background px-3 py-2 text-xs text-muted-foreground">
            {t.nav.appointments} <span className="font-mono">{wo.appointment.reference}</span> · {formatDateTime(wo.appointment.startAt, lang)}
          </p>
        )}
        <Card>
          <CardTitle>{t.workOrders.customer}</CardTitle>
          <Link href={`/garage/customers/${wo.customer.id}`} className="font-medium hover:underline">
            {wo.customer.name}
          </Link>
          <dl className="mt-2 space-y-1 text-sm text-muted-foreground">
            <dd>
              <a href={`tel:${wo.customer.phone}`} dir="ltr" className="hover:underline">
                {wo.customer.phone}
              </a>
            </dd>
            {wo.customer.email && <dd dir="ltr">{wo.customer.email}</dd>}
            {wo.customer.notes && <dd className="whitespace-pre-line text-foreground">{wo.customer.notes}</dd>}
          </dl>
        </Card>

        <Card>
          <CardTitle>{t.workOrders.vehicle}</CardTitle>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
            <dt className="text-muted-foreground">{t.customers.plate}</dt>
            <dd dir="ltr">{displayPlate(wo.vehicle.plate)}</dd>
            <dt className="text-muted-foreground">{t.customers.year}</dt>
            <dd>{wo.vehicle.year ?? t.common.none}</dd>
            <dt className="text-muted-foreground">{t.customers.fuel}</dt>
            <dd>{wo.vehicle.fuel ? t.fuel[wo.vehicle.fuel] : t.common.none}</dd>
            <dt className="text-muted-foreground">{t.workOrders.mileageIn}</dt>
            <dd dir="ltr">{formatKm(wo.mileageIn ?? wo.vehicle.mileage, lang)}</dd>
            {wo.vehicle.vin && (
              <>
                <dt className="text-muted-foreground">VIN</dt>
                <dd className="truncate font-mono text-xs" dir="ltr">{wo.vehicle.vin}</dd>
              </>
            )}
            <dt className="text-muted-foreground">{t.workOrders.createdAt}</dt>
            <dd>{formatDate(wo.createdAt, lang)}</dd>
            {wo.promisedAt && (
              <>
                <dt className="text-muted-foreground">{t.workOrders.promisedAt}</dt>
                <dd>{formatDateTime(wo.promisedAt, lang)}</dd>
              </>
            )}
          </dl>
        </Card>

        {wo.invoice && canSeeInvoice && (
          <Card>
            <CardTitle>{t.invoices.invoice}</CardTitle>
            <div className="flex items-center justify-between gap-2 text-sm">
              <Link href={`/garage/invoices/${wo.invoice.id}`} className="font-mono hover:underline">
                {wo.invoice.number}
              </Link>
              <InvoiceBadge status={wo.invoice.status} t={t} />
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {t.invoices.balance}:{" "}
              <span className="font-medium text-foreground" dir="ltr">
                {formatMoney(wo.invoice.totalTtc - wo.invoice.paidAmount, lang)}
              </span>
            </p>
          </Card>
        )}

        <Card>
          <CardTitle>{t.workOrders.history}</CardTitle>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t.workOrders.noHistory}</p>
          ) : (
            <ul className="space-y-2">
              {history.map((h) => (
                <li key={h.id}>
                  <Link href={`/garage/work-orders/${h.id}`} className="block rounded-md px-2 py-1.5 hover:bg-accent">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-mono">{woNumber(h.number)}</span>
                      <span>{formatDate(h.createdAt, lang)}</span>
                      <span className="ms-auto" dir="ltr">{formatKm(h.mileageIn, lang)}</span>
                    </div>
                    <p className="line-clamp-1 text-sm">{h.complaint}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </aside>
    </div>
  );
}
