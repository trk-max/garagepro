"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/**
 * Phones and tablets (< 1024 px): the secondary actions of a card fold under « Plus d'actions » so the one big
 * button stays alone. From 1024 px they are always shown, as before (the summary is hidden).
 */
export function FoldOnPhone({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  if (wide) return <div className={className}>{children}</div>;
  return (
    <details className={`group mt-2 rounded-[16px] border border-gp-line ${className ?? ""}`} data-testid="more-actions">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 text-sm font-medium [&::-webkit-details-marker]:hidden">
        <span className="flex-1">{label}</span>
        <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="px-3 pb-3">{children}</div>
    </details>
  );
}
