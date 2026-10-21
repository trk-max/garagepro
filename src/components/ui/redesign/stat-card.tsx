import Link from "next/link";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import type { Lang } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CountUp } from "@/components/ui/redesign/count-up";

/**
 * KPI tile: label + round icon button at the top, big counted-up number, then a
 * chip line (delta or note). `accent` = the orange gradient tile (white text).
 * The whole tile is a link when `href` is set (the icon is then decorative).
 */
export function StatCard({
  label,
  value,
  format = "int",
  lang,
  icon: Icon,
  href,
  footer,
  accent = false,
  className,
}: {
  label: string;
  value: number;
  format?: "int" | "money";
  lang: Lang;
  icon: LucideIcon;
  href?: string;
  footer?: ReactNode;
  accent?: boolean;
  className?: string;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className={cn("min-w-0 text-[13px] font-medium", accent ? "rounded-xl bg-black/25 px-2.5 py-1 leading-tight text-white" : "text-gp-muted")}>{label}</p>
        <span
          className={cn("grid size-9 shrink-0 place-items-center rounded-full", accent ? "bg-white/20 text-white" : "border border-gp-line bg-gp-card text-gp-ink")}
          aria-hidden
        >
          <Icon className="size-4" />
        </span>
      </div>
      <p className="mt-5 leading-none font-semibold tracking-tight whitespace-nowrap" style={{ fontSize: "clamp(20px, 14cqi, 34px)" }}>
        <CountUp value={value} format={format} lang={lang} />
      </p>
      {footer && <div className="mt-4">{footer}</div>}
    </>
  );
  const cls = cn(
    "@container block min-w-0 rounded-[20px] p-4 sm:p-5",
    accent ? "text-white shadow-[0_12px_28px_-14px_rgb(217_83_46/0.7)]" : "bg-gp-panel text-gp-ink",
    href && "gp-lift",
    className,
  );
  const style = accent ? { background: "linear-gradient(150deg, var(--gp-accent-from), var(--gp-accent-to))" } : undefined;
  return href ? (
    <Link href={href} className={cls} style={style}>
      {body}
    </Link>
  ) : (
    <div className={cls} style={style}>
      {body}
    </div>
  );
}
