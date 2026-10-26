"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Download } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/*
 * The browser's install offer (Android / PC Chrome-Edge) is fired once, often before React has
 * hydrated: it is caught here as soon as this module loads and shared by every install button.
 */
let deferred: InstallPrompt | null = null;
let installedNow = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallPrompt;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installedNow = true;
    emit();
  });
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export type InstallState = {
  /** Opened from the home-screen icon (or just installed): nothing to offer. */
  installed: boolean;
  /** iPhone / iPad Safari: no install offer, the Share → « Sur l'écran d'accueil » steps instead. */
  ios: boolean;
  /** The browser's own install offer is available (Android, PC). */
  canPrompt: boolean;
  /** http on the garage Wi-Fi: browsers only install from https (or localhost). */
  insecure: boolean;
  prompt: () => Promise<void>;
};

/** Install state shared by the install buttons / cards (client app « /app » and team app). */
export function useInstallState(): InstallState {
  const prompt = useSyncExternalStore(subscribe, () => deferred, () => null);
  const justInstalled = useSyncExternalStore(subscribe, () => installedNow, () => false);
  const [env, setEnv] = useState({ standalone: true, ios: false, insecure: false });
  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    // iPadOS reports a Mac: a Mac with a touch screen is an iPad.
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (/macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
    setEnv({ standalone, ios: ios && !standalone, insecure: !window.isSecureContext });
  }, []);
  return {
    installed: env.standalone || justInstalled,
    ios: env.ios,
    canPrompt: !!prompt,
    insecure: env.insecure,
    prompt: async () => {
      if (!deferred) return;
      const p = deferred;
      deferred = null;
      emit();
      await p.prompt();
    },
  };
}

/**
 * "Install the app" (PC: Chrome/Edge window app; Android: home-screen app).
 * Hidden once installed. On iPhone (no install prompt) it shows the Share tip.
 */
export function InstallAppButton({ className }: { className?: string }) {
  const { t } = useI18n();
  const s = useInstallState();

  if (s.installed || (!s.canPrompt && !s.ios)) return null;
  if (s.ios) return <p className={cn("text-[11px] leading-snug text-muted-foreground", className)}>{t.pwa.installHint}</p>;
  return (
    <button
      type="button"
      onClick={s.prompt}
      className={cn("f-label inline-flex min-h-9 w-full items-center justify-center gap-2 border border-border px-3 text-muted-foreground transition-colors hover:border-brand-500 hover:text-brand-500", className)}
    >
      <Download className="size-4" aria-hidden /> {t.pwa.install}
    </button>
  );
}
