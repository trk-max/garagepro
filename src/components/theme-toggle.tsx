"use client";

import { Moon, Sun } from "lucide-react";
import { useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import { useI18n } from "@/lib/i18n/client";
import { THEME_COOKIE, type Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";

/**
 * Sun / moon switch. Flips the class on <html> at once (no wait), saves the
 * choice for a year, then refreshes server parts that depend on it (toasts).
 */
export function ThemeToggle({ className, withLabel = false }: { className?: string; withLabel?: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const theme = useSyncExternalStore(subscribe, readTheme, () => "dark" as Theme);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.classList.toggle("dark", next === "dark");
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  };

  const label = theme === "dark" ? t.common.lightMode : t.common.darkMode;
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className={cn("inline-flex min-h-9 items-center gap-2 rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground", className)}
    >
      {theme === "dark" ? <Sun className="size-4" aria-hidden /> : <Moon className="size-4" aria-hidden />}
      {withLabel && <span className="text-xs font-medium">{label}</span>}
    </button>
  );
}

/** Follows the class on <html> (also changes made by another toggle on the page). */
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

function readTheme(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}
