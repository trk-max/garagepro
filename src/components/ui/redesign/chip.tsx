import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
import type { Lang } from "@/lib/format";
import { cn } from "@/lib/utils";

export type ChipTone = "neutral" | "success" | "danger" | "accent" | "onAccent";

const TONE: Record<ChipTone, string> = {
  neutral: "bg-gp-panel text-gp-ink",
  success: "bg-gp-success-bg text-gp-success-ink",
  danger: "bg-gp-danger-bg text-gp-danger-ink",
  accent: "bg-gp-accent-tint text-gp-accent-ink",
  // On the orange card: dark veil so white text keeps 4.5:1.
  onAccent: "bg-black/25 text-white",
};

/** Small pill label. */
export function Chip({ tone = "neutral", className, children }: { tone?: ChipTone; className?: string; children: ReactNode }) {
  return <span className={cn("inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-xs font-medium whitespace-nowrap", TONE[tone], className)}>{children}</span>;
}

const locale = (lang: Lang) => (lang === "en" ? "en-GB" : lang === "ar" ? "ar-TN" : "fr-FR");

/**
 * Change in % (green up / red down) followed by what it is compared with.
 * `change` null = nothing to compare with (previous period at zero).
 */
export function DeltaChip({ change, lang, caption, noCompare, onAccent = false }: { change: number | null; lang: Lang; caption: string; noCompare: string; onAccent?: boolean }) {
  if (change === null) {
    return (
      <span className="flex flex-wrap items-center gap-2 text-xs">
        <Chip tone={onAccent ? "onAccent" : "neutral"}>—</Chip>
        <span className={onAccent ? "text-white" : "text-gp-muted"}>{noCompare}</span>
      </span>
    );
  }
  const up = change >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="flex flex-wrap items-center gap-2 text-xs">
      <Chip tone={onAccent ? "onAccent" : up ? "success" : "danger"}>
        <Icon className="size-3.5" aria-hidden />
        <span dir="ltr" className="tabular-nums">
          <span className="sr-only">{up ? "+" : "−"}</span>
          {Math.abs(change).toLocaleString(locale(lang))} %
        </span>
      </Chip>
      <span className={onAccent ? "rounded-full bg-black/25 px-2 py-0.5 text-white" : "text-gp-muted"}>{caption}</span>
    </span>
  );
}

/** Coloured dot + label (work order status in tables). */
export function StatusDot({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap text-[13px]">
      <span className="size-2 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
      {children}
    </span>
  );
}
