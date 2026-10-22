import Link from "next/link";
import { notFound } from "next/navigation";
import { Activity, Ban, CheckCircle2, Eye, EyeOff, FileText, MessageCircle, Printer, Trash2 } from "lucide-react";
import { Priority } from "@prisma/client";
import {
  addLineAction,
  addNoteAction,
  applyPackageAction,
  assignAction,
  changeStatusAction,
  changeStatusFormAction,
  createInvoiceAction,
  removeLineAction,
  updateMetaAction,
} from "@/actions/work-orders";
import { deleteMediaAction, toggleMediaAction } from "@/actions/workshop";
import { ActionButton, ActionForm, ActionSelect } from "@/components/action-form";
import { StatusDialog, VoidLineDialog, type StatusChoice } from "@/components/garage/status-dialog";
import { MediaUploader } from "@/components/garage/media-uploader";
import { RepairPanels } from "@/components/garage/repair-panels";
import { ProfitPanel } from "@/components/garage/profit-panel";
import { WarrantyCard } from "@/components/garage/warranty";
import { RelatedContracts } from "@/components/garage/contracts";
import { IntakeCard } from "@/components/garage/intake-card";
import { canContract } from "@/lib/contracts";
import { ReservationsCard } from "@/components/garage/reservations-card";
import { OrderSuggestions } from "@/components/agenda/order-suggestions";
import { SkillAssignSection } from "@/components/skills/assign-section";
import { SupervisedBadge } from "@/components/skills/assign-card";
import { VehicleQrCard } from "@/components/garage/vehicle-qr-card";
import { TrackingCard } from "@/components/garage/tracking-card";
import { LiveRefresh } from "@/components/live-refresh";
import { getBaseUrl } from "@/lib/base-url";
import { missingVehicleInfo } from "@/lib/vehicle-info";
import { VehicleCompletionCard } from "@/components/garage/vehicle-completion";
import { InvoiceBadge, PlateChip, PriorityBadge } from "@/components/garage/badges";
import { StatusStepper } from "@/components/garage/status-stepper";
import { STATUS_DOT } from "@/components/overview/recent-orders";
import { StatusDot } from "@/components/ui/redesign/chip";
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
import { getVehicleHistoryFor, getWorkOrder, listMechanics, voidOnlyLineIds } from "@/server/work-orders";
import { orderQuoteState, quoteHistory } from "@/server/quotes";
import { QuotePanel } from "@/components/garage/quote-panel";
import { NEXT_STEP, asksReassembly, availableTransitions, balanceDue, deliveryBlock, isDelivered, isFinal } from "@/server/workflow";
import { PROMISE_REASONS } from "@/lib/delays";
import { revisionHistory } from "@/server/delays";
import { safetyWaiverMissing } from "@/server/work-orders";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

type PageProps = { params: Promise<{ id: string }> };

const toLocalInput = (d: Date | null, tz: string) => {
  if (!d) return "";
  const z = utcToZoned(d, tz);
  return `${z.date}T${z.time}`;
};

