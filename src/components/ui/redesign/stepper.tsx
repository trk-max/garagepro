import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Horizontal progress stepper in the accent colour: done steps are filled with a
 * check, the current one has an orange ring, later ones are grey. `current` = -1
 * when the flow is stopped (e.g. cancelled); `note` explains a side state
 * (waiting for parts…). Scrolls sideways on narrow screens; ordered list for screen readers.
 */
export function Stepper({ steps, current, note, label, className }: { steps: string[]; current: number; note?: string; label: string; className?: string }) {
  return (
    <div className={className}>
      <ol aria-label={label} className="gp-scroll-x flex overflow-x-auto pb-1">
        {steps.map((s, i) => {
          const done = current >= 0 && i < current;
          const now = i === current;
          return (
            <li key={s} aria-current={now ? "step" : undefined} className="relative flex min-w-[5.5rem] flex-1 flex-col items-center gap-2 text-center">
              {i > 0 && (
                <span
                  aria-hidden
                  className={cn("absolute top-[15px] h-0.5 [inset-inline-end:50%] [inset-inline-start:-50%]", done || now ? "bg-gp-accent" : "bg-gp-line")}
                  style={done || now ? undefined : { backgroundColor: "color-mix(in oklab, var(--gp-ink) 12%, transparent)" }}
                />
              )}
              <span
                className={cn(
                  "relative z-10 grid size-8 place-items-center rounded-full text-xs font-semibold",
                  done && "bg-gp-accent text-white",
                  now && "bg-gp-card text-gp-accent-ink ring-[3px] ring-gp-accent",
                  !done && !now && "bg-gp-panel text-gp-muted",
                )}
              >
                {done ? <Check className="size-4" aria-hidden /> : i + 1}
              </span>
              <span className={cn("px-1 text-[11px] leading-tight sm:text-xs", now ? "font-semibold text-gp-ink" : done ? "text-gp-ink" : "text-gp-muted")}>
                {s}
                {done && <span className="sr-only"> ✓</span>}
              </span>
            </li>
          );
        })}
      </ol>
      {note && <p className="mt-2 text-center text-xs font-medium text-gp-accent-ink">{note}</p>}
    </div>
  );
}
