"use client";

import type { ReactNode } from "react";
import { portalLogoutAction } from "@/actions/portal";
import { clearPrivateCache } from "@/components/pwa/pwa-register";

/** « Quitter » the tracking: also forgets the page copies kept on the phone for offline viewing. */
export function PortalLogoutForm({ children }: { children: ReactNode }) {
  return (
    <form action={portalLogoutAction} onSubmit={() => clearPrivateCache()}>
      {children}
    </form>
  );
}
