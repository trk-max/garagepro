import type { ReactNode } from "react";
import { CheckCircle2, Timer } from "lucide-react";
import type { WorkOrderStatus } from "@prisma/client";
import {
  addLaborEntryAction,
  addPartNeedAction,
  addSuggestedLaborLineAction,
  partsWaitDecisionAction,
  approveQualityCheckAction,
  saveQualityCheckAction,
  startLaborAction,
  stopLaborAction,
  updateInsuranceAction,
  updatePartNeedAction,
  voidLaborEntryAction,
} from "@/actions/follow-up";
import { ActionButton, ActionForm } from "@/components/action-form";
import { ReasonButton } from "@/components/team/prompt-action";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, Field, NativeSelect, Textarea } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { minutesToHours } from "@/lib/attendance";
import { utcToZoned } from "@/lib/booking";
import { fmt, formatDate, formatDateTime, formatQty, formatTime, type Lang } from "@/lib/format";
import type { Dictionary } from "@/lib/i18n/fr";
import { can } from "@/lib/permissions";
import type { StaffUser } from "@/lib/session";
import { cn } from "@/lib/utils";
import { prisma } from "@/lib/prisma";
import { listPartNeeds } from "@/server/follow-up";
import { laborSummary } from "@/server/labor";
import { partOptions } from "@/server/parts";
import { supplierOptions } from "@/server/purchasing";
import { QC_KEYS, getQualityCheck, qualityPoints } from "@/server/quality";
import { LABOR_KINDS, parseExtraResults, reworkCount } from "@/lib/lot5";
import { isFinal } from "@/server/workflow";
import { PROMISE_REASONS } from "@/lib/delays";
import { lastPartsWaitDecision } from "@/server/delays";

type Wo = {
  id: string;
  status: WorkOrderStatus;
  /** V16 Lot 5 */
  workflowLot5?: boolean;
  comebackOfWorkOrderId?: string | null;
  insurerName: string | null;
  insuranceClaimRef: string | null;
  insuranceRequestedAt: Date | null;
  insuranceDecision: string | null;
  insuranceDecidedAt: Date | null;
};

const hours = (m: number) => `${minutesToHours(m).toLocaleString("fr-FR")} h`;
const day = (d: Date | null, tz: string) => (d ? utcToZoned(d, tz).date : "");

/**
 * Work order: time per mechanic, quality control, insurance, missing parts.
 * `inspection` (staff-ux): the red / orange / green inspection, shown inside the « Contrôle qualité » card.
 */
