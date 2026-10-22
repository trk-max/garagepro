import type { Metadata } from "next";
import type { ReactNode } from "react";

/** V15 — entrance kiosk, waiting-room screen and ticket tracking: full-screen pages without the staff shell. */
export const metadata: Metadata = { title: "GaragePro — Accueil", robots: { index: false, follow: false } };

export default function AccueilLayout({ children }: { children: ReactNode }) {
  return children;
}
