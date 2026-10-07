import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Toaster } from "sonner";
import { I18nProvider } from "@/lib/i18n/client";
import { getI18n } from "@/lib/i18n/server";
import "./globals.css";

export const metadata: Metadata = {
  title: "GaragePro",
  description: "Gestion d'atelier mécanique",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const { lang, dir, t } = await getI18n();
  return (
    <html lang={lang} dir={dir} suppressHydrationWarning>
      <body className="antialiased">
        <I18nProvider lang={lang} t={t}>
          {children}
        </I18nProvider>
        <Toaster position={dir === "rtl" ? "bottom-left" : "bottom-right"} richColors dir={dir} />
      </body>
    </html>
  );
}
