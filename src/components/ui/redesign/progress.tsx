import { cn } from "@/lib/utils";

const clamp = (n: number) => Math.max(0, Math.min(100, n));

/**
 * Orange filled part + hatched remainder (the reference's "spending limit" bar).
 * `value` in % (0–100); grows from the start edge on first paint.
 */
export function ProgressBar({ value, label, className }: { value: number; label: string; className?: string }) {
  const v = clamp(value);
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v)}
      aria-label={label}
      className={cn("gp-hatch relative h-3 w-full overflow-hidden rounded-full bg-gp-panel", className)}
    >
      <div
        className="gp-grow-x absolute inset-y-0 start-0 rounded-full"
        style={{ width: `${v}%`, background: "linear-gradient(90deg, var(--gp-accent-from), var(--gp-accent-to))" }}
      />
    </div>
  );
}

/**
 * Ring gauge (SVG), drawn from 0 to `value` % (orange on grey, red when `tone="danger"`).
 * The centre shows `display` (default: the percentage) and an optional caption.
 */
export function ProgressRing({
  value,
  label,
  size = 120,
  stroke = 12,
  caption,
  display,
  tone = "accent",
}: {
  value: number;
  label: string;
  size?: number;
  stroke?: number;
  caption?: string;
  display?: string;
  tone?: "accent" | "danger";
}) {
  const v = clamp(value);
  const r = (size - stroke) / 2;
  const len = 2 * Math.PI * r;
  const offset = len * (1 - v / 100);
  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }} role="img" aria-label={`${label}: ${display ?? `${Math.round(v)} %`}`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--gp-panel)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={tone === "danger" ? "var(--gp-danger)" : "var(--gp-accent)"}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={len}
          strokeDashoffset={offset}
          className="gp-ring"
          style={{ ["--gp-ring-from" as string]: String(len) }}
        />
      </svg>
      <span className="absolute text-center" aria-hidden>
        <span className="block text-xl font-semibold tabular-nums" dir="ltr">{display ?? `${Math.round(v)}%`}</span>
        {caption && <span className="block text-xs text-gp-muted">{caption}</span>}
      </span>
    </div>
  );
}
