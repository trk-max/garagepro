import type { Metadata } from "next";
import { GpMonogram, GpWordmark } from "@/components/brand/garagepro-logo";
import { LangSwitch } from "@/components/garage/lang-switch";
import { ThemeToggle } from "@/components/theme-toggle";
import { companyLogoutAction } from "@/actions/company";
import { getI18n } from "@/lib/i18n/server";
import { getCompanyViewer } from "@/server/company-session";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Company portal shell (separate from the staff area and the public site). */
export default async function CompanyLayout({ children }: { children: React.ReactNode }) {
  const [{ t }, viewer] = await Promise.all([getI18n(), getCompanyViewer()]);
  return (
    <div className="min-h-dvh bg-background">
      <header className="dark border-b border-[#303030] bg-black text-white">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <GpMonogram className="h-8 w-auto" aria-hidden />
          <span className="min-w-0">
            <GpWordmark className="h-2.5 w-auto" aria-hidden />
            <span className="f-label block text-[0.625rem] text-white/60">{t.v7.company.portalTitle}</span>
          </span>
          <div className="ms-auto flex items-center gap-2">
            <LangSwitch />
            <ThemeToggle />
            {viewer && (
              <form action={companyLogoutAction}>
                <button type="submit" className="f-label border border-white/30 px-3 py-2 text-[0.625rem] hover:border-white">
                  {t.v7.company.signOut}
                </button>
              </form>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl p-4 sm:p-6">{children}</main>
    </div>
  );
}
