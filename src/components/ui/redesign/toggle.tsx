"use client";

import { cn } from "@/lib/utils";

/** Accessible on/off switch (role="switch", Space/Enter toggle it like any button). Orange when on. */
export function Toggle({
  checked,
  onChange,
  label,
  disabled,
  className,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full p-0.5 transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-gp-accent" : "bg-gp-hover ring-1 ring-gp-line ring-inset",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-6 rounded-full bg-white shadow-sm transition-transform duration-150",
          checked ? "translate-x-5 rtl:-translate-x-5" : "translate-x-0",
        )}
      />
    </button>
  );
}
