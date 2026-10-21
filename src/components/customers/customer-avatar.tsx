import { initials } from "@/components/shell/initials";
import { cn } from "@/lib/utils";

/* Deep gradients: the white initials (large, semibold) keep at least 3:1, the WCAG level for large text. */
const GRADIENTS = [
  ["#e2603a", "#b4431f"],
  ["#4f6bed", "#2f4ac0"],
  ["#9b5de5", "#6d28d9"],
  ["#e0457b", "#b0245a"],
  ["#2e9e5b", "#1f7a44"],
  ["#c27c0e", "#8f5f05"],
] as const;

const pick = (key: string) => {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return GRADIENTS[h % GRADIENTS.length]!;
};

/** Round avatar with the customer's initials on a gradient picked from the name (stable per customer). */
export function CustomerAvatar({ name, size = 56, className }: { name: string; size?: number; className?: string }) {
  const [from, to] = pick(name);
  return (
    <span
      aria-hidden
      className={cn("grid shrink-0 place-items-center rounded-full font-semibold text-white", className)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.34), background: `linear-gradient(140deg, ${from}, ${to})` }}
    >
      {initials(name) || "?"}
    </span>
  );
}
