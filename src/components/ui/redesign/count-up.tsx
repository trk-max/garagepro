"use client";

import { formatMoney, type Lang } from "@/lib/format";
import { useCountUp } from "@/components/ui/redesign/motion";

/** A big figure that counts up from 0 (600 ms) once the page is shown. Money is in millimes. */
export function CountUp({ value, format = "int", lang }: { value: number; format?: "int" | "money"; lang: Lang }) {
  const shown = useCountUp(value);
  const text = format === "money" ? formatMoney(Math.round(shown), lang) : Math.round(shown).toLocaleString(lang === "en" ? "en-GB" : lang === "ar" ? "ar-TN" : "fr-FR");
  const final = format === "money" ? formatMoney(value, lang) : String(value);
  return (
    <span dir="ltr" className="tabular-nums">
      {/* Screen readers get the final value only, not every frame. */}
      <span aria-hidden>{text}</span>
      <span className="sr-only">{final}</span>
    </span>
  );
}
