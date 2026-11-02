"use client";

import { useState } from "react";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

type ActionResult = { ok: true; data: { redirectTo?: string; warning?: string; message?: string } | null | undefined } | { ok: false; error: string };
type QualityCategoryKey =
  | "BRAKES"
  | "ENGINE"
  | "TIMING"
  | "CLUTCH_GEARBOX"
  | "ELECTRICAL_DIAGNOSTICS"
  | "AIR_CONDITIONING"
  | "SUSPENSION_STEERING"
  | "TIRES_GEOMETRY"
  | "BODYWORK"
  | "OTHER";

export function QualityChecklistEditor({
  action,
  lines,
  points,
  roadTestRequired,
  roadTest,
  roadTestKm,
  toolsRemoved,
  notes,
  editable,
  readOnly,
  labels,
}: {
  action: (form: FormData) => Promise<ActionResult>;
  lines: { id: string; label: string; type: "LABOR" | "PART"; category: QualityCategoryKey; checked: boolean; canVerify: boolean }[];
  points: { key: string; label: string; checked: boolean }[];
  roadTestRequired: boolean;
  roadTest: string | null;
  roadTestKm: number | null;
  toolsRemoved: boolean;
  notes: string;
  editable: boolean;
  readOnly: boolean;
  labels: {
    workDone: string;
    workVerified: string;
    parts: string;
    labor: string;
    applied: string;
    pointsCount: string;
    roadTestRequired: string;
    roadTestReason: string;
    roadTestDone: string;
    roadTestNotNeeded: string;
    roadTestKm: string;
    notes: string;
    toolsRemoved: string;
    save: string;
    other: string;
    categories: Record<Exclude<QualityCategoryKey, "OTHER">, string>;
  };
}) {
  const [lineState, setLineState] = useState(() => Object.fromEntries(lines.map((line) => [line.id, line.checked])));
  const [pointState, setPointState] = useState(() => Object.fromEntries(points.map((point) => [point.key, point.checked])));
  const [tools, setTools] = useState(toolsRemoved);
  const [roadTestState, setRoadTestState] = useState(roadTest ?? (roadTestRequired ? "" : "NOT_NEEDED"));
  const [km, setKm] = useState(roadTestKm ? String(roadTestKm) : "");
  const total = lines.length + points.length + 1 + (roadTestRequired ? 1 : 0);
  const checked =
    lines.filter((line) => lineState[line.id]).length +
    points.filter((point) => pointState[point.key]).length +
    (tools ? 1 : 0) +
    (roadTestRequired && roadTestState === "DONE" && Number(km) >= 1 && Number(km) <= 500 ? 1 : 0);
  const roadTestCategories = [...new Set(lines.map((line) => line.category).filter((category) => ["BRAKES", "ENGINE", "TIMING", "CLUTCH_GEARBOX", "SUSPENSION_STEERING"].includes(category)))];
  const categoryLabel = roadTestCategories.map((category) => category === "OTHER" ? labels.other : labels.categories[category as keyof typeof labels.categories]).join(", ");

  return (
    <ActionForm action={action} reset={false} className="space-y-4" silent>
      <fieldset disabled={readOnly || !editable} className="space-y-4">
        <section>
          <h3 className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">{labels.workDone.replace("{n}", String(lines.length))}</h3>
          {lines.length ? (
            <ul className="divide-y divide-gp-line">
              {lines.map((line) => (
                <li key={line.id}>
                  <label className="flex min-h-14 items-center gap-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      name={`line:${line.id}`}
                      checked={!!lineState[line.id]}
                      disabled={!line.canVerify}
                      onChange={(event) => setLineState((state) => ({ ...state, [line.id]: event.target.checked }))}
                      className="size-6 shrink-0 accent-emerald-600"
                    />
                    {!line.canVerify && lineState[line.id] && <input type="hidden" name={`line:${line.id}`} value="on" />}
                    <span className="min-w-0 flex-1">
                      <span className="block">{line.label}</span>
                      <span className="text-xs text-muted-foreground">{line.type === "PART" ? labels.parts : labels.labor}</span>
                    </span>
                    <span className="text-xs text-muted-foreground">{labels.workVerified}</span>
                  </label>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-2 text-sm text-muted-foreground">—</p>
          )}
        </section>

        <section>
          <h3 className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">{labels.applied}</h3>
          {roadTestRequired && (
            <fieldset className="space-y-2 border-b border-gp-line py-2">
              <legend className="text-sm font-medium">{labels.roadTestRequired}</legend>
              <p className="text-xs text-muted-foreground">{labels.roadTestReason.replace("{category}", categoryLabel)}</p>
              <div className="flex flex-wrap gap-4 text-sm">
                <label className="flex min-h-11 items-center gap-2">
                  <input type="radio" name="roadTest" value="DONE" checked={roadTestState === "DONE"} onChange={() => setRoadTestState("DONE")} className="size-5" />
                  {labels.roadTestDone}
                </label>
                <label className="flex min-h-11 items-center gap-2">
                  <input type="radio" name="roadTest" value="NOT_NEEDED" checked={roadTestState === "NOT_NEEDED"} onChange={() => setRoadTestState("NOT_NEEDED")} className="size-5" />
                  {labels.roadTestNotNeeded}
                </label>
              </div>
              <Field label={labels.roadTestKm}>
                <Input type="number" name="roadTestKm" min={1} max={500} inputMode="numeric" required={roadTestState === "DONE"} value={km} onChange={(event) => setKm(event.target.value)} dir="ltr" />
              </Field>
            </fieldset>
          )}
          {points.length > 0 && (
            <ul className="divide-y divide-gp-line">
              {points.map((point) => (
                <li key={point.key}>
                  <label className="flex min-h-14 items-center gap-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      name={`qp:${point.key}`}
                      checked={!!pointState[point.key]}
                      onChange={(event) => setPointState((state) => ({ ...state, [point.key]: event.target.checked }))}
                      className="size-6 shrink-0 accent-emerald-600"
                    />
                    <span>{point.label}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          {!roadTestRequired && <input type="hidden" name="roadTest" value="NOT_NEEDED" />}
          <label className="flex min-h-14 items-center gap-3 border-t border-gp-line py-2 text-sm">
            <input type="checkbox" name="toolsRemoved" checked={tools} onChange={(event) => setTools(event.target.checked)} className="size-6 shrink-0 accent-emerald-600" />
            <span>{labels.toolsRemoved}</span>
          </label>
        </section>
        <p className="rounded-[14px] bg-gp-panel px-3 py-2 text-sm tabular-nums" aria-live="polite">
          {labels.pointsCount.replace("{checked}", String(checked)).replace("{total}", String(total))}
        </p>
        <Field label={labels.notes}>
          <textarea name="notes" rows={2} maxLength={1000} defaultValue={notes} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
        </Field>
        {editable && !readOnly && <Button type="submit" className="min-h-12 w-full">{labels.save}</Button>}
      </fieldset>
    </ActionForm>
  );
}
