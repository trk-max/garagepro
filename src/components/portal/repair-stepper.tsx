import { CarFront, Check, ClipboardCheck, PackageSearch, ShieldCheck, Sparkles, Wrench } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Dictionary } from "@/lib/i18n/fr";
import { cn } from "@/lib/utils";
import type { CustomerStep, CustomerStepKey } from "@/server/workflow";

const ICONS: Record<CustomerStepKey, LucideIcon> = {
  reception: ClipboardCheck,
  parts: PackageSearch,
  repair: Wrench,
  quality: ShieldCheck,
  washing: Sparkles,
  ready: CarFront,
};

/** Progress bar + steps: vertical on phones, horizontal from tablet width. V10 look (accent steps, hatched remainder) inside .gp-scope. */
export function RepairStepper({ steps, progress, t, ready }: { steps: CustomerStep[]; progress: number; t: Dictionary; ready: boolean }) {
  const current = steps.find((s) => s.state === "current");

  return (
    <section aria-label={t.portal.progress} className="rounded-[24px] border border-gp-line bg-gp-card p-5 text-gp-ink shadow-gp">
      <div className="flex items-baseline justify-between">
        <h2 className="text-base font-semibold">{t.portal.progress}</h2>
        <span className={cn("text-2xl font-bold tabular-nums", ready ? "text-gp-success-ink" : "text-gp-ink")}>{progress}%</span>
      </div>
      <div className="gp-hatch mt-3 h-3 overflow-hidden rounded-full bg-gp-panel" role="progressbar" aria-label={t.portal.progress} aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
        <div
          className={cn("gp-grow-x h-full rounded-full transition-[width] duration-700 ease-out", ready && "bg-gp-success")}
          style={{ width: `${Math.max(progress, 4)}%`, ...(ready ? {} : { background: "linear-gradient(90deg, var(--gp-accent-from), var(--gp-accent-to))" }) }}
        />
      </div>

      <ol className="mt-6 grid gap-4 md:grid-cols-[repeat(var(--n),minmax(0,1fr))] md:gap-2" style={{ ["--n" as string]: steps.length }}>
        {steps.map((step, i) => {
          const Icon = step.state === "done" ? Check : ICONS[step.key];
          return (
            <li key={step.key} className="relative flex gap-3 md:flex-col md:items-center md:text-center">
              {i < steps.length - 1 && (
                <span
                  aria-hidden
                  className={cn(
                    "absolute start-[19px] top-10 h-[calc(100%-1.5rem)] w-0.5 md:start-[calc(50%+1.5rem)] md:top-5 md:h-0.5 md:w-[calc(100%-3rem)]",
                    step.state === "done" ? "bg-gp-accent" : "bg-gp-panel",
                  )}
                />
              )}
              <span
                className={cn(
                  "relative z-10 grid size-10 shrink-0 place-items-center rounded-full ring-4 ring-gp-card transition-colors",
                  step.state === "done" && "bg-gp-accent text-white",
                  step.state === "current" && (ready ? "bg-[#1f7a44] text-white" : "bg-gp-primary text-gp-primary-ink"),
                  step.state === "upcoming" && "bg-gp-panel text-gp-muted",
                )}
              >
                {step.state === "current" && !ready && <span className="absolute inset-0 animate-ping rounded-full motion-reduce:hidden bg-gp-accent opacity-30" aria-hidden />}
                <Icon className="relative size-5" aria-hidden />
              </span>
              <div className="min-w-0 pt-1.5 md:pt-0">
                <p className={cn("text-sm font-medium", step.state === "upcoming" ? "text-gp-muted" : "text-gp-ink")}>
                  {t.portal.steps[step.key]}
                </p>
                {step.state === "current" && <p className="mt-0.5 text-xs text-gp-muted md:hidden">{t.portal.stepHints[step.key]}</p>}
              </div>
            </li>
          );
        })}
      </ol>

      {current && <p className="mt-5 hidden rounded-full bg-gp-panel px-4 py-2.5 text-center text-sm text-gp-muted md:block">{t.portal.stepHints[current.key]}</p>}
    </section>
  );
}
