import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** White card, 24 px corners, hairline border, almost no shadow. */
export function Surface({ className, ...props }: ComponentProps<"section">) {
  return <section className={cn("rounded-[24px] border border-gp-line bg-gp-card p-5 text-gp-ink shadow-gp", className)} {...props} />;
}

/** Grey inner panel inside a card (16–20 px corners). */
export function Panel({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-[18px] bg-gp-panel p-4", className)} {...props} />;
}

/** Card heading row: title (+ hint) at the start, actions at the end. */
export function SurfaceHeader({ title, hint, children, id }: { title: ReactNode; hint?: ReactNode; children?: ReactNode; id?: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-start gap-3">
      <div className="min-w-0 flex-1">
        <h2 id={id} className="text-lg font-semibold tracking-tight">{title}</h2>
        {hint && <p className="mt-0.5 text-[13px] text-gp-muted">{hint}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

type PillVariant = "primary" | "secondary" | "outline";
const PILL: Record<PillVariant, string> = {
  primary: "bg-gp-primary text-gp-primary-ink hover:opacity-90",
  secondary: "bg-gp-panel text-gp-ink hover:bg-gp-hover",
  outline: "border border-gp-line bg-gp-card text-gp-ink hover:bg-gp-hover",
};

/** Pill link button (black primary, grey secondary, outlined). */
export function PillLink({ href, variant = "primary", icon: Icon, className, children }: { href: string; variant?: PillVariant; icon?: LucideIcon; className?: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className={cn("gp-lift inline-flex h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-medium whitespace-nowrap", PILL[variant], className)}
    >
      {Icon && <Icon className="size-4 shrink-0 rtl:-scale-x-100" aria-hidden />}
      {children}
    </Link>
  );
}

/** Round icon badge used at the corner of cards (decorative, or a link when `href` is set). */
export function IconBubble({ icon: Icon, href, label, className }: { icon: LucideIcon; href?: string; label?: string; className?: string }) {
  const cls = cn("grid size-9 shrink-0 place-items-center rounded-full border border-gp-line bg-gp-card text-gp-ink", className);
  if (href && label) {
    return (
      <Link href={href} aria-label={label} title={label} className={cn(cls, "gp-lift hover:bg-gp-hover")}>
        <Icon className="size-4" aria-hidden />
      </Link>
    );
  }
  return (
    <span className={cls} aria-hidden>
      <Icon className="size-4" />
    </span>
  );
}

/** Centered empty state for a card. */
export function EmptyState({ icon: Icon, title, children }: { icon: LucideIcon; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-8 text-center">
      <span className="grid size-11 place-items-center rounded-full bg-gp-panel text-gp-muted" aria-hidden>
        <Icon className="size-5" />
      </span>
      <p className="text-sm font-medium">{title}</p>
      {children && <div className="text-[13px] text-gp-muted">{children}</div>}
    </div>
  );
}
