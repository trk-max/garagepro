import type { ReactNode } from "react";
import { CheckCircle2, ClipboardCheck, RotateCcw } from "lucide-react";
import {
  attachResultPhotoAction,
  completeInspectionAction,
  convertResultAction,
  dismissComebackAction,
  linkComebackAction,
  saveResultAction,
  startInspectionAction,
  unlinkComebackAction,
} from "@/actions/lot5";
import { ActionButton, ActionForm } from "@/components/action-form";
import { InspectionPhoto } from "@/components/garage/inspection-photo";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, Field, NativeSelect } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { fmt, formatDate, formatDateTime, type Lang } from "@/lib/format";
import type { Dictionary } from "@/lib/i18n/fr";
import { COMEBACK_CATEGORIES, priorityForColor } from "@/lib/lot5";
import type { InspectionsView } from "@/server/inspections";
import type { comebackView } from "@/server/comebacks";
import type { PartOption } from "@/server/parts";

/** V16 Lot 5 — colour chips (always with the word: never colour alone). */
export const INSPECTION_TONE: Record<"GREEN" | "ORANGE" | "RED", string> = {
  GREEN: "bg-gp-success-bg text-gp-success-ink",
  ORANGE: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  RED: "bg-gp-danger-bg text-gp-danger-ink",
};

type ComebackData = NonNullable<Awaited<ReturnType<typeof comebackView>>>;

