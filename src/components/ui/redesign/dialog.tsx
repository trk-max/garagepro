"use client";

import { useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Pill button + native <dialog> holding an existing form (rendered by the server
 * page and passed as children). Focus stays inside, Escape / click outside close.
 * Another button can open the same dialog with <OpenDialog target={id} />.
 */
export function DialogButton({
  id,
  label,
  title,
  icon,
  variant = "primary",
  closeLabel,
  className,
  children,
}: {
  id: string;
  label: string;
  title: string;
  /** An icon element (<Plus />): components cannot be passed from the server to this client component. */
  icon?: ReactNode;
  variant?: "primary" | "secondary" | "outline";
  closeLabel: string;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        aria-haspopup="dialog"
        className={cn(
          "gp-lift inline-flex h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-medium whitespace-nowrap",
          variant === "primary" ? "bg-gp-primary text-gp-primary-ink hover:opacity-90" : variant === "secondary" ? "bg-gp-panel hover:bg-gp-hover" : "border border-gp-line bg-gp-card hover:bg-gp-hover",
          className,
        )}
      >
        {icon}
        {label}
      </button>
      <dialog
        id={id}
        ref={ref}
        aria-label={title}
        onClick={(e) => e.target === e.currentTarget && ref.current?.close()}
        className="gp-enter m-auto max-h-[calc(100dvh-2rem)] w-[min(36rem,calc(100vw-1.5rem))] rounded-[28px] border border-gp-line bg-gp-card p-0 text-gp-ink shadow-2xl backdrop:bg-black/40 backdrop:backdrop-blur-sm"
      >
        <div className="sticky top-0 z-10 flex items-center gap-3 bg-gp-card p-5 pb-3">
          <h2 className="flex-1 text-xl font-semibold tracking-tight">{title}</h2>
          <button type="button" onClick={() => ref.current?.close()} aria-label={closeLabel} className="grid size-10 place-items-center rounded-full bg-gp-panel hover:bg-gp-hover">
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="px-5 pb-5">{children}</div>
      </dialog>
    </>
  );
}

/** Opens a <dialog> rendered elsewhere on the page (e.g. the "+ New" avatar opening the create form). */
export function OpenDialog({ target, className, label, children }: { target: string; className?: string; label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-label={label}
      className={className}
      onClick={() => (document.getElementById(target) as HTMLDialogElement | null)?.showModal()}
    >
      {children}
    </button>
  );
}
