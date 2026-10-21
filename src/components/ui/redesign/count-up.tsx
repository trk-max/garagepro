"use client";

import { formatMoney, type Lang } from "@/lib/format";
import { useCountUp } from "@/components/ui/redesign/motion";

/** Splits "322,345 DT" / "TND 322.345" into currency and digits, so the currency can be set smaller. */
function splitMoney(text: string): [string, string, string] {
  const m = /^([^\d-]*?)\s*(-?[\d\s.,  ]*\d)\s*(.*)$/.exec(text);
  return m ? [m[1] ?? "", m[2] ?? text, m[3] ?? ""] : ["", text, ""];
}

/** A big figure that counts up from 0 (600 ms) once the page is shown. Money is in millimes; its currency is set at 0.55 em. */
export function CountUp({ value, format = "int", lang }: { value: number; format?: "int" | "money"; lang: Lang }) {
  const shown = useCountUp(value);
  const final = format === "money" ? formatMoney(value, lang) : String(value);
  if (format === "money") {
    const [pre, digits, post] = splitMoney(formatMoney(Math.round(shown), lang));
    return (
      <span dir="ltr" className="tabular-nums">
        <span aria-hidden>
          {pre && <span className="me-1 text-[0.55em] font-medium">{pre}</span>}
          {digits}
          {post && <span className="ms-1 text-[0.55em] font-medium">{post}</span>}
        </span>
        <span className="sr-only">{final}</span>
      </span>
    );
  }
  const text = Math.round(shown).toLocaleString(lang === "en" ? "en-GB" : lang === "ar" ? "ar-TN" : "fr-FR");
  return (
    <span dir="ltr" className="tabular-nums">
      {/* Screen readers get the final value only, not every frame. */}
      <span aria-hidden>{text}</span>
      <span className="sr-only">{final}</span>
    </span>
  );
}
