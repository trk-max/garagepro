"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { Lang } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

const LABELS: { code: Lang; short: string; full: string }[] = [
  { code: "fr", short: "FR", full: "Français" },
  { code: "ar", short: "ع", full: "العربية" },
  { code: "en", short: "EN", full: "English" },
];

/**
 * Language switch. The choice is written straight into the "lang" cookie in
 * the browser, then the page is re-rendered by the server in that language.
 * (No Server Action: an open tab keeps working even after the app was rebuilt.)
 */
export function LangSwitch({ className }: { className?: string }) {
  const { lang, t } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const choose = (next: Lang) => {
    if (next === lang) return;
    document.cookie = `lang=${next}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.lang = next;
    document.documentElement.dir = next === "ar" ? "rtl" : "ltr";
    startTransition(() => router.refresh());
  };

  return (
    <div role="group" aria-label={t.common.language} className={cn("inline-flex rounded-md border p-0.5 text-xs", className)}>
      {LABELS.map(({ code, short, full }) => (
        <button
          key={code}
          type="button"
          disabled={pending}
          onClick={() => choose(code)}
          aria-pressed={lang === code}
          aria-label={full}
          title={full}
          lang={code}
          className={cn(
            "min-w-9 rounded px-2.5 py-1 font-medium transition-colors",
            lang === code ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent",
          )}
        >
          {short}
        </button>
      ))}
    </div>
  );
}
