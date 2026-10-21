import type { LeaveBalance } from "@/lib/leaves";
import { fmt } from "@/lib/format";
import type { Dictionary } from "@/lib/i18n/fr";
import { cn } from "@/lib/utils";

/** "Congés payés 2026 : 12 restants sur 24 — pris 12 j, en attente 3 j". */
export function LeaveBalanceLine({ balance, t, className }: { balance: LeaveBalance; t: Dictionary; className?: string }) {
  const l = t.v7.leave;
  const over = balance.remaining !== null && balance.remaining - balance.pending < 0;
  return (
    <div className={cn("border px-3 py-2 text-sm", over && "border-amber-500/40 bg-amber-500/10", className)}>
      <p className="label-tech">{fmt(l.balanceTitle, { year: balance.year })}</p>
      {balance.allowance === null ? (
        <p className="mt-1 text-muted-foreground">{l.balanceUnset}</p>
      ) : (
        <p className="mt-1">
          <strong className="text-lg tabular-nums">{balance.remaining}</strong> {fmt(l.balanceOf, { total: balance.allowance })}
          <span className="text-muted-foreground"> — {fmt(l.balanceDetail, { taken: balance.taken, pending: balance.pending })}</span>
          {over && <span className="block text-amber-700 dark:text-amber-400">{l.balanceOver}</span>}
        </p>
      )}
    </div>
  );
}
