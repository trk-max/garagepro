import { CheckCircle2 } from "lucide-react";
import type { WorkOrderStatus } from "@prisma/client";
import { approveQualityCheckAction, saveQualityCheckAction } from "@/actions/follow-up";
import { ActionButton, ActionForm } from "@/components/action-form";
import { QualityChecklistEditor } from "@/components/garage/quality-checklist-editor";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, Field, Textarea } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { fmt, formatDateTime, type Lang } from "@/lib/format";
import type { Dictionary } from "@/lib/i18n/fr";
import { can } from "@/lib/permissions";
import type { StaffUser } from "@/lib/session";
import { activeQualityLines, legacyQualityComplete, parseQualityLineChecks, qualityCardCapabilities, qualityCardVisible, targetedQualityComplete } from "@/lib/quality";
import { extraPointsComplete, parseExtraResults, roadTestKmMissing, reworkCount } from "@/lib/lot5";
import { isFinal } from "@/server/workflow";
import { prisma } from "@/lib/prisma";
import { QC_KEYS, qualityChecklistData } from "@/server/quality";

type Props = {
  wo: {
    id: string;
    status: WorkOrderStatus;
    workflowLot5?: boolean;
    supervisorId: string | null;
  };
  staff: StaffUser;
  t: Dictionary;
  lang: Lang;
  tz?: string;
};

