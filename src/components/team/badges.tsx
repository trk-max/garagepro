import type { LeaveStatus } from "@prisma/client";
import { cn } from "@/lib/utils";

const TONE: Record<LeaveStatus, string> = {
  PENDING: "border-amber-500 text-amber-700 dark:text-amber-400",
  APPROVED: "border-emerald-600 text-emerald-700 dark:text-emerald-400",
  REJECTED: "border-red-500 text-red-600 dark:text-red-400",
  CANCELLED: "border-border text-muted-foreground",
};

export function LeaveBadge({ status, label }: { status: LeaveStatus; label: string }) {
  return <span className={cn("f-label border px-2 py-0.5 text-[0.625rem]", TONE[status])}>{label}</span>;
}
