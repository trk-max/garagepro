"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Sparkles, X } from "lucide-react";
import { AssistantChat, type ChatService } from "@/components/portal/assistant-chat";
import { useI18n } from "@/lib/i18n/client";

/**
 * Floating "Ask AI" button on every page of the customer site: opens the same
 * assistant (guided diagnosis + AI) in a small window, without leaving the page.
 * Not shown on /assistant, which already is the full-page chat.
 */
export function AskAiWidget(props: { aiEnabled: boolean; services: ChatService[]; phone: string | null; whatsapp: string | null }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (pathname?.startsWith("/assistant")) return null;
  return (
    <div className="fixed end-4 bottom-4 z-50 flex flex-col items-end gap-3 print:hidden">
      {open && (
        <div
          role="dialog"
          aria-label={t.assistant.title}
          className="flex h-[min(600px,calc(100dvh-6rem))] w-[min(400px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl shadow-2xl ring-1 ring-black/10"
        >
          <AssistantChat {...props} embedded />
        </div>
      )}
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
  );
}
