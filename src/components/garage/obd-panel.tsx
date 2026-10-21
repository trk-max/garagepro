"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { saveObdReadingAction } from "@/actions/obd";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/client";
import { ObdError, runDiagnostic, simulatedTransport, type DiagnosticResult } from "@/lib/obd/session";
import { openWebSerial, webSerialAvailable } from "@/lib/obd/web-serial";
import { cn } from "@/lib/utils";

/** Reads the car through an ELM327 adapter (or the clearly marked simulator), then saves the reading. */
export function ObdPanel({ vehicleId, workOrderId, recordedKm, fileHasVin }: { vehicleId: string; workOrderId: string | null; recordedKm: number | null; fileHasVin: boolean }) {
  const { t } = useI18n();
  const o = t.v7.obd;
  const router = useRouter();
  const [step, setStep] = useState<string | null>(null);
  const [result, setResult] = useState<DiagnosticResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applyKm, setApplyKm] = useState(false);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function read(simulated: boolean) {
    setError(null);
    setResult(null);
    setStep("init");
    let transport;
    try {
      transport = simulated ? simulatedTransport() : await openWebSerial();
      setResult(await runDiagnostic(transport, setStep));
    } catch (e) {
      const reason = e instanceof ObdError ? e.reason : null;
      setError(reason ? o.errors[reason] : e instanceof Error && e.name === "NotFoundError" ? o.errors.cancelled : o.errors.generic);
    } finally {
      await transport?.close().catch(() => {});
      setStep(null);
    }
  }

  async function save() {
    if (!result) return;
    setSaving(true);
    const r = await saveObdReadingAction(vehicleId, { result, workOrderId, applyOdometer: applyKm, note });
    setSaving(false);
    if (!r.ok) return toast.error(r.error);
    toast.success(o.saved);
    setResult(null);
    setApplyKm(false);
    setNote("");
    router.refresh();
  }

  const lower = result && !result.simulated && result.odometerKm !== null && recordedKm !== null && result.odometerKm < recordedKm;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => read(false)} disabled={!!step || !webSerialAvailable()}>
          {o.readCar}
        </Button>
        <Button variant="outline" onClick={() => read(true)} disabled={!!step}>
          {o.readDemo}
        </Button>
      </div>
      {!webSerialAvailable() && <p className="text-xs text-amber-700 dark:text-amber-400">{o.noWebSerial}</p>}
      {step && <p className="text-sm text-muted-foreground">{o.steps[step as keyof typeof o.steps] ?? step}…</p>}
      {error && <p className="border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm">{error}</p>}

      {result && (
        <div className={cn("space-y-3 border p-4", result.simulated && "border-dashed border-amber-500")}>
          {result.simulated && <p className="f-label inline-block bg-amber-500 px-2 py-1 text-xs text-black">{o.simulatedBadge}</p>}
          <p className="text-xs text-muted-foreground">
            {result.adapter} · {result.protocol ?? "—"} · VIN {result.vin ?? o.notProvided}
          </p>
          <div>
            <p className="label-tech mb-1">{o.dtcs}</p>
            {result.dtcs.length === 0 ? (
              <p className="text-sm">{o.noDtc}</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {result.dtcs.map((d) => (
                  <li key={d.code + d.kind} className="border px-2 py-1 font-mono text-sm">
                    {d.code} <span className="text-xs text-muted-foreground">({o.kinds[d.kind]})</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-1 text-xs text-muted-foreground">{o.dtcHint}</p>
          </div>
          {result.live.length > 0 && (
            <div>
              <p className="label-tech mb-1">{o.live}</p>
              <ul className="grid gap-1 text-sm sm:grid-cols-2">
                {result.live.map((v) => (
                  <li key={v.pid} className="flex justify-between border-b py-1">
                    <span>{v.name}</span>
                    <span className="tabular-nums">
                      {v.value} {v.unit}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="text-sm">
            <p className="label-tech mb-1">{o.odometer}</p>
            {result.odometerKm === null ? (
              <p>{o.odometerUnsupported}</p>
            ) : result.simulated ? (
              <p>{o.odometerSimulated}</p>
            ) : fileHasVin && !result.vin ? (
              <p>{o.odometerNoVin.replace("{km}", String(result.odometerKm))}</p>
            ) : lower ? (
              <p className="text-red-600 dark:text-red-400">{o.odometerLower.replace("{read}", String(result.odometerKm)).replace("{recorded}", String(recordedKm))}</p>
            ) : (
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={applyKm} onChange={(e) => setApplyKm(e.target.checked)} className="size-4" />
                {o.applyOdometer.replace("{km}", String(result.odometerKm))}
              </label>
            )}
          </div>
          {(result.unsupported.length > 0 || result.warnings.length > 0) && (
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">{o.notProvidedList}</summary>
              <ul className="mt-1 list-disc ps-5">
                {[...result.unsupported, ...result.warnings].map((u) => (
                  <li key={u}>{u}</li>
                ))}
              </ul>
            </details>
          )}
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder={o.notePlaceholder} className="h-9 w-full border bg-transparent px-2 text-sm" />
          <div className="flex gap-2">
            <Button onClick={save} disabled={saving}>
              {o.save}
            </Button>
            <Button variant="ghost" onClick={() => setResult(null)}>
              {o.discard}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
