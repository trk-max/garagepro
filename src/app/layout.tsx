import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Toaster } from "sonner";
import { I18nProvider } from "@/lib/i18n/client";
import { cookies } from "next/headers";
import { getI18n } from "@/lib/i18n/server";
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
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const [{ lang, dir, t }, jar] = await Promise.all([getI18n(), cookies()]);
  const theme = parseTheme(jar.get(THEME_COOKIE)?.value);
  return (
    <html lang={lang} dir={dir} className={theme === "dark" ? "dark" : undefined} suppressHydrationWarning>
      <body className="antialiased">
        <I18nProvider lang={lang} t={t}>
          {children}
        </I18nProvider>
        <Toaster position={dir === "rtl" ? "bottom-left" : "bottom-right"} richColors theme={theme} dir={dir} />
      </body>
    </html>
  );
}
