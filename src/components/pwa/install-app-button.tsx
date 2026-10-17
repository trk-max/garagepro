"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/**
 * "Install the app" (PC: Chrome/Edge window app; Android: home-screen app).
 * Hidden once installed. On iPhone (no install prompt) it shows the Share tip.
 */
export function InstallAppButton({ className }: { className?: string }) {
  const { t } = useI18n();
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [ios, setIos] = useState(false);
  const [installed, setInstalled] = useState(true);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setInstalled(standalone);
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent) && !standalone);
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPrompt);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed || (!prompt && !ios)) return null;
  if (ios) return <p className={cn("text-[11px] leading-snug text-muted-foreground", className)}>{t.pwa.installHint}</p>;
  return (
    <button
      type="button"
      onClick={async () => {
        await prompt?.prompt();
        setPrompt(null);
      }}
      className={cn("f-label inline-flex min-h-9 w-full items-center justify-center gap-2 border border-border px-3 text-muted-foreground transition-colors hover:border-brand-500 hover:text-brand-500", className)}
    >
      <Download className="size-4" aria-hidden /> {t.pwa.install}
    </button>
  );
}