export default async function WorkOrderPage({ params }: PageProps) {
  const { id } = await params;
  // Everything in one parallel batch: each query is a round trip to the database.
  const [staff, wo, { t, lang }, settings, parts, packages, mechanics, history, baseUrl] = await Promise.all([
    requirePageAccess("viewWorkOrders"),
    getWorkOrder(id),
    getI18n(),
    getSettings(),
    partOptions(),
    packageOptions(),
    listMechanics(),
    getVehicleHistoryFor(id),
    // No APP_URL in production: the page still works, only the tracking link is replaced by a hint.
    getBaseUrl().catch(() => null),
  ]);
  if (!wo) notFound();
  // V16 Lot 2: versions and decisions; may the work start (decision recorded on the latest quote)?
  // V16 Lot 3: date changes (promise and parts), refused SAFETY lines still waiting for the signed waiver.
  const [quotes, quoteState, revisions, waiverMissing] = await Promise.all([
    quoteHistory(wo.id),
    orderQuoteState(wo.id),
    revisionHistory(wo.id),
    wo.workflowV16 && settings.requireSafetyWaiver ? safetyWaiverMissing(prisma as unknown as Prisma.TransactionClient, wo.id) : Promise.resolve([] as string[]),
  ]);
  // Orders opened before V16: the one-click agreement banner of Lot 1 (V16 orders: the quote panel).
  const customerApproval = wo.workflowV16 ? undefined : wo.events.find((e) => e.type === "QUOTE_APPROVED");
  const unreadCustomerMessages = wo.events.filter((e) => e.type === "CUSTOMER_MESSAGE").slice(0, 3);

  const final = isFinal(wo.status);
  const linesLocked = final || Boolean(wo.invoice);
  const canInvoice = can(staff, "createInvoice");
  const canSeeInvoice = can(staff, "viewClientInvoices");
  // V16: voided lines stay on the page (struck through) but count nowhere.
  // V16 Lot 2: refused lines are kept (the customer's answer) but count nowhere either.
  const liveLines = wo.lines.filter((l) => !l.voidedAt && l.approvalStatus !== "REFUSED");
  const totals = computeTotals(liveLines, settings.stampDuty);
  const pendingLines = wo.workflowV16 ? liveLines.filter((l) => l.approvalStatus === "PENDING") : [];
  const pendingTtc = pendingLines.length ? computeTotals(pendingLines, 0).totalTtc : 0;
  const approvedCount = liveLines.filter((l) => l.approvalStatus === "APPROVED").length;
  const quoteApproved = wo.workflowV16 ? quoteState.allowsWork : !!wo.quoteApprovedAt;
  const lastDecision = quotes.find((h) => h.status !== "SUPERSEDED")?.approvals.at(-1);
  const next = NEXT_STEP[wo.status];
  // V16: only the moves this user may make (permission per move), the reason when required, and the delivery check.
  // V16 Lot 3: what would go on the invoice (refused quote: the announced fees only).
  const billableLines = wo.lines.filter((l) => !l.voidedAt && (wo.workflowV16 ? l.approvalStatus === "APPROVED" : l.approvalStatus !== "REFUSED"));
  const block = deliveryBlock({ requirePaidBeforeDelivery: settings.requirePaidBeforeDelivery, workflowV16: wo.workflowV16, invoice: wo.invoice, depositAmount: wo.depositAmount, billable: billableLines.length > 0 });
  const refusedSafety = wo.lines.filter((l) => l.priority === "SAFETY" && l.approvalStatus === "REFUSED" && !l.voidedAt);
  const waiverEvent = wo.events.find((e) => (e.data as { safetyWaiver?: boolean } | null)?.safetyWaiver);
  const choices: StatusChoice[] = availableTransitions(wo.status, staff, {
    workflowV16: wo.workflowV16,
    quoteApproved,
    allowWorkWithoutQuote: settings.allowWorkWithoutQuote,
    invoiced: !!wo.invoice,
  }).map((o) => ({
    to: o.to,
    label: t.status[o.to],
    reason: o.reason,
    block: o.needsApproval ? "approvalMissing" : o.to === "DELIVERED" ? block : null,
    reassembly: asksReassembly(wo.status, o.to),
    waiver: o.to === "READY" && waiverMissing.length > 0 ? { canSign: can(staff, "recordSafetyWaiver"), href: `/garage/work-orders/${wo.id}/decharge` } : null,
  }));
  const nextChoice = next ? choices.find((c) => c.to === next) : undefined;
  const canOverride = can(staff, "deliverWithBalance");
  const balanceText = formatMoney(balanceDue(wo.invoice, wo.depositAmount) ?? 0, lang);
  const voidOnly = new Set(linesLocked ? [] : await voidOnlyLineIds(wo.id));
  const promiseMoved = !!wo.promisedAtInitial && (!wo.promisedAt || wo.promisedAt.getTime() !== wo.promisedAtInitial.getTime());
  // Vehicle file incomplete (VIN, year, fuel, colour, check-in mileage): asked on top of the order.
  const vehicleMissing: string[] = [...missingVehicleInfo(wo.vehicle), ...(wo.mileageIn === null ? ["mileage"] : [])];

  return (
    <div className="mx-auto grid min-h-full max-w-[1440px] grid-cols-1 gap-5 px-3 pt-4 pb-6 sm:px-5 xl:grid-cols-[minmax(0,1fr)_360px] xl:ps-2 xl:pe-5">
      {/* ── Center: header, works, diagnosis, history ── */}
      <section className="min-w-0 space-y-5">
        <header className="space-y-4 rounded-[24px] border border-gp-line bg-gp-card p-5 shadow-gp">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-sm text-gp-muted">{woNumber(wo.number)}</span>
            <PlateChip plate={wo.vehicle.plate} />
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {wo.vehicle.make} {wo.vehicle.model}
            </h1>
            <span className="rounded-full bg-gp-panel px-3 py-1">
              <StatusDot color={STATUS_DOT[wo.status]}>{t.status[wo.status]}</StatusDot>
            </span>
            <PriorityBadge priority={wo.priority} t={t} />
            {wo.supervisor && <SupervisedBadge name={wo.supervisor.name} t={t} />}
            <LiveRefresh url={`/api/staff/live?topic=wo:${wo.id}`} liveLabel={t.portal.live} reconnectingLabel={t.portal.reconnecting} className="ms-auto" />
          </div>
          <StatusStepper status={wo.status} t={t} className="rounded-[18px] bg-gp-panel px-2 py-4" />
          {!wo.workflowV16 && !final && <p className="text-xs text-gp-muted">{t.v16.status.legacy}</p>}
          {/* V16 Lot 2: the customer's decision arrived (e.g. on the portal, synchronised from online) — the work may start. */}
          {wo.workflowV16 && (wo.status === "QUOTE_SENT" || wo.status === "WAITING_CUSTOMER") && quoteApproved && lastDecision && (
            <p className="flex items-center gap-2 rounded-[14px] bg-gp-success-bg px-3 py-2 text-sm text-gp-success-ink">
              <CheckCircle2 className="size-4" aria-hidden /> {fmt(t.v16.quote.received, { decision: t.v16.quote.decision[lastDecision.decision], date: formatDateTime(lastDecision.createdAt, lang) })}
            </p>
          )}
          {wo.workflowV16 && pendingLines.length > 0 && approvedCount > 0 && !final && (
            <p className="flex items-center gap-2 rounded-[14px] bg-gp-accent-tint px-3 py-2 text-sm text-gp-accent-ink" data-testid="pending-supplement">
              <FileText className="size-4" aria-hidden /> {fmt(t.v16.quote.pendingSupplement, { amount: formatMoney(pendingTtc, lang) })}
            </p>
          )}
          {/* V16 Lot 3: refused quote — only the announced fees remain billable; safety waiver to sign. */}
          {wo.workflowV16 && wo.status === "QUOTE_REFUSED" && (
            <p className="flex items-center gap-2 rounded-[14px] bg-gp-panel px-3 py-2 text-sm" data-testid="refusal-banner">
              <Ban className="size-4" aria-hidden />
              {billableLines.length ? fmt(t.v16.lot3.refusal.banner, { amount: formatMoney(computeTotals(billableLines, settings.stampDuty).totalTtc, lang) }) : t.v16.lot3.refusal.bannerNone}
            </p>
          )}
          {wo.workflowV16 && refusedSafety.length > 0 && !final && (
            <p className="flex flex-wrap items-center gap-2 rounded-[14px] bg-gp-danger-bg px-3 py-2 text-sm text-gp-danger-ink" data-testid="waiver-banner">
              {waiverMissing.length ? t.v16.lot3.refusal.waiverNeeded : fmt(t.v16.lot3.refusal.waiverDone, { date: waiverEvent ? formatDateTime(waiverEvent.createdAt, lang) : "" })}
              <Link href={`/garage/work-orders/${wo.id}/decharge`} target="_blank" className="font-medium underline">
                {t.v16.lot3.refusal.waiverPrint}
              </Link>
            </p>
          )}
          {customerApproval && !isDelivered(wo.status) && (
            <p className="flex items-center gap-2 rounded-[14px] bg-gp-success-bg px-3 py-2 text-sm text-gp-success-ink">
              <CheckCircle2 className="size-4" aria-hidden /> {fmt(t.tracking.customerApproved, { date: formatDateTime(customerApproval.createdAt, lang) })}
            </p>
          )}
          {unreadCustomerMessages.length > 0 && !final && (
            <ul className="space-y-1">
              {unreadCustomerMessages.map((m) => (
                <li key={m.id} className="flex items-start gap-2 rounded-[14px] bg-gp-accent-tint px-3 py-2 text-sm">
                  <MessageCircle className="mt-0.5 size-4 shrink-0 text-gp-accent-ink" aria-hidden />
                  <span className="flex-1 whitespace-pre-line">{m.body}</span>
                  <time className="shrink-0 text-xs text-muted-foreground">{formatDateTime(m.createdAt, lang)}</time>
                </li>
              ))}
            </ul>
          )}
          {!final && vehicleMissing.length > 0 && (
            <VehicleCompletionCard workOrderId={wo.id} missing={vehicleMissing} vinDefault={wo.vehicle.vin ?? undefined} />
          )}
          <p className="text-sm text-muted-foreground">
            {t.workOrders.complaint}: <span className="text-foreground">{wo.complaint}</span>
          </p>

          <div className="flex flex-wrap items-center gap-2">
            {nextChoice &&
              (nextChoice.reason || nextChoice.block || nextChoice.reassembly || nextChoice.waiver ? (
                <StatusDialog
                  action={changeStatusFormAction.bind(null, wo.id)}
                  choices={choices}
                  defaultTo={nextChoice.to}
                  canOverride={canOverride}
                  balanceText={balanceText}
                  variant="default"
                  trigger={<>{t.workOrders.nextStep}: {t.status[nextChoice.to as keyof typeof t.status]}</>}
                />
              ) : (
                <ActionButton action={changeStatusAction.bind(null, wo.id, nextChoice.to, {})}>
                  {t.workOrders.nextStep}: {t.status[nextChoice.to as keyof typeof t.status]}
                </ActionButton>
              ))}
            {choices.length > 0 && (
              <StatusDialog
                key={`status-${wo.status}`}
                action={changeStatusFormAction.bind(null, wo.id)}
                choices={choices}
                canOverride={canOverride}
                balanceText={balanceText}
                trigger={t.v16.status.open}
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
                <Link href={`/garage/work-orders/${wo.id}/prise-en-charge`} target="_blank">
                  <Printer className="size-4" aria-hidden /> {t.legal.intake.print}
                </Link>
              </Button>
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
                  <ActionButton size="sm" action={createInvoiceAction.bind(null, wo.id)} disabled={liveLines.length === 0 || pendingLines.length > 0} title={pendingLines.length > 0 ? fmt(t.errors.pendingLines, { count: pendingLines.length }) : undefined}>
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
                  {wo.workflowV16 && <Th>{t.v16.quote.agreement}</Th>}
                  {!linesLocked && <Th />}
                </tr>
              </thead>
              <tbody>
                {wo.lines.map((line) => {
                  // V16: a voided line stays visible, greyed and struck through, with its reason; it counts nowhere.
                  const voided = !!line.voidedAt;
                  const refused = line.approvalStatus === "REFUSED";
                  const struck = voided || refused;
                  return (
                    <tr key={line.id} className={struck ? "text-muted-foreground" : undefined} data-voided={voided || undefined} data-approval={line.approvalStatus}>
                      <Td className="text-xs text-muted-foreground">{t.lineType[line.type]}</Td>
                      <Td>
                        <span className={voided ? "line-through" : undefined}>{line.description}</span>
                        {line.part && <span className="ms-2 font-mono text-xs text-muted-foreground">{line.part.sku}</span>}
                        {(line.priority || line.partCondition || line.isAnnouncedFee || (line.stockDeferred && line.partId && line.approvalStatus === "PENDING")) && (
                          <span className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                            {line.isAnnouncedFee && <span className="font-medium text-gp-accent-ink">{t.v16.lot3.refusal.announcedFee}</span>}
                            {line.priority && <span className={line.priority === "SAFETY" ? "font-medium text-gp-danger-ink" : undefined}>{t.v16.quote.priority[line.priority]}</span>}
                            {line.partCondition && <span>{t.v16.quote.condition[line.partCondition]}</span>}
                            {line.stockDeferred && line.partId && line.approvalStatus === "PENDING" && <span>{t.v16.quote.reserved}</span>}
                          </span>
                        )}
                        {voided && (
                          <span className="mt-0.5 block text-xs">
                            {fmt(t.v16.line.voided, { date: formatDateTime(line.voidedAt!, lang), reason: line.voidReason ?? "" })}
                          </span>
                        )}
                      </Td>
                      <Td className={`text-end tabular-nums${voided ? " line-through" : ""}`}>{formatQty(line.quantityX100, lang)}</Td>
                      <Td className={`text-end tabular-nums${voided ? " line-through" : ""}`} dir="ltr">{formatMoney(line.unitPrice, lang)}</Td>
                      <Td className={`text-end font-medium tabular-nums${struck ? " line-through" : ""}`} dir="ltr">{formatMoney(lineTotalHt(line), lang)}</Td>
                      {wo.workflowV16 && (
                        <Td className="text-xs">
                          {!voided && (
                            <span
                              className={`rounded-full px-2 py-0.5 ${line.approvalStatus === "APPROVED" ? "bg-gp-success-bg text-gp-success-ink" : refused ? "bg-gp-danger-bg text-gp-danger-ink" : "bg-gp-panel text-gp-muted"}`}
                            >
                              {t.v16.quote.lineStatus[line.approvalStatus]}
                            </span>
                          )}
                        </Td>
                      )}
                      {!linesLocked && (
                        <Td className="w-10">
                          {voided || refused ? null : voidOnly.has(line.id) ? (
                            <VoidLineDialog action={removeLineAction.bind(null, wo.id, line.id)} label={t.v16.line.void} trigger={<Ban className="size-4 text-muted-foreground" />} />
                          ) : (
                            <ActionButton
                              variant="ghost"
                              size="icon-sm"
                              aria-label={t.common.delete}
                              action={removeLineAction.bind(null, wo.id, line.id)}
                            >
                              <Trash2 className="size-4 text-muted-foreground" />
                            </ActionButton>
                          )}
                        </Td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}

          {liveLines.length > 0 && (
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
              {pendingTtc > 0 && (
                <div className="flex justify-between text-xs text-muted-foreground">
                  <dt>{t.v16.quote.pendingTotal}</dt>
                  <dd className="tabular-nums" dir="ltr">{formatMoney(pendingTtc, lang)}</dd>
                </div>
              )}
            </dl>
          )}

          {!linesLocked && (
            <div className="space-y-3">
              <LineAdder
                action={addLineAction.bind(null, wo.id)}
                parts={parts}
                laborRate={settings.laborRate}
                canAnnounceFee={wo.workflowV16 && (wo.status === "RECEIVED" || wo.status === "DIAGNOSIS") && can(staff, "manageQuotes")}
              />
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

        {/* ── V16 Lot 2: quote versions and the customer's decisions (who, when, channel, amount, lines) ── */}
        <QuotePanel
          workOrderId={wo.id}
          legacy={!wo.workflowV16}
          history={quotes}
          pendingLines={final || wo.invoice ? [] : pendingLines.map((l) => ({ id: l.id, description: l.description, quantityX100: l.quantityX100, unitPrice: l.unitPrice, taxRateBp: l.taxRateBp, priority: l.priority, partCondition: l.partCondition }))}
          openQuoteId={quoteState.openQuoteId}
          waiting={wo.status === "QUOTE_SENT" || wo.status === "WAITING_CUSTOMER"}
          stampDuty={approvedCount > 0 ? 0 : settings.stampDuty}
          customer={{ name: wo.customer.name, phone: wo.customer.phone }}
          canResend={can(staff, "manageQuotes")}
          canRecord={can(staff, "recordQuoteApproval")}
          showMoney
          t={t}
          lang={lang}
        />

        {/* ── V14: assisted assignment (required skills, mechanics sorted by level / presence / load, supervisor) ── */}
        <SkillAssignSection workOrderId={wo.id} staff={staff} t={t} lang={lang} />

        {/* ── V12: what else is due soon on this car (agenda estimates), one click into the quote ── */}
        <OrderSuggestions workOrderId={wo.id} locked={linesLocked} staff={staff} t={t} lang={lang} />

        {/* ── Time per mechanic, quality control, missing parts, insurance (V7) ── */}
        <RepairPanels wo={wo} staff={staff} t={t} lang={lang} tz={settings.timezone} />

        {/* ── Vehicle QR Code (created at check-in) ── */}
        {can(staff, "manageVehicleQr") && <VehicleQrCard vehicle={{ id: wo.vehicle.id, qrToken: wo.vehicle.qrToken ?? null }} t={t} />}

        {/* ── OBD-II diagnostic (Prompt 3/5) ── */}
        {can(staff, "obdDiagnose") && (
          <Card>
            <CardTitle>{t.v7.obd.title}</CardTitle>
            <Button asChild size="sm" variant="outline">
              <Link href={`/garage/vehicules/${wo.vehicle.id}/obd?wo=${wo.id}`}>
                <Activity className="size-3.5" aria-hidden /> {t.v7.obd.button}
              </Link>
            </Button>
          </Card>
        )}

        {/* ── Parts put aside for this repair (Prompt 2/5, step B) ── */}
        <ReservationsCard workOrderId={wo.id} closed={isFinal(wo.status)} staff={staff} t={t} lang={lang} />

        {/* ── Warranties on this repair and its parts (Prompt 4/5) ── */}
        <WarrantyCard workOrderId={wo.id} staff={staff} t={t} lang={lang} />

        {/* ── V9: repair contract prefilled from this order (customer, vehicle, lines TTC, warranty…) ── */}
        <RelatedContracts
          staff={staff}
          filter={{ workOrderId: wo.id }}
          t={t}
          lang={lang}
          newHref={canContract(staff, "REPAIR", "manage") && wo.status !== "CANCELLED" ? `/garage/contrats/nouveau?category=REPAIR&workOrder=${wo.id}` : null}
          newLabel={t.ctr.createFromWorkOrder}
        />

        {/* ── Direct expenses and real profit (Prompt 2/5) ── */}
        <ProfitPanel workOrderId={wo.id} staff={staff} t={t} lang={lang} />

        {/* ── Photos & videos (shared with the customer when "visible") ── */}
        <Card>
          <CardTitle>{t.tracking.media}</CardTitle>
          {wo.status !== "CANCELLED" && can(staff, "uploadMedia") && <MediaUploader workOrderId={wo.id} />}
          {wo.media.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">{t.tracking.noMedia}</p>
          ) : (
            <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {wo.media.map((m) => (
                <li key={m.id} className="overflow-hidden rounded-[18px] border border-gp-line bg-gp-panel">
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
                    {can(staff, "uploadMedia") && (
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

        {/* ── V10.6: repair order (prise en charge) — fuel, body, parts origin, estimate, deposit, CIN ── */}
        <IntakeCard
          workOrderId={wo.id}
          locked={final}
          t={t}
          defaults={{ ...wo, customerNationalId: wo.customer.nationalId }}
        />

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
            {/* V16 Lot 3: a promised date that changes needs a reason (PromiseRevision + customer message). */}
            {wo.promisedAt && !final && (
              <>
                <Field label={t.v16.lot3.promise.reasonLabel}>
                  <NativeSelect name="promiseReason" defaultValue="">
                    <option value="">{t.v16.lot3.promise.choose}</option>
                    {PROMISE_REASONS.map((r) => (
                      <option key={r} value={r}>
                        {t.v16.lot3.reasons[r]}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field label={t.v16.lot3.promise.note} className="sm:col-span-2">
                  <Input name="promiseNote" maxLength={500} />
                </Field>
                <p className="text-xs text-muted-foreground sm:col-span-3">{t.v16.lot3.promise.reasonHint}</p>
              </>
            )}
            {!final && (
              <div className="sm:col-span-3">
                <Button type="submit" variant="secondary">
                  {t.workOrders.saveDiagnosis}
                </Button>
              </div>
            )}
          </ActionForm>
        </Card>

        {/* ── V16 Lot 3: date changes (promised date, parts' expected dates), customer told or not ── */}
        {(revisions.length > 0 || wo.promisedAtInitial) && (
          <Card>
            <CardTitle>{t.v16.lot3.promise.history}</CardTitle>
            {revisions.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t.v16.lot3.promise.none}</p>
            ) : (
              <ul className="space-y-2 text-sm" data-testid="promise-revisions">
                {revisions.map((r) => (
                  <li key={r.id} className="rounded-[14px] border border-gp-line px-3 py-2">
                    <p className="flex flex-wrap items-center gap-x-2">
                      {r.part && <span className="font-medium">{fmt(t.v16.lot3.promise.part, { part: r.part })}</span>}
                      <span className="tabular-nums" dir="ltr">
                        {r.oldDate ? formatDateTime(r.oldDate, lang) : t.v16.lot3.promise.noDate} → {r.newDate ? formatDateTime(r.newDate, lang) : t.v16.lot3.promise.noDate}
                      </span>
                      <span className="rounded-full bg-gp-panel px-2 py-0.5 text-xs">{t.v16.lot3.reasons[r.reason]}</span>
                      <span className={`text-xs ${r.notified ? "text-gp-success-ink" : "text-muted-foreground"}`}>
                        {r.notified ? t.v16.lot3.promise.notified : t.v16.lot3.promise.notNotified}
                        {r.messages.length > 0 && ` (${r.messages.map((m) => `${m.channel === "NONE" ? "—" : m.channel} : ${t.v7.notifications.statuses[m.status as keyof typeof t.v7.notifications.statuses] ?? m.status}`).join(", ")})`}
                      </span>
                    </p>
                    {r.note && <p className="mt-1 text-xs text-muted-foreground">{r.note}</p>}
                    <p className="text-xs text-muted-foreground">
                      {r.by ?? t.events.system} · {formatDateTime(r.createdAt, lang)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

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
      <aside className="space-y-4">
        {!final && can(staff, "manageTracking") && (
          <TrackingCard
            workOrderId={wo.id}
            pin={wo.trackingPin}
            link={baseUrl ? `${baseUrl}/suivi?plate=${wo.vehicle.plate}` : t.errors.appUrlMissing}
            shareText={
              wo.trackingPin && baseUrl
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
          <p className="rounded-full bg-gp-card px-4 py-2.5 text-xs text-gp-muted">
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
            {promiseMoved && (
              <>
                <dt className="text-muted-foreground">{t.v16.promisedInitial}</dt>
                <dd className="line-through decoration-gp-muted">{formatDateTime(wo.promisedAtInitial!, lang)}</dd>
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
                  <Link href={`/garage/work-orders/${h.id}`} className="block rounded-[14px] px-3 py-2 hover:bg-gp-hover">
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
