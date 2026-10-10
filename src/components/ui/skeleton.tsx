import { cn } from "@/lib/utils";

/** Placeholder block shown while a page loads (same size as the real content: no layout shift). */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("rounded-sm bg-muted motion-safe:animate-pulse", className)} />;
}
