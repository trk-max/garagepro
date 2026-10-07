"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setLangAction } from "@/actions/catalog";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

export function LangSwitch({ className }: { className?: string }) {
  const { lang, t } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const choose = (next: "fr" | "ar") =>
    startTransition(async () => {
      await setLangAction(next);
      router.refresh();
    });

  return (
    <div role="group" aria-label={t.common.language} className={cn("inline-flex rounded-md border p-0.5 text-xs", className)}>
      {(["fr", "ar"] as const).map((code) => (
        <button
          key={code}
          type="button"
          disabled={pending}
          onClick={() => choose(code)}
          aria-pressed={lang === code}
          className={cn(
            "rounded px-2.5 py-1 font-medium transition-colors",
            lang === code ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent",
          )}
        >
          {code === "fr" ? "Français" : "العربية"}
        </button>
      ))}
    </div>
  );
}
