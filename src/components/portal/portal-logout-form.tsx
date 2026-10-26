"use client";

import type { ReactNode } from "react";
import { portalLogoutAction } from "@/actions/portal";
import { clearPrivateCache } from "@/components/pwa/pwa-register";
import { useAppBase } from "@/lib/app-base";

/** « Quitter » the tracking: also forgets the page copies kept on the phone for offline viewing. */
export function PortalLogoutForm({ children }: { children: ReactNode }) {
  const base = useAppBase();
  return (
    <form action={portalLogoutAction} onSubmit={() => clearPrivateCache()}>
      {base && <input type="hidden" name="from" value="app" />}
      {children}
    </form>
  );
}
