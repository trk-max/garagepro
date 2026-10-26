import { Check } from "lucide-react";
import type { Dictionary } from "@/lib/i18n/fr";
import { displayPlate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CustomerStep } from "@/server/workflow";

/**
 * « Votre véhicule · Avancement 40 % » card, then the vertical step list of the owner's mock-up:
 * green check = done, orange ring = current (with its hint), grey ring = next steps.
 */
export function RepairStepper({ steps, progress, t, ready, plate }: { steps: CustomerStep[]; progress: number; t: Dictionary; ready: boolean; plate?: string }) {
  return (
    <section aria-label={t.portal.progress} className="space-y-6" data-testid="repair-stepper">
      <div className="rounded-[24px] border border-gp-line bg-gp-card p-5 text-gp-ink">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="phone-kicker">{t.app.track.yourVehicle}</p>
            {plate && (
              <span className="mt-2 inline-block rounded-[10px] border-2 border-current px-3 py-1 text-lg font-bold tracking-wider" dir="ltr">
                {displayPlate(plate)}
              </span>
            )}
          </div>
          <div className="text-end">
            <p className="phone-kicker">{t.portal.progress}</p>
            <p className={cn("mt-1 text-3xl font-bold tabular-nums", ready && "text-gp-success-ink")} dir="ltr">
              {progress} %
            </p>
          </div>
        </div>
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-label={t.portal.progress} aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
          <div
            className={cn("gp-grow-x h-full rounded-full transition-[width] duration-700 ease-out", ready && "bg-gp-success")}
            style={{ width: `${Math.max(progress, 4)}%`, ...(ready ? {} : { background: "linear-gradient(90deg, #f58a4f, #e2603a)" }) }}
          />
        </div>
      </div>

      <ol className="space-y-5 px-1">
        {steps.map((step) => (
          <li key={step.key} className="flex items-start gap-4" data-state={step.state}>
            <span
              className={cn(
                "relative grid size-8 shrink-0 place-items-center rounded-full",
                step.state === "done" && "bg-gp-success text-white",
                step.state === "current" && (ready ? "bg-gp-success text-white" : "border-2 border-[#f58a4f] shadow-[0_0_0_5px_rgb(226_96_58/0.18)]"),
                step.state === "upcoming" && "border-2 border-white/20",
              )}
              aria-hidden
            >
              {(step.state === "done" || (step.state === "current" && ready)) && <Check className="size-4" strokeWidth={3} />}
              {step.state === "current" && !ready && <span className="absolute inset-0 animate-ping rounded-full bg-[#e2603a] opacity-20 motion-reduce:hidden" />}
            </span>
            <div className="min-w-0 pt-1">
              <p className={cn("font-semibold", step.state === "upcoming" ? "text-gp-muted" : "text-gp-ink")}>{t.portal.steps[step.key]}</p>
              {step.state === "current" && <p className="mt-0.5 text-sm text-gp-muted">{t.portal.stepHints[step.key]}</p>}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
