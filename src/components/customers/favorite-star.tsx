"use client";

import { useOptimistic, useTransition } from "react";
import { Star } from "lucide-react";
import { toast } from "sonner";
import { toggleFavoriteCustomerAction } from "@/actions/dashboard";
import { fmt } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

/** Star button: flips at once (optimistic), the server confirms; on error it flips back and says why. */
export function FavoriteStar({ id, name, initial }: { id: string; name: string; initial: boolean }) {
  const { t } = useI18n();
  const c = t.v10.pages.customers;
  const [pending, start] = useTransition();
  const [on, setOn] = useOptimistic(initial);
  const label = fmt(on ? c.favRemove : c.favAdd, { name });
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={label}
      title={label}
      // Not "disabled" while saving: a disabled button loses keyboard focus. Extra clicks are ignored instead.
      aria-busy={pending}
      onClick={() =>
        !pending &&
        start(async () => {
          setOn(!on);
          const r = await toggleFavoriteCustomerAction(id);
          if (!r.ok) toast.error(r.error);
        })
      }
      className="relative z-10 grid size-9 place-items-center rounded-full transition-colors duration-150 hover:bg-gp-hover"
    >
      <Star className={cn("size-[18px]", on ? "fill-[#c98a00] text-[#c98a00]" : "text-gp-muted")} aria-hidden />
    </button>
  );
}
