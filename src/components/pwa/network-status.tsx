"use client";

import { useEffect, useRef, useState } from "react";
import { WifiOff } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n/client";

/** Thin banner when this device has no network at all (pages then come from the saved copies). */
export function NetworkStatus() {
  const { t } = useI18n();
  const [online, setOnline] = useState(true);
  const wasOffline = useRef(false);

  useEffect(() => {
    const update = () => {
      const on = navigator.onLine;
      setOnline(on);
      if (on && wasOffline.current) toast.success(t.pwa.backOnline);
      wasOffline.current = !on;
    };
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, [t]);

  if (online) return null;
  return (
    <div role="status" className="sticky top-0 z-50 flex items-center gap-2 border-b border-brand-500/50 bg-black px-4 py-2 text-xs text-white print:hidden">
      <WifiOff className="size-4 shrink-0 text-brand-500" aria-hidden />
      <span>{t.pwa.offline}</span>
    </div>
  );
}
