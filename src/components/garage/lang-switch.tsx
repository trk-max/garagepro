"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import type { Lang } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

const LABELS: { code: Lang; short: string; full: string }[] = [
  { code: "fr", short: "FR", full: "Français" },
  { code: "ar", short: "ع", full: "العربية" },
  { code: "en", short: "EN", full: "English" },
];

/**
 * Language switch: plain links to /api/lang, which sets the cookie on the
 * server and redirects back to the same page. A full navigation (not a soft
 * refresh) so the new language always shows at once — browser caches and
 * translators (Opera, Chrome, Edge) cannot get in the way.
 */
export function LangSwitch({ className }: { className?: string }) {
  const { lang, t } = useI18n();
  const pathname = usePathname() || "/";
  const [pending, setPending] = useState<Lang | null>(null);

  const href = (code: Lang, next: string) => `/api/lang?l=${code}&next=${encodeURIComponent(next)}`;

  return (
    <div role="group" aria-label={t.common.language} className={cn("inline-flex rounded-md border p-0.5 text-xs", className)}>
      {LABELS.map(({ code, short, full }) => (
        <a
          key={code}
          href={href(code, pathname)}
          onClick={(event) => {
            event.preventDefault();
            if (code === lang || pending) return;
            setPending(code);
            // Keep the query string too (filters, ?status=…).
            window.location.assign(href(code, window.location.pathname + window.location.search));
          }}
          aria-current={lang === code ? "true" : undefined}
          aria-label={full}
          title={full}
          lang={code}
          className={cn(
            "inline-flex min-w-9 items-center justify-center rounded px-2.5 py-1 font-medium transition-colors",
            lang === code ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent",
            pending === code && "opacity-60",
          )}
        >
          {short}
        </a>
      ))}
    </div>
  );
}
