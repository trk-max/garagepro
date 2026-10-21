import Link from "next/link";
import { Target } from "lucide-react";
import type { Dictionary } from "@/lib/i18n/fr";
import { fmt, formatMoney, type Lang } from "@/lib/format";
import { ProgressBar } from "@/components/ui/redesign/progress";
import { EmptyState, IconBubble, Surface } from "@/components/ui/redesign/surface";

/**
 * Monthly target (Setting.monthlyRevenueTarget) vs payments received this month.
 * No target set (0) → empty state pointing to the settings; never an invented figure.
 */
export function GoalCard({ t, lang, goal, canSetGoal }: { t: Dictionary; lang: Lang; goal: { target: number; achieved: number; percent: number | null }; canSetGoal: boolean }) {
  const o = t.v10.overview;
  return (
    <Surface aria-labelledby="ov-goal">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 id="ov-goal" className="text-lg font-semibold tracking-tight">{o.goal}</h2>
        <IconBubble icon={Target} />
      </div>
      {goal.target <= 0 ? (
        <EmptyState icon={Target} title={o.goalEmpty}>
          {canSetGoal ? (
            <Link href="/garage/settings#monthly-target" className="mt-1 inline-flex h-10 items-center rounded-full bg-gp-primary px-4 text-sm font-medium text-gp-primary-ink">
              {o.goalSet}
            </Link>
          ) : (
            o.goalAskAdmin
          )}
        </EmptyState>
      ) : (
        <>
          <ProgressBar value={goal.percent ?? 0} label={o.goal} />
          <p className="mt-3 text-[13px]">
            <b className="text-base font-semibold tabular-nums">{fmt(o.goalOf, { x: formatMoney(goal.achieved, lang), y: formatMoney(goal.target, lang) })}</b>
          </p>
          <p className="mt-1 text-xs text-gp-muted">{fmt(o.goalPercent, { p: goal.percent ?? 0 })}</p>
        </>
      )}
    </Surface>
  );
}
