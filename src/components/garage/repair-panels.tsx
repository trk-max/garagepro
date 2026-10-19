import { CheckCircle2, Timer } from "lucide-react";
import type { WorkOrderStatus } from "@prisma/client";
import {
  addLaborEntryAction,
  addPartNeedAction,
  addSuggestedLaborLineAction,
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
import { QC_KEYS, getQualityCheck } from "@/server/quality";
import { isFinal } from "@/server/workflow";

type Wo = {
  id: string;
  status: WorkOrderStatus;
  insurerName: string | null;
  insuranceClaimRef: string | null;
  insuranceRequestedAt: Date | null;
  insuranceDecision: string | null;
  insuranceDecidedAt: Date | null;
};

const hours = (m: number) => `${minutesToHours(m).toLocaleString("fr-FR")} h`;
const day = (d: Date | null, tz: string) => (d ? utcToZoned(d, tz).date : "");

/** Work order: time per mechanic, quality control, insurance, missing parts. */
export async function RepairPanels({ wo, staff, t, lang, tz }: { wo: Wo; staff: StaffUser; t: Dictionary; lang: Lang; tz: string }) {
  const [labor, qc, needs, parts, suppliers, users] = await Promise.all([
    laborSummary(wo.id),
    getQualityCheck(wo.id),
    listPartNeeds(wo.id),
    partOptions(),
    supplierOptions(),
    prisma.user.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const approver = qc?.approvedById ? await prisma.user.findUnique({ where: { id: qc.approvedById }, select: { name: true } }) : null;
  const v = t.v7;
  const final = isFinal(wo.status);
  const mine = labor.running.find((e) => e.userId === staff.id);
  const missingHours = labor.suggestedX100 - labor.billedX100;
  const qcDone = !!qc && qc.roadTest !== null && QC_KEYS.every((k) => qc[k]);
  const nowLocal = utcToZoned(new Date(), tz);
  const nowInput = `${nowLocal.date}T${nowLocal.time}`;

  return (
    <>
      {/* ── Time spent ── */}
      <Card>
        <CardTitle>{v.labor.title}</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          {!final && can(staff.role, "logOwnLabor") && (mine ? (
            <ActionButton action={stopLaborAction.bind(null, mine.id, wo.id)} variant="destructive">
              <Timer className="size-4" aria-hidden /> {v.labor.stop} · {fmt(v.labor.running, { time: formatTime(mine.startedAt, lang, tz) })}
            </ActionButton>
          ) : (
            <ActionButton action={startLaborAction.bind(null, wo.id)}>
              <Timer className="size-4" aria-hidden /> {v.labor.start}
            </ActionButton>
          ))}
          {labor.running
            .filter((e) => e.userId !== staff.id)
            .map((e) => (
              <span key={e.id} className="inline-flex items-center gap-2 border px-2 py-1 text-xs">
                <span className="size-2 animate-pulse rounded-full bg-emerald-500" aria-hidden />
                {e.user.name} · {formatTime(e.startedAt, lang, tz)}
                {can(staff.role, "manageLabor") && (
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
        {missingHours > 0 && !final && (
          <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            {fmt(v.labor.suggested, { mode: v.labor.mode[labor.mode] })} : <strong>{formatQty(labor.suggestedX100, lang)} h</strong>
            <ActionButton size="sm" variant="outline" action={addSuggestedLaborLineAction.bind(null, wo.id)}>
              {fmt(v.labor.addLine, { h: formatQty(missingHours, lang) })}
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
                  <span className="tabular-nums">
                    {formatDateTime(e.startedAt, lang, tz)} → {e.endedAt ? formatTime(e.endedAt, lang, tz) : "…"}
                  </span>
                  {e.voidedAt ? (
                    <span className="text-xs no-underline">
                      ({v.labor.voided} : {e.voidReason})
                    </span>
                  ) : (
                    can(staff.role, "manageLabor") && (
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
        {can(staff.role, "manageLabor") && !final && (
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
      <Card className={cn(wo.status === "QUALITY_CONTROL" && "border-cyan-500")}>
        <CardTitle>{v.quality.title}</CardTitle>
        {qc?.approvedAt ? (
          <p className="mb-3 flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="size-4" aria-hidden /> {fmt(v.quality.approvedBy, { name: approver?.name ?? "?", date: formatDateTime(qc.approvedAt, lang, tz) })}
          </p>
        ) : (
          <p className="mb-3 text-sm text-amber-700 dark:text-amber-400">{v.quality.notApproved}</p>
        )}
        {final ? null : (
          <>
            <ActionForm action={saveQualityCheckAction.bind(null, wo.id)} reset={false} className="space-y-3">
              <fieldset className="flex flex-wrap items-center gap-4 text-sm" disabled={!can(staff.role, "fillQualityCheck")}>
                <legend className="mb-1 font-medium">{v.quality.roadTest}</legend>
                <label className="flex items-center gap-2">
                  <input type="radio" name="roadTest" value="DONE" defaultChecked={qc?.roadTest === "DONE"} className="size-4 accent-brand-500" /> {v.quality.roadTestDone}
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" name="roadTest" value="NOT_NEEDED" defaultChecked={qc?.roadTest === "NOT_NEEDED"} className="size-4 accent-brand-500" /> {v.quality.roadTestNotNeeded}
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
              <Field label={v.quality.notes}>
                <Textarea name="notes" rows={2} maxLength={1000} defaultValue={qc?.notes ?? ""} />
              </Field>
              <div className="flex flex-wrap items-center gap-2">
                {can(staff.role, "fillQualityCheck") && <Button type="submit" variant="outline">{v.quality.save}</Button>}
              </div>
            </ActionForm>
            {can(staff.role, "approveQualityCheck") && !qc?.approvedAt && (
              <ActionButton className="mt-3" action={approveQualityCheckAction.bind(null, wo.id)} disabled={!qcDone}>
                <CheckCircle2 className="size-4" aria-hidden /> {v.quality.approve}
              </ActionButton>
            )}
            <p className="mt-2 text-xs text-muted-foreground">{v.quality.changedResets}</p>
          </>
        )}
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
                  </p>
                  {can(staff.role, "manageRepairFollowUp") && !final ? (
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
        {can(staff.role, "reportMissingPart") && !final && (
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
              <div>
                <Button type="submit" size="sm">
                  {t.common.add}
                </Button>
              </div>
            </ActionForm>
          </details>
        )}
      </Card>

      {/* ── Insurance ── */}
      {(wo.status === "WAITING_INSURANCE" || wo.insurerName || can(staff.role, "manageRepairFollowUp")) && (
        <Card className={cn(wo.status === "WAITING_INSURANCE" && "border-fuchsia-500")}>
          <CardTitle>{v.insurance.title}</CardTitle>
          {wo.status === "WAITING_INSURANCE" && wo.insuranceRequestedAt && (
            <p className="mb-2 text-sm text-fuchsia-700 dark:text-fuchsia-300">{fmt(v.insurance.waitingSince, { n: Math.floor((Date.now() - wo.insuranceRequestedAt.getTime()) / 86_400_000) })}</p>
          )}
          {can(staff.role, "manageRepairFollowUp") && !final ? (
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
