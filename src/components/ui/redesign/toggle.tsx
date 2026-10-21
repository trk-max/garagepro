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

/**
 * Same switch for plain forms: a real checkbox (role="switch", posted as "on"),
 * so server actions read it exactly like the former checkbox.
 */
export function SwitchInput({ name, defaultChecked, label, className }: { name: string; defaultChecked?: boolean; label: string; className?: string }) {
  return (
    <label className={cn("relative inline-flex cursor-pointer items-center gap-3 text-sm font-medium", className)}>
      <input type="checkbox" role="switch" name={name} defaultChecked={defaultChecked} className="peer sr-only" />
      <span
        aria-hidden
        className="relative inline-flex h-7 w-12 shrink-0 items-center rounded-full bg-gp-hover p-0.5 ring-1 ring-gp-line transition-colors duration-150 ring-inset peer-checked:bg-gp-accent peer-checked:ring-0 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-gp-accent peer-checked:[&>span]:translate-x-5 rtl:peer-checked:[&>span]:-translate-x-5"
      >
        <span className="size-6 rounded-full bg-white shadow-sm transition-transform duration-150" />
      </span>
      {label}
    </label>
  );
}