export async function RepairPanels({ wo, staff, t, lang, tz, inspection }: { wo: Wo; staff: StaffUser; t: Dictionary; lang: Lang; tz: string; inspection?: ReactNode }) {
  // V16 Lot 5: points set in the settings and the rework counter (from the status events, append-only).
  const [points, statusEvents] = await Promise.all([qualityPoints(), prisma.workOrderEvent.findMany({ where: { workOrderId: wo.id, type: "STATUS_CHANGED" }, select: { type: true, data: true } })]);
  const reworks = reworkCount(statusEvents);
  const l5 = t.v16.lot5;
  const [labor, qc, needs, parts, suppliers, users, supervision, orderLines, waitDecision] = await Promise.all([
    laborSummary(wo.id),
    getQualityCheck(wo.id),
    listPartNeeds(wo.id),
    partOptions(),
    supplierOptions(),
    prisma.user.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    // V14: supervisor of the order (indicator on the quality check) and the « supervisor verifies » rule.
    prisma.workOrder.findUnique({ where: { id: wo.id }, select: { supervisor: { select: { name: true } } } }).then(async (w) => (w?.supervisor ? { name: w.supervisor.name, verifies: (await prisma.setting.findUnique({ where: { id: "garage" }, select: { skillSupervisorVerifies: true } }))?.skillSupervisorVerifies ?? false } : null)),
    // V16 Lot 3: the order lines a missing part can be tied to, and the « keep / hand back » decision.
    prisma.workOrderLine.findMany({ where: { workOrderId: wo.id, voidedAt: null, approvalStatus: { not: "REFUSED" } }, orderBy: [{ position: "asc" }, { createdAt: "asc" }], select: { id: true, description: true } }),
    lastPartsWaitDecision(wo.id),
  ]);
  const l3 = t.v16.lot3;
  const canUpdateNeeds = can(staff, "manageRepairFollowUp") || can(staff, "managePartNeeds");
  const openNeeds = needs.some((n) => n.status === "NEEDED" || n.status === "ORDERED");
  const lineName = (id: string | null) => (id ? (orderLines.find((l) => l.id === id)?.description ?? null) : null);
  const approver = qc?.approvedById ? await prisma.user.findUnique({ where: { id: qc.approvedById }, select: { name: true } }) : null;
  const v = t.v7;
  const final = isFinal(wo.status);
  const mine = labor.running.find((e) => e.userId === staff.id);
  const missingElapsed = labor.suggestedElapsedX100 - labor.billedX100;
  const missingPerson = labor.suggestedPersonX100 - labor.billedX100;
  const twoBases = labor.mechanics >= 2 && labor.suggestedPersonX100 !== labor.suggestedElapsedX100;
  const extra = parseExtraResults(qc?.extraPoints);
  const lot5 = !!wo.workflowLot5;
  const qcDone =
    !!qc &&
    qc.roadTest !== null &&
    QC_KEYS.every((k) => qc[k]) &&
    (!lot5 || ((qc.roadTest !== "DONE" || (qc.roadTestKm ?? 0) > 0) && points.every((p) => extra[p.key]?.ok)));
  const kindSelect = (
    <NativeSelect name="kind" defaultValue={wo.comebackOfWorkOrderId ? "REWORK" : ""} aria-label={l5.labor.kind}>
      <option value="">{l5.labor.kindAny}</option>
      {LABOR_KINDS.map((k) => (
        <option key={k} value={k}>
          {l5.labor.kinds[k]}
        </option>
      ))}
    </NativeSelect>
  );
  const lineSelect = (
    <NativeSelect name="workOrderLineId" defaultValue="" aria-label={l5.labor.line}>
      <option value="">{l5.labor.lineAny}</option>
      {orderLines.map((l) => (
        <option key={l.id} value={l.id}>
          {l.description}
        </option>
      ))}
    </NativeSelect>
  );
  const nowLocal = utcToZoned(new Date(), tz);
  const nowInput = `${nowLocal.date}T${nowLocal.time}`;

  return (
    <>
      {/* ── Time spent ── */}
      <Card>
        <CardTitle>{v.labor.title}</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          {!final && can(staff, "logOwnLabor") && (mine ? (
            <ActionButton action={stopLaborAction.bind(null, mine.id, wo.id)} variant="destructive">
              <Timer className="size-4" aria-hidden /> {v.labor.stop} · {fmt(v.labor.running, { time: formatTime(mine.startedAt, lang, tz) })}
            </ActionButton>
          ) : (
            <ActionForm action={startLaborAction.bind(null, wo.id)} silent className="flex flex-wrap items-end gap-2" data-testid="labor-start">
              <Field label={l5.labor.kind}>{kindSelect}</Field>
              <Field label={l5.labor.line}>{lineSelect}</Field>
              <Button type="submit">
                <Timer className="size-4" aria-hidden /> {v.labor.start}
              </Button>
            </ActionForm>
          ))}
          {labor.running
            .filter((e) => e.userId !== staff.id)
            .map((e) => (
              <span key={e.id} className="inline-flex items-center gap-2 border px-2 py-1 text-xs">
                <span className="size-2 animate-pulse rounded-full bg-emerald-500" aria-hidden />
                {e.user.name} · {formatTime(e.startedAt, lang, tz)}
                {can(staff, "manageLabor") && (
                  <ActionButton size="sm" variant="ghost" className="h-6 px-1.5" action={stopLaborAction.bind(null, e.id, wo.id)}>
                    {v.labor.stop}
                  </ActionButton>
                )}
              </span>
            ))}
        </div>

        <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
          <div className="border p-3">
            <dt className="label-tech">{v.labor.personHours}</dt>
            <dd className="mt-1 text-xl font-semibold tabular-nums">{hours(labor.personMinutes)}</dd>
          </div>
          <div className="border p-3">
            <dt className="label-tech">{v.labor.elapsed}</dt>
            <dd className="mt-1 text-xl font-semibold tabular-nums">{hours(labor.elapsedMinutes)}</dd>
          </div>
          <div className="border p-3">
            <dt className="label-tech">{v.labor.billed}</dt>
            <dd className="mt-1 text-xl font-semibold tabular-nums">{formatQty(labor.billedX100, lang)} h</dd>
          </div>
        </dl>
        <p className="mt-2 text-xs text-muted-foreground">{v.labor.explain}</p>
        {!final && twoBases && missingElapsed > 0 && (
          <div className="mt-3 border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            <p className="font-medium">{fmt(v.labor.askBasis, { n: labor.mechanics })}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <ActionButton size="sm" variant="outline" action={addSuggestedLaborLineAction.bind(null, wo.id, "ELAPSED")}>
                {fmt(v.labor.billElapsed, { h: formatQty(missingElapsed, lang) })}
              </ActionButton>
              {missingPerson > 0 && (
                <ActionButton size="sm" variant="outline" action={addSuggestedLaborLineAction.bind(null, wo.id, "PERSON")}>
                  {fmt(v.labor.billPerson, { h: formatQty(missingPerson, lang) })}
                </ActionButton>
              )}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{v.labor.askHint}</p>
          </div>
        )}
        {!final && !twoBases && missingElapsed > 0 && (
          <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            {v.labor.recorded} : <strong>{formatQty(labor.suggestedElapsedX100, lang)} h</strong>
            <ActionButton size="sm" variant="outline" action={addSuggestedLaborLineAction.bind(null, wo.id, "ELAPSED")}>
              {fmt(v.labor.addLine, { h: formatQty(missingElapsed, lang) })}
            </ActionButton>
          </p>
        )}

        {labor.perUser.length > 0 && (
          <div className="mt-4">
            <p className="label-tech mb-1">{v.labor.perMechanic}</p>
            <ul className="text-sm">
              {labor.perUser.map((u) => (
                <li key={u.userId} className="flex justify-between border-b py-1">
                  <span>{u.name}</span>
                  <span className="tabular-nums">{hours(u.minutes)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {labor.entries.length > 0 && (
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer text-muted-foreground">{fmt(v.labor.entries, { n: labor.entries.length })}</summary>
            <ul className="mt-2 space-y-1">
              {labor.entries.map((e) => (
                <li key={e.id} className={cn("flex flex-wrap items-center gap-2", e.voidedAt && "text-muted-foreground line-through")}>
                  <span>{e.user.name}</span>
                  {e.kind && <span className="rounded-full bg-gp-panel px-2 text-xs">{l5.labor.kinds[e.kind]}</span>}
                  {e.line && <span className="text-xs text-muted-foreground">{e.line.description}</span>}
                  <span className="tabular-nums">
                    {formatDateTime(e.startedAt, lang, tz)} → {e.endedAt ? formatTime(e.endedAt, lang, tz) : "…"}
                  </span>
                  {e.voidedAt ? (
                    <span className="text-xs no-underline">
                      ({v.labor.voided} : {e.voidReason})
                    </span>
                  ) : (
                    can(staff, "manageLabor") && (
                      <ReasonButton className="ms-auto h-6" question={v.labor.voidReason} action={voidLaborEntryAction.bind(null, e.id, wo.id)}>
                        {v.labor.void}
                      </ReasonButton>
                    )
                  )}
                </li>
              ))}
            </ul>
          </details>
        )}
        {can(staff, "manageLabor") && !final && (
          <details className="mt-3">
            <summary className="cursor-pointer text-sm text-muted-foreground">{v.labor.manual}</summary>
            <ActionForm action={addLaborEntryAction.bind(null, wo.id)} className="mt-2 grid gap-2 sm:grid-cols-3">
              <Field label={v.labor.mechanic}>
                <NativeSelect name="userId" required defaultValue="">
                  <option value="" disabled>
                    —
                  </option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label={v.labor.from}>
                <Input type="datetime-local" name="from" required defaultValue={nowInput} />
              </Field>
              <Field label={v.labor.to}>
                <Input type="datetime-local" name="to" required defaultValue={nowInput} />
              </Field>
              <Field label={l5.labor.kind}>{kindSelect}</Field>
              <Field label={l5.labor.line}>{lineSelect}</Field>
              <div>
                <Button type="submit" size="sm">
                  {t.common.add}
                </Button>
              </div>
            </ActionForm>
          </details>
        )}
      </Card>

      {/* ── Quality control ── */}
      <Card className={cn(wo.status === "QUALITY_CONTROL" && "border-cyan-500")} data-testid="quality-card">
        <CardTitle>{v.quality.title}</CardTitle>
        {supervision && (
          <p className="mb-3 border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
            {fmt(t.v14.qc.supervised, { name: supervision.name })} {supervision.verifies ? t.v14.qc.supervisorVerifies : ""}
          </p>
        )}
        {qc?.approvedAt ? (
          <p className="mb-3 flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="size-4" aria-hidden /> {fmt(v.quality.approvedBy, { name: approver?.name ?? "?", date: formatDateTime(qc.approvedAt, lang, tz) })}
          </p>
        ) : (
          <p className="mb-3 text-sm text-amber-700 dark:text-amber-400">{v.quality.notApproved}</p>
        )}
        <p className="mb-3 text-xs text-muted-foreground" data-testid="rework-count">{reworks ? fmt(l5.quality.reworks, { n: reworks }) : l5.quality.noReworks}</p>
        {final ? null : (
          <>
            <ActionForm action={saveQualityCheckAction.bind(null, wo.id)} reset={false} className="space-y-3">
              <fieldset className="flex flex-wrap items-center gap-4 text-sm" disabled={!can(staff, "fillQualityCheck")}>
                <legend className="mb-1 font-medium">{v.quality.roadTest}</legend>
                <label className="flex items-center gap-2">
                  <input type="radio" name="roadTest" value="DONE" defaultChecked={qc?.roadTest === "DONE"} className="size-4 accent-brand-500" /> {v.quality.roadTestDone}
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" name="roadTest" value="NOT_NEEDED" defaultChecked={qc?.roadTest === "NOT_NEEDED"} className="size-4 accent-brand-500" /> {v.quality.roadTestNotNeeded}
                </label>
                {/* V16 Lot 5 — distance of the road test (mandatory when done, new orders). */}
                <label className="flex items-center gap-2">
                  {l5.quality.roadTestKm}
                  <Input type="number" name="roadTestKm" min={0} max={500} inputMode="numeric" defaultValue={qc?.roadTestKm ?? ""} className="h-9 w-24" dir="ltr" />
                  <span className="text-xs text-muted-foreground">{lot5 ? l5.quality.roadTestKmHint : ""}</span>
                </label>
              </fieldset>
              <div className="grid gap-2 text-sm sm:grid-cols-2">
                {QC_KEYS.map((k) => (
                  <label key={k} className="flex min-h-10 items-center gap-3 border px-3 py-2">
                    <input type="checkbox" name={k} defaultChecked={qc?.[k] ?? false} className="size-5 accent-brand-500" />
                    {v.quality[k]}
                  </label>
                ))}
              </div>
              {points.length > 0 && (
                <fieldset className="text-sm" disabled={!can(staff, "fillQualityCheck")} data-testid="qc-extra">
                  <legend className="mb-1 font-medium">{l5.quality.extraTitle}</legend>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {points.map((p) => (
                      <label key={p.key} className="flex min-h-10 items-center gap-3 border px-3 py-2">
                        <input type="checkbox" name={`qp:${p.key}`} defaultChecked={extra[p.key]?.ok ?? false} className="size-5 accent-brand-500" />
                        {p.label}
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}
              <Field label={v.quality.notes}>
                <Textarea name="notes" rows={2} maxLength={1000} defaultValue={qc?.notes ?? ""} />
              </Field>
              <div className="flex flex-wrap items-center gap-2">
                {can(staff, "fillQualityCheck") && <Button type="submit" variant="outline">{v.quality.save}</Button>}
              </div>
            </ActionForm>
            {can(staff, "approveQualityCheck") && !qc?.approvedAt && (
              <ActionButton className="mt-3" action={approveQualityCheckAction.bind(null, wo.id)} disabled={!qcDone}>
                <CheckCircle2 className="size-4" aria-hidden /> {v.quality.approve}
              </ActionButton>
            )}
            <p className="mt-2 text-xs text-muted-foreground">{v.quality.changedResets}</p>
          </>
        )}
        {inspection}
      </Card>

      {/* ── Missing parts ── */}
      <Card>
        <CardTitle>{v.parts.title}</CardTitle>
        {needs.length === 0 ? (
          <p className="text-sm text-muted-foreground">{v.parts.none}</p>
        ) : (
          <ul className="space-y-3">
            {needs.map((n) => {
              const late = n.expectedAt && n.expectedAt < new Date() && (n.status === "NEEDED" || n.status === "ORDERED");
              return (
                <li key={n.id} className="border p-3 text-sm">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{n.description}</span>
                    <span className="text-muted-foreground">× {formatQty(n.quantityX100, lang)}</span>
                    {n.part && <span className="font-mono text-xs text-muted-foreground">{n.part.sku}</span>}
                    {late && <span className="f-label border border-red-500 px-1.5 text-[0.625rem] text-red-600">{v.parts.late}</span>}
                    {n.purchaseOrder && <span className="text-xs">{v.parts.po} {n.purchaseOrder.number}</span>}
                    {lineName(n.workOrderLineId) && <span className="text-xs text-muted-foreground">{fmt(l3.parts.linked, { line: lineName(n.workOrderLineId)! })}</span>}
                  </p>
                  {canUpdateNeeds && !final ? (
                    <ActionForm action={updatePartNeedAction.bind(null, n.id, wo.id)} reset={false} className="mt-2 flex flex-wrap items-end gap-2">
                      <NativeSelect name="status" defaultValue={n.status} className="w-36" aria-label={v.parts.title}>
                        {(["NEEDED", "ORDERED", "RECEIVED", "CANCELLED"] as const).map((s) => (
                          <option key={s} value={s}>
                            {v.parts.status[s]}
                          </option>
                        ))}
                      </NativeSelect>
                      <NativeSelect name="supplierId" defaultValue={n.supplierId ?? ""} className="w-44" aria-label={v.parts.supplier}>
                        <option value="">{v.parts.noSupplier}</option>
                        {suppliers.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </NativeSelect>
                      <Input type="date" name="expectedAt" defaultValue={day(n.expectedAt, tz)} className="w-40" aria-label={v.parts.expected} />
                      {/* V16 Lot 3: why the expected date changes (the customer is told). */}
                      <NativeSelect name="dateReason" defaultValue="PARTS" className="w-44" aria-label={l3.parts.dateReason}>
                        {PROMISE_REASONS.map((r) => (
                          <option key={r} value={r}>
                            {l3.reasons[r]}
                          </option>
                        ))}
                      </NativeSelect>
                      <Input name="dateNote" maxLength={500} placeholder={l3.promise.note} className="w-48" aria-label={l3.promise.note} />
                      <Button type="submit" size="sm" variant="outline" className="h-9">
                        {t.common.save}
                      </Button>
                    </ActionForm>
                  ) : (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {v.parts.status[n.status]}
                      {n.supplier && ` · ${n.supplier.name}`}
                      {n.expectedAt && ` · ${formatDate(n.expectedAt, lang, tz)}`}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {can(staff, "reportMissingPart") && !final && (
          <details className="mt-3">
            <summary className="cursor-pointer text-sm font-medium">{v.parts.add}</summary>
            <ActionForm action={addPartNeedAction.bind(null, wo.id)} className="mt-2 grid gap-2 sm:grid-cols-2">
              <Field label={v.parts.description} className="sm:col-span-2">
                <Input name="description" required minLength={2} maxLength={200} />
              </Field>
              <Field label={t.v7.parts.noPart}>
                <NativeSelect name="partId" defaultValue="">
                  <option value="">—</option>
                  {parts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.sku} · {p.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label={v.parts.quantity}>
                <Input name="quantity" inputMode="decimal" defaultValue="1" />
              </Field>
              <Field label={v.parts.supplier}>
                <NativeSelect name="supplierId" defaultValue="">
                  <option value="">{v.parts.noSupplier}</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label={v.parts.expected}>
                <Input type="date" name="expectedAt" />
              </Field>
              {/* V16 Lot 3: the line waiting for the part (an accepted one moves the order to « attente pièces »). */}
              <Field label={l3.parts.line}>
                <NativeSelect name="workOrderLineId" defaultValue="">
                  <option value="">{l3.parts.noLine}</option>
                  {orderLines.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.description}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label={l3.parts.dateReason}>
                <NativeSelect name="dateReason" defaultValue="PARTS">
                  {PROMISE_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {l3.reasons[r]}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <div>
                <Button type="submit" size="sm">
                  {t.common.add}
                </Button>
              </div>
            </ActionForm>
          </details>
        )}
      </Card>

      {/* ── V16 Lot 3: while waiting for parts — the car stays, or is handed back (Lot 4: no storage fee) ── */}
      {(wo.status === "WAITING_PARTS" || openNeeds || waitDecision) && !final && (
        <Card>
          <CardTitle>{l3.parts.decisionTitle}</CardTitle>
          {waitDecision && (
            <p className="mb-2 text-sm" data-testid="parts-wait-decision">
              {fmt(l3.parts.decided, { decision: l3.parts.decision[waitDecision.decision], date: formatDateTime(waitDecision.at, lang, tz) })}
              {waitDecision.garageCaused && <span className="block text-xs text-muted-foreground">{l3.parts.garageCaused}</span>}
            </p>
          )}
          {can(staff, "manageRepairFollowUp") && (
            <div className="flex flex-wrap gap-2">
              {(["KEEP_VEHICLE", "RETURN_LATER"] as const).map((d) => (
                <ActionForm key={d} action={partsWaitDecisionAction.bind(null, wo.id)} reset={false} className="flex flex-wrap items-center gap-2 rounded-[14px] border border-gp-line px-3 py-2">
                  <input type="hidden" name="decision" value={d} />
                  <label className="flex items-center gap-2 text-xs">
                    <input type="checkbox" name="garageCaused" defaultChecked={waitDecision?.garageCaused ?? true} className="size-4" />
                    {l3.parts.garageCaused}
                  </label>
                  <Button type="submit" size="sm" variant="outline">
                    {d === "KEEP_VEHICLE" ? l3.parts.keep : l3.parts.returnLater}
                  </Button>
                </ActionForm>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* ── Insurance ── */}
      {(wo.status === "WAITING_INSURANCE" || wo.insurerName || can(staff, "manageRepairFollowUp")) && (
        <Card className={cn(wo.status === "WAITING_INSURANCE" && "border-fuchsia-500")}>
          <CardTitle>{v.insurance.title}</CardTitle>
          {wo.insuranceDecision && wo.insuranceRequestedAt && wo.insuranceDecidedAt ? (
            <p className="mb-2 text-sm text-emerald-700 dark:text-emerald-400">
              {fmt(v.insurance.answeredAfter, { decision: v.insurance.decisions[wo.insuranceDecision as keyof typeof v.insurance.decisions] ?? wo.insuranceDecision, n: Math.max(0, Math.round((wo.insuranceDecidedAt.getTime() - wo.insuranceRequestedAt.getTime()) / 86_400_000)) })}
            </p>
          ) : (
            wo.status === "WAITING_INSURANCE" &&
            wo.insuranceRequestedAt && (
              <p className="mb-2 text-sm text-fuchsia-700 dark:text-fuchsia-300">{fmt(v.insurance.waitingSince, { n: Math.floor((Date.now() - wo.insuranceRequestedAt.getTime()) / 86_400_000) })}</p>
            )
          )}
          {can(staff, "manageRepairFollowUp") && !final ? (
            <ActionForm action={updateInsuranceAction.bind(null, wo.id)} reset={false} className="grid gap-2 sm:grid-cols-2">
              <Field label={v.insurance.insurer}>
                <Input name="insurerName" maxLength={120} defaultValue={wo.insurerName ?? ""} />
              </Field>
              <Field label={v.insurance.claimRef}>
                <Input name="insuranceClaimRef" maxLength={80} defaultValue={wo.insuranceClaimRef ?? ""} />
              </Field>
              <Field label={v.insurance.requestedAt}>
                <Input type="date" name="insuranceRequestedAt" defaultValue={day(wo.insuranceRequestedAt, tz)} />
              </Field>
              <Field label={v.insurance.decision}>
                <NativeSelect name="insuranceDecision" defaultValue={wo.insuranceDecision ?? ""}>
                  {(["", "APPROVED", "PARTIAL", "REJECTED"] as const).map((d) => (
                    <option key={d} value={d}>
                      {v.insurance.decisions[d]}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <div>
                <Button type="submit" size="sm" variant="outline">
                  {t.common.save}
                </Button>
              </div>
            </ActionForm>
          ) : (
            <p className="text-sm">
              {wo.insurerName ?? "—"} {wo.insuranceClaimRef && `· ${wo.insuranceClaimRef}`} · {v.insurance.decisions[(wo.insuranceDecision ?? "") as "" | "APPROVED" | "PARTIAL" | "REJECTED"]}
            </p>
          )}
        </Card>
      )}
    </>
  );
}
