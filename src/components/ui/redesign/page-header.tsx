import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Page title block: big H1 + muted subtitle at the start, actions (black pill
 * CTA first) at the end. Also used by every older page through ui/field.tsx.
 */
export function PageHeader({ title, subtitle, children, className }: { title: ReactNode; subtitle?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <header className={cn("mb-6 flex flex-wrap items-end gap-x-6 gap-y-4", className)}>
      <div className="min-w-0 flex-1 basis-72">
        <h1 className="text-[28px] leading-tight font-semibold tracking-tight text-balance sm:text-4xl lg:text-[40px]">{title}</h1>
        {subtitle && <p className="mt-2 text-sm text-gp-muted sm:text-[15px]">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}
