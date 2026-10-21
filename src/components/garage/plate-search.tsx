import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Plate field that opens the check-in: the car's open order if it is in the
 * workshop, otherwise its history + the new-order form. Plain GET form (works
 * without JavaScript).
 */
export function PlateSearch({ placeholder, label, defaultValue, className, size = "md" }: { placeholder: string; label: string; defaultValue?: string; className?: string; size?: "md" | "lg" }) {
  return (
    <form action="/garage/work-orders/new" method="get" role="search" className={cn("relative flex", className)}>
      <input
        name="plate"
        required
        minLength={2}
        maxLength={20}
        defaultValue={defaultValue}
        placeholder={placeholder}
        aria-label={label}
        autoComplete="off"
        autoCapitalize="characters"
        dir="ltr"
        className={cn(
          "min-w-0 flex-1 rounded-full border border-input bg-background ps-4 font-mono uppercase tracking-wider text-foreground outline-none placeholder:normal-case placeholder:tracking-normal focus-visible:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-500/30",
          size === "lg" ? "h-14 pe-16 text-xl" : "h-11 pe-12 text-sm",
        )}
      />
      <button
        type="submit"
        aria-label={label}
        className={cn("absolute end-1 top-1 grid shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition-colors hover:bg-brand-500 hover:text-white", size === "lg" ? "size-12" : "size-9")}
      >
        <Search className={size === "lg" ? "size-5" : "size-4"} aria-hidden />
      </button>
    </form>
  );
}
