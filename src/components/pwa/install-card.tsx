"use client";

import { Download, Share, Smartphone } from "lucide-react";
import { useInstallState } from "@/components/pwa/install-app-button";
import { cn } from "@/lib/utils";

type Labels = { title: string; text: string; button: string; iosSteps: string; otherSteps: string; httpsOnly: string };

/**
 * « Installer l'app » card of the client app and the team space: the browser's install offer on
 * Android / PC, the Share → « Sur l'écran d'accueil » steps on iPhone; hidden once opened from the icon.
 * On http (garage Wi-Fi address) browsers cannot install: it says to install from the https website.
 */
export function InstallCard({ labels, className }: { labels: Labels; className?: string }) {
  const s = useInstallState();
  if (s.installed) return null;
  return (
    <section className={cn("phone-card flex items-start gap-4 p-5", className)} data-testid="install-card">
      <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white/[0.06]" aria-hidden>
        <Smartphone className="size-5" />
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        <h2 className="text-base font-semibold">{labels.title}</h2>
        <p className="text-sm leading-relaxed text-[var(--phone-muted)]">{labels.text}</p>
        {s.canPrompt ? (
          <button type="button" onClick={s.prompt} className="phone-pill mt-1 min-h-11 px-5 text-sm">
            <Download className="size-4" aria-hidden /> {labels.button}
          </button>
        ) : s.ios ? (
          <p className="flex items-start gap-2 rounded-2xl bg-white/[0.05] px-3 py-2 text-sm">
            <Share className="mt-0.5 size-4 shrink-0" aria-hidden /> {labels.iosSteps}
          </p>
        ) : (
          <p className="text-sm text-[var(--phone-muted)]">{s.insecure ? labels.httpsOnly : labels.otherSteps}</p>
        )}
      </div>
    </section>
  );
}