/** « Retour atelier ? » : the suggestion (same vehicle delivered < 30 days ago), or the current link. */
export function ComebackCard({ workOrderId, view, canManage, final, t, lang }: { workOrderId: string; view: ComebackData; canManage: boolean; final: boolean; t: Dictionary; lang: Lang }) {
  const c = t.v16.lot5.comeback;
  if (view.linked) {
    return (
      <Card data-testid="comeback-linked">
        <CardTitle className="flex items-center gap-2">
          <RotateCcw className="size-4" aria-hidden /> {c.title.replace(/\s*\?$/, "").replace(/؟$/, "")}
        </CardTitle>
        <p className="text-sm">
          {fmt(c.linked, {
            number: view.linked.label,
            category: view.linked.category ? c.categories[view.linked.category] : "",
            date: view.linked.linkedAt ? formatDate(view.linked.linkedAt, lang) : "",
          })}
        </p>
        <p className="mt-1 text-xs text-gp-accent-ink">{c.labourFree}</p>
        {canManage && !final && (
          <details className="mt-3">
            <summary className="cursor-pointer text-sm text-muted-foreground">{c.unlink}</summary>
            <ActionForm action={unlinkComebackAction.bind(null, workOrderId)} className="mt-2 flex flex-wrap items-end gap-2">
              <Field label={c.unlinkReason} className="min-w-60 flex-1">
                <Input name="reason" required minLength={3} maxLength={500} />
              </Field>
              <Button type="submit" variant="outline" size="sm">
                {c.unlink}
              </Button>
            </ActionForm>
          </details>
        )}
      </Card>
    );
  }
  if (!view.suggestion) return null;
  const s = view.suggestion;
  return (
    <Card className="border-amber-500" data-testid="comeback-suggestion">
      <CardTitle className="flex items-center gap-2">
        <RotateCcw className="size-4" aria-hidden /> {c.title}
      </CardTitle>
      <p className="text-sm">{fmt(c.suggestion, { date: formatDate(s.deliveredAt!, lang), number: s.label })}</p>
      {s.lines.length > 0 && <p className="mt-1 text-xs text-muted-foreground">{fmt(c.previousWork, { lines: s.lines.map((l) => l.description).join(", ") })}</p>}
      {canManage && (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <ActionForm action={linkComebackAction.bind(null, workOrderId, s.id)} className="flex flex-wrap items-end gap-2">
            <Field label={c.category}>
              <NativeSelect name="category" defaultValue="SAME_FAULT">
                {COMEBACK_CATEGORIES.map((k) => (
                  <option key={k} value={k}>
                    {c.categories[k]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Button type="submit">{c.link}</Button>
          </ActionForm>
          <ActionButton variant="outline" action={dismissComebackAction.bind(null, workOrderId, s.id)}>
            {c.dismiss}
          </ActionButton>
        </div>
      )}
    </Card>
  );
}

/** Inspection rouge / orange / vert of an order: start from a template, colour + note + photo per point, → quote. */
export function InspectionCard({
  workOrderId,
  inspections,
  templates,
  parts,
  canInspect,
  canQuote,
  final,
  embedded = false,
  t,
  lang,
}: {
  workOrderId: string;
  inspections: InspectionsView;
  templates: { id: string; name: string }[];
  parts: PartOption[];
  canInspect: boolean;
  canQuote: boolean;
  final: boolean;
  /** Inside the « Contrôle qualité » card (staff-ux): a section with a sub-title instead of its own card. */
  embedded?: boolean;
  t: Dictionary;
  lang: Lang;
}) {
  const v = t.v16.lot5.inspection;
  const colors = ["GREEN", "ORANGE", "RED"] as const;
  const Wrap = embedded ? EmbeddedSection : Card;
  return (
    <Wrap data-testid="inspection-card">
      {embedded ? (
        <h3 className="mb-1 flex items-center gap-2 text-base font-semibold">
          <ClipboardCheck className="size-4" aria-hidden /> {v.title}
        </h3>
      ) : (
        <CardTitle className="flex items-center gap-2">
          <ClipboardCheck className="size-4" aria-hidden /> {v.title}
        </CardTitle>
      )}
      <p className="mb-3 text-xs text-muted-foreground">{v.intro}</p>
      {canInspect && !final && (
        templates.length ? (
          <ActionForm action={startInspectionAction.bind(null, workOrderId)} silent className="mb-4 flex flex-wrap items-end gap-2">
            <Field label={v.template}>
              <NativeSelect name="templateId" defaultValue={templates[0]!.id}>
                {templates.map((tp) => (
                  <option key={tp.id} value={tp.id}>
                    {tp.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Button type="submit" variant="outline">
              {v.start}
            </Button>
          </ActionForm>
        ) : (
          <p className="mb-3 text-sm text-muted-foreground">{v.noTemplate}</p>
        )
      )}
      {inspections.length === 0 && <p className="text-sm text-muted-foreground">{v.none}</p>}
      <div className="space-y-5">
        {inspections.map((insp) => {
          const done = insp.results.filter((r) => r.color).length;
          const count = (c: (typeof colors)[number]) => insp.results.filter((r) => r.color === c).length;
          const editable = canInspect && !final;
          return (
            <section key={insp.id} className="rounded-[18px] border border-gp-line p-3" data-testid="inspection">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <h3 className="font-medium">{insp.name}</h3>
                <span className="text-xs text-muted-foreground">
                  {insp.completedAt
                    ? fmt(v.completed, { date: formatDateTime(insp.completedAt, lang), red: count("RED"), orange: count("ORANGE"), green: count("GREEN") })
                    : fmt(v.inProgress, { done, total: insp.results.length })}
                </span>
              </div>
              <ul className="divide-y divide-gp-line">
                {insp.results.map((r) => (
                  <li key={r.id} className="grid gap-2 py-2" data-testid="inspection-point" data-color={r.color ?? ""}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="min-w-40 flex-1 text-sm">{r.label}</span>
                      {r.color && <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${INSPECTION_TONE[r.color]}`}>{v.colors[r.color]}</span>}
                      {r.media && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <a href={`/api/media/${r.media.id}`} target="_blank" rel="noopener"><img src={`/api/media/${r.media.id}`} alt={r.label} className="size-12 rounded-md object-cover" /></a>
                      )}
                    </div>
                    {r.line && (
                      <p className="text-xs text-gp-accent-ink" data-testid="inspection-quoted">
                        {fmt(v.quoted, { line: r.line.description })} · {t.v16.quote.lineStatus[r.line.approvalStatus]}
                      </p>
                    )}
                    {editable && (
                      <ActionForm action={saveResultAction.bind(null, workOrderId, r.id)} reset={false} silent className="flex flex-wrap items-end gap-2">
                        <fieldset className="flex flex-wrap gap-2" disabled={!!r.line}>
                          <legend className="sr-only">{r.label}</legend>
                          {colors.map((c) => (
                            <label key={c} className={`flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full border border-gp-line px-3 text-xs ${INSPECTION_TONE[c]}`} title={v.colorHelp[c]}>
                              <input type="radio" name="color" value={c} defaultChecked={r.color === c} className="size-3.5" /> {v.colors[c]}
                            </label>
                          ))}
                        </fieldset>
                        <Input name="note" defaultValue={r.note ?? ""} maxLength={500} placeholder={v.note} className="h-9 min-w-40 flex-1" />
                        <Button type="submit" size="sm" variant="outline">
                          {v.save}
                        </Button>
                        <InspectionPhoto workOrderId={workOrderId} label={r.label} attach={attachResultPhotoAction.bind(null, workOrderId, r.id)} />
                      </ActionForm>
                    )}
                    {!editable && r.note && <p className="text-xs text-muted-foreground">{r.note}</p>}
                    {canQuote && !final && !r.line && priorityForColor(r.color) && (
                      <details>
                        <summary className="cursor-pointer text-xs font-medium text-gp-accent-ink">{v.toQuote}</summary>
                        <ActionForm action={convertResultAction.bind(null, workOrderId, r.id)} className="mt-2 grid gap-2 sm:grid-cols-[120px_minmax(0,1fr)_90px_120px]">
                          <Field label={v.type}>
                            <NativeSelect name="type" defaultValue="LABOR">
                              <option value="LABOR">{v.labor}</option>
                              <option value="PART">{v.part}</option>
                            </NativeSelect>
                          </Field>
                          <Field label={v.description}>
                            <Input name="description" required defaultValue={[r.label, r.note].filter(Boolean).join(" — ").slice(0, 300)} />
                          </Field>
                          <Field label={v.quantity}>
                            <Input name="quantity" required inputMode="decimal" defaultValue="1" dir="ltr" />
                          </Field>
                          <Field label={v.unitPrice}>
                            <Input name="unitPrice" inputMode="decimal" dir="ltr" />
                          </Field>
                          <Field label={t.workOrders.partFromStock} className="sm:col-span-2">
                            <NativeSelect name="partId" defaultValue="">
                              <option value="">—</option>
                              {parts.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.sku} · {p.name}
                                </option>
                              ))}
                            </NativeSelect>
                          </Field>
                          <p className="self-end text-xs text-muted-foreground sm:col-span-2">
                            {fmt(v.priorityAuto, { priority: t.v16.quote.priority[priorityForColor(r.color)!] })}
                          </p>
                          <Button type="submit" size="sm" className="sm:col-span-full sm:justify-self-start">
                            {v.create}
                          </Button>
                        </ActionForm>
                      </details>
                    )}
                  </li>
                ))}
              </ul>
              {editable && !insp.completedAt && (
                <ActionButton className="mt-3" size="sm" action={completeInspectionAction.bind(null, workOrderId, insp.id)} disabled={done < insp.results.length}>
                  <CheckCircle2 className="size-4" aria-hidden /> {v.complete}
                </ActionButton>
              )}
            </section>
          );
        })}
      </div>
    </Wrap>
  );
}

function EmbeddedSection({ children, ...rest }: { children: ReactNode; "data-testid"?: string }) {
  return (
    <section className="mt-5 border-t border-gp-line pt-4" {...rest}>
      {children}
    </section>
  );
}

/** Settings form textarea helper: points of a template, one per line. */
export const pointsText = (points: { label: string }[]) => points.map((p) => p.label).join("\n");

