"use client";

import { useRouter } from "next/navigation";
import { useRef, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

type ActionData = { redirectTo?: string; warning?: string; message?: string } | null | undefined;
type Result = { ok: true; data: ActionData } | { ok: false; error: string };

/**
 * Form wired to a (bound) Server Action returning ActionResult:
 * disables inputs while pending, toasts errors/warnings, resets and
 * follows `redirectTo` on success.
 */
export function ActionForm({
  action,
  children,
  className,
  reset = true,
  silent = false,
  successMessage,
  closeDialog = false,
}: {
  action: (form: FormData) => Promise<Result>;
  children: ReactNode;
  className?: string;
  reset?: boolean;
  silent?: boolean;
  successMessage?: string;
  /** On success, close the <dialog> holding the form. */
  closeDialog?: boolean;
}) {
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const { t } = useI18n();

  return (
    <form
      ref={ref}
      className={className}
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(async () => {
          const result = await action(data);
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          if (result.data?.warning) toast.warning(result.data.warning);
          else if (result.data?.message) toast.success(result.data.message);
          else if (successMessage) toast.success(successMessage);
          else if (!silent) toast.success(t.common.saved);
          if (reset) ref.current?.reset();
          if (closeDialog) ref.current?.closest("dialog")?.close();
          if (result.data?.redirectTo) router.push(result.data.redirectTo);
        });
      }}
    >
      <fieldset disabled={pending} className={cn("contents", pending && "opacity-70")}>
        {children}
      </fieldset>
    </form>
  );
}

/** One-click Server Action (status change, invoice, delete line…). */
export function ActionButton({
  action,
  children,
  confirm,
  successMessage,
  ...buttonProps
}: Omit<React.ComponentProps<typeof Button>, "onClick" | "action"> & {
  action: () => Promise<Result>;
  confirm?: string;
  successMessage?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      {...buttonProps}
      disabled={pending || buttonProps.disabled}
      onClick={() => {
        if (confirm && !window.confirm(confirm)) return;
        startTransition(async () => {
          const result = await action();
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          if (result.data?.warning) toast.warning(result.data.warning);
          else if (result.data?.message) toast.success(result.data.message);
          else if (successMessage) toast.success(successMessage);
          if (result.data?.redirectTo) router.push(result.data.redirectTo);
          else router.refresh();
        });
      }}
    >
      {children}
    </Button>
  );
}

/** Select that fires a Server Action on change (assignment, quick edits). */
export function ActionSelect({
  action,
  defaultValue,
  options,
  className,
  disabled,
  ariaLabel,
}: {
  action: (value: string) => Promise<Result>;
  defaultValue: string;
  options: { value: string; label: string }[];
  className?: string;
  disabled?: boolean;
  ariaLabel: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <select
      aria-label={ariaLabel}
      defaultValue={defaultValue}
      disabled={disabled || pending}
      className={cn(
        "h-9 rounded-md border border-input bg-background px-2 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50",
        className,
      )}
      onChange={(e) => {
        const value = e.target.value;
        startTransition(async () => {
          const result = await action(value);
          if (!result.ok) toast.error(result.error);
        });
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
