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

/** Progress bar + steps: vertical on phones, horizontal from tablet width. */
export function RepairStepper({ steps, progress, t, ready }: { steps: CustomerStep[]; progress: number; t: Dictionary; ready: boolean }) {
  const current = steps.find((s) => s.state === "current");

  return (
    <section aria-label={t.portal.progress} className="rounded-lg bg-card p-5 shadow-sm ring-1 ring-border">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground">{t.portal.progress}</h2>
        <span className={cn("text-2xl font-bold tabular-nums", ready ? "text-emerald-600" : "text-foreground")}>{progress}%</span>
      </div>
      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
        <div
          className={cn("h-full rounded-full transition-[width] duration-700 ease-out", ready ? "bg-emerald-500" : "bg-foreground")}
          style={{ width: `${Math.max(progress, 4)}%` }}
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
                    step.state === "done" ? "bg-emerald-500" : "bg-muted",
                  )}
                />
              )}
              <span
                className={cn(
                  "relative z-10 grid size-10 shrink-0 place-items-center rounded-full ring-4 ring-white transition-colors",
                  step.state === "done" && "bg-emerald-500 text-white",
                  step.state === "current" && (ready ? "bg-emerald-500 text-white" : "bg-brand-500 text-white"),
                  step.state === "upcoming" && "bg-muted text-muted-foreground",
                )}
              >
                {step.state === "current" && !ready && <span className="absolute inset-0 animate-ping rounded-full motion-reduce:hidden bg-brand-400 opacity-30" aria-hidden />}
                <Icon className="relative size-5" aria-hidden />
              </span>
              <div className="min-w-0 pt-1.5 md:pt-0">
                <p className={cn("text-sm font-medium", step.state === "upcoming" ? "text-muted-foreground" : "text-foreground")}>
                  {t.portal.steps[step.key]}
                </p>
                {step.state === "current" && <p className="mt-0.5 text-xs text-muted-foreground md:hidden">{t.portal.stepHints[step.key]}</p>}
              </div>
            </li>
          );
        })}
      </ol>

      {current && <p className="mt-5 hidden rounded-lg bg-muted px-3 py-2 text-center text-sm text-muted-foreground md:block">{t.portal.stepHints[current.key]}</p>}
    </section>
  );
}
