"use client";

import { usePathname } from "next/navigation";
import { type CSSProperties, useEffect, useState } from "react";
import { Sparkles, X } from "lucide-react";
import { AssistantChat, type ChatService } from "@/components/portal/assistant-chat";
import { useI18n } from "@/lib/i18n/client";

/**
 * Floating "Ask AI" button on every page of the customer site: opens the same
 * assistant (guided diagnosis + AI) without leaving the page.
 * - computer / tablet: a small window above the button;
 * - phone: a full-screen sheet that follows the visible area (the on-screen keyboard
 *   shrinks it, so the input stays just above the keyboard) and the page behind does not scroll.
 * Not shown on /assistant, which already is the full-page chat.
 */
export function AskAiWidget(props: { aiEnabled: boolean; services: ChatService[]; phone: string | null; whatsapp: string | null }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const viewport = useVisibleViewport(open);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    // Phone: the page behind the sheet must not scroll (iOS scrolls it when the keyboard opens).
    const phone = window.matchMedia("(max-width: 639px)").matches;
    const previous = document.body.style.overflow;
    if (phone) document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (pathname?.startsWith("/assistant")) return null;
  return (
    <>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t.assistant.title}
          // Phone: whole visible screen (height/top from visualViewport). From 640 px: floating window.
          style={viewport ? ({ "--gp-vh": `${viewport.height}px`, "--gp-vtop": `${viewport.top}px` } as CSSProperties) : undefined}
          className="fixed inset-x-0 top-[var(--gp-vtop,0px)] z-[60] flex h-[var(--gp-vh,100dvh)] flex-col overflow-hidden bg-card print:hidden sm:inset-x-auto sm:end-4 sm:top-auto sm:bottom-20 sm:h-[min(600px,calc(100dvh-7rem))] sm:w-[400px] sm:rounded-2xl sm:shadow-2xl sm:ring-1 sm:ring-black/10"
        >
          <AssistantChat {...props} embedded onClose={() => setOpen(false)} />
        </div>
      )}
      <div className={open ? "fixed end-4 bottom-4 z-50 hidden print:hidden sm:block" : "fixed end-4 bottom-4 z-50 print:hidden"}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex h-12 items-center gap-2 rounded-full bg-brand-500 px-5 font-medium text-white shadow-lg transition-colors hover:bg-brand-600 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-500/50"
        >
          {open ? <X className="size-5" aria-hidden /> : <Sparkles className="size-5" aria-hidden />}
          <span>{open ? t.common.close : t.assistant.askAi}</span>
        </button>
      </div>
    </>
  );
}

/** Size and position of the part of the screen really visible (shrinks when the phone keyboard opens). */
function useVisibleViewport(active: boolean) {
  const [box, setBox] = useState<{ height: number; top: number } | null>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!active || !vv) return;
    const update = () => setBox({ height: Math.round(vv.height), top: Math.round(vv.offsetTop) });
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      setBox(null);
    };
  }, [active]);
  return box;
}