export async function QualityCheckCard({ wo, staff, t, lang, tz }: Props) {
  if (!qualityCardVisible(wo.status)) return null;

  const [data, statusEvents, supervisor, settings] = await Promise.all([
    qualityChecklistData(wo.id),
    prisma.workOrderEvent.findMany({ where: { workOrderId: wo.id, type: "STATUS_CHANGED" }, select: { type: true, data: true } }),
    wo.supervisorId ? prisma.user.findUnique({ where: { id: wo.supervisorId }, select: { name: true } }) : Promise.resolve(null),
    prisma.setting.findUnique({ where: { id: "garage" }, select: { skillSupervisorVerifies: true } }),
  ]);
  const qc = data.qc;
  const extra = parseExtraResults(qc?.extraPoints);
  const requiredExtra = Object.fromEntries(data.points.map((point) => [point.key, extra[point.key] ?? { label: point.label, ok: false }]));
  const lot5 = wo.workflowLot5;
  const final = isFinal(wo.status);
  const approved = data.approved;
  const capabilities = qualityCardCapabilities({
    canFill: can(staff, "fillQualityCheck"),
    canApprove: can(staff, "approveQualityCheck"),
    approved,
    final,
  });
  const { canEdit, canApprove } = capabilities;
  const approver = qc?.approvedById ? await prisma.user.findUnique({ where: { id: qc.approvedById }, select: { name: true } }) : null;
  const approvedComplete = qc
    ? data.targeted
      ? targetedQualityComplete({
          lines: data.lines,
          lineChecks: parseQualityLineChecks(qc.lineChecks),
          toolsRemoved: qc.toolsRemoved,
          roadTestRequired: data.roadTestRequired,
          roadTest: qc.roadTest,
          roadTestKm: qc.roadTestKm,
          extraPoints: requiredExtra,
        })
      : legacyQualityComplete(qc) &&
        (!lot5 || (!roadTestKmMissing({ workflowLot5: true, roadTest: qc.roadTest, roadTestKm: qc.roadTestKm }) && extraPointsComplete(data.points, extra)))
    : false;
  const lineChecks = parseQualityLineChecks(qc?.lineChecks);
  const lines = activeQualityLines(data.lines);
  const missingLot5Points = lot5 && !data.targeted ? data.points.filter((point) => !extra[point.key]?.ok).map((point) => point.label) : [];
  const staleLineCheck = lines.some((line) => {
    const saved = lineChecks[line.id];
    return !!saved && (saved.label !== line.description || saved.type !== line.type || saved.category !== line.qualityCategory);
  });
  const supervised = !!(supervisor && settings?.skillSupervisorVerifies);
  const target = t.v16.lot5.quality.targeted;
  const legacy = t.v7.quality;

  return (
    <>
      <Card id="quality-card" data-testid="quality-card">
        <CardTitle>{data.targeted ? target.title : legacy.title}</CardTitle>
        {data.targeted ? (
          <>
            <p className="mb-3 text-sm text-muted-foreground">{target.subtitle}</p>
            {supervised && (
              <p className="mb-3 border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
                {fmt(t.v14.qc.supervised, { name: supervisor!.name })} {t.v14.qc.supervisorVerifies}
              </p>
            )}
            {approved && (
              <p className="mb-3 flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="size-4" aria-hidden /> {fmt(legacy.approvedBy, { name: approver?.name ?? "?", date: formatDateTime(qc!.approvedAt!, lang, tz) })}
              </p>
            )}
            {staleLineCheck && <p className="mb-3 rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-800">{target.changedLine}</p>}
            <QualityChecklistEditor
              action={saveQualityCheckAction.bind(null, wo.id)}
              lines={lines.map((line) => {
                const saved = lineChecks[line.id];
                const same = saved?.label === line.description && saved.type === line.type && saved.category === line.qualityCategory;
                return {
                  id: line.id,
                  label: line.description,
                  type: line.type,
                  category: line.qualityCategory,
                  checked: same && saved.ok,
                  canVerify: !supervised || staff.id === wo.supervisorId || (same && saved.ok),
                };
              })}
              points={data.points.map((point) => ({ key: point.key, label: point.label, checked: extra[point.key]?.ok === true }))}
              roadTestRequired={data.roadTestRequired}
              roadTest={qc?.roadTest ?? null}
              roadTestKm={qc?.roadTestKm ?? null}
              toolsRemoved={qc?.toolsRemoved ?? false}
              notes={qc?.notes ?? ""}
              editable={canEdit}
              readOnly={approved}
              labels={{
                ...target,
                other: target.other,
                roadTestKm: t.v16.lot5.quality.roadTestKm,
                notes: legacy.notes,
              }}
            />
            {!approved && canApprove && (
              <ActionButton className="mt-3 min-h-12 w-full" action={approveQualityCheckAction.bind(null, wo.id)} disabled={!approvedComplete}>
                <CheckCircle2 className="size-4" aria-hidden /> {target.approve}
              </ActionButton>
            )}
            {!approved && capabilities.waitingForApproval && <p className="mt-3 text-sm text-amber-700">{target.waiting}</p>}
            {approved && <p className="mt-3 text-sm text-emerald-700">{target.pointsCount.replace("{checked}", "✓").replace("{total}", "✓")}</p>}
          </>
        ) : (
          <>
            {missingLot5Points.length > 0 && !approved && (
              <p className="mb-3 text-sm text-amber-700">
                {fmt(target.missingPoints, { points: missingLot5Points.join(", ") })}{" "}
                <a href="#quality-card" className="font-medium underline underline-offset-2">{target.title}</a>
              </p>
            )}
            {supervisor && (
              <p className="mb-3 border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
                {fmt(t.v14.qc.supervised, { name: supervisor.name })} {settings?.skillSupervisorVerifies ? t.v14.qc.supervisorVerifies : ""}
              </p>
            )}
            {approved ? (
              <p className="mb-3 flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="size-4" aria-hidden /> {fmt(legacy.approvedBy, { name: approver?.name ?? "?", date: formatDateTime(qc!.approvedAt!, lang, tz) })}
              </p>
            ) : (
              <p className="mb-3 text-sm text-amber-700 dark:text-amber-400">{legacy.notApproved}</p>
            )}
            <p className="mb-3 text-xs text-muted-foreground" data-testid="rework-count">{reworkCount(statusEvents) ? fmt(t.v16.lot5.quality.reworks, { n: reworkCount(statusEvents) }) : t.v16.lot5.quality.noReworks}</p>
            <ActionForm action={saveQualityCheckAction.bind(null, wo.id)} reset={false} className="space-y-3">
              <fieldset className="flex flex-wrap items-center gap-4 text-sm" disabled={!canEdit || approved}>
                <legend className="mb-1 font-medium">{legacy.roadTest}</legend>
                <label className="flex items-center gap-2">
                  <input type="radio" name="roadTest" value="DONE" defaultChecked={qc?.roadTest === "DONE"} className="size-4" /> {legacy.roadTestDone}
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" name="roadTest" value="NOT_NEEDED" defaultChecked={qc?.roadTest === "NOT_NEEDED"} className="size-4" /> {legacy.roadTestNotNeeded}
                </label>
                <label className="flex items-center gap-2">
                  {t.v16.lot5.quality.roadTestKm}
                  <Input type="number" name="roadTestKm" min={0} max={500} inputMode="numeric" defaultValue={qc?.roadTestKm ?? ""} className="h-9 w-24" dir="ltr" />
                  <span className="text-xs text-muted-foreground">{lot5 ? t.v16.lot5.quality.roadTestKmHint : ""}</span>
                </label>
              </fieldset>
              <div className="grid gap-2 text-sm sm:grid-cols-2">
                {QC_KEYS.map((key) => (
                  <label key={key} className="flex min-h-11 items-center gap-3 border px-3 py-2">
                    <input type="checkbox" name={key} defaultChecked={qc?.[key] ?? false} disabled={!canEdit || approved} className="size-5" />
                    {legacy[key]}
                  </label>
                ))}
              </div>
              {data.points.length > 0 && (
                <fieldset className="text-sm" disabled={!canEdit || approved} data-testid="qc-extra">
                  <legend className="mb-1 font-medium">{t.v16.lot5.quality.extraTitle}</legend>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {data.points.map((point) => (
                      <label key={point.key} className="flex min-h-11 items-center gap-3 border px-3 py-2">
                        <input type="checkbox" name={`qp:${point.key}`} defaultChecked={extra[point.key]?.ok ?? false} className="size-5" />
                        {point.label}
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}
              <Field label={legacy.notes}>
                <Textarea name="notes" rows={2} maxLength={1000} defaultValue={qc?.notes ?? ""} disabled={!canEdit || approved} />
              </Field>
              {canEdit && !approved && <Button type="submit" variant="outline">{legacy.save}</Button>}
            </ActionForm>
            {!approved && canApprove && (
              <ActionButton className="mt-3" action={approveQualityCheckAction.bind(null, wo.id)} disabled={!approvedComplete}>
                <CheckCircle2 className="size-4" aria-hidden /> {legacy.approve}
              </ActionButton>
            )}
            {!approved && capabilities.waitingForApproval && <p className="mt-3 text-sm text-amber-700">{target.waiting}</p>}
          </>
        )}
      </Card>
    </>
  );
}
