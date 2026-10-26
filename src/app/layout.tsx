import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Toaster } from "sonner";
import { I18nProvider } from "@/lib/i18n/client";
import { NetworkStatus } from "@/components/pwa/network-status";
import { PwaRegister } from "@/components/pwa/pwa-register";
import { cookies } from "next/headers";
import { getI18n } from "@/lib/i18n/server";
import { CLIENT_MANIFEST_URL } from "@/lib/pwa-manifests";
import { parseTheme, THEME_COOKIE } from "@/lib/theme";
import "@fontsource-variable/inter";
import "./globals.css";

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0b0c10" },
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
  ],
};

export const metadata: Metadata = {
  title: "GaragePro",
  description: "Gestion d'atelier mécanique",
  // The app is already in French, Arabic and English: stop the browser from
  // auto-translating it (its rewrites of the page break the language switch).
  other: { google: "notranslate" },
  // Installable apps (phone + PC): the CLIENT app by default (/app); the staff pages and /login point to
  // the TEAM app (/equipe). See src/lib/pwa-manifests.ts and public/sw.js.
  applicationName: "GaragePro",
  manifest: CLIENT_MANIFEST_URL,
  appleWebApp: { capable: true, title: "GaragePro", statusBarStyle: "black-translucent" },
  icons: { apple: "/icons/app-apple-180.png" },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const [{ lang, dir, t }, jar] = await Promise.all([getI18n(), cookies()]);
  const theme = parseTheme(jar.get(THEME_COOKIE)?.value);
  return (
    <html lang={lang} dir={dir} translate="no" className={theme === "dark" ? "dark" : undefined} suppressHydrationWarning>
      <body className="antialiased">
        <I18nProvider lang={lang} t={t}>
          <NetworkStatus />
          {children}
        </I18nProvider>
        <PwaRegister />
        {/* Phones: above the bottom tab bars (staff and client app). */}
        <Toaster position={dir === "rtl" ? "bottom-left" : "bottom-right"} mobileOffset={{ bottom: "calc(5.5rem + env(safe-area-inset-bottom))" }} richColors theme={theme} dir={dir} />
      </body>
    </html>
  );
}
