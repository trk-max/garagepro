import type { ReactNode } from "react";
import Link from "next/link";
import { MapPin, Phone, Wrench } from "lucide-react";
import { LangSwitch } from "@/components/garage/lang-switch";
import { getI18n } from "@/lib/i18n/server";
import { getSettings } from "@/server/settings";

export const dynamic = "force-dynamic";

/** Customer portal shell: dark-blue header, light content, garage contact footer. */
export default async function PublicLayout({ children }: { children: ReactNode }) {
  const [{ t }, settings] = await Promise.all([getI18n(), getSettings()]);

  return (
    <div className="flex min-h-dvh flex-col bg-slate-100 text-slate-900">
      <header className="bg-navy text-white">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <Link href="/" className="flex min-w-0 items-center gap-2.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-orange-500 text-white">
              <Wrench className="size-5" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{settings.garageName}</span>
              <span className="block truncate text-xs text-slate-300">{t.portal.tagline}</span>
            </span>
          </Link>
          <nav className="ms-auto hidden items-center gap-1 text-sm sm:flex">
            <Link href="/assistant" className="inline-flex min-h-11 items-center rounded-md px-3 text-slate-200 hover:bg-white/10 hover:text-white">
              {t.assistant.navCta}
            </Link>
            <Link href="/suivi" className="inline-flex min-h-11 items-center rounded-md px-3 text-slate-200 hover:bg-white/10 hover:text-white">
              {t.portal.trackCta}
            </Link>
            <Link href="/rdv" className="inline-flex min-h-11 items-center rounded-md bg-orange-500 px-3 font-medium text-white hover:bg-orange-600">
              {t.portal.bookCta}
            </Link>
          </nav>
          <div className="ms-auto rounded-md bg-white sm:ms-2">
            <LangSwitch />
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="bg-anthracite text-slate-300">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-5 text-sm">
          <span className="font-medium text-white">{settings.garageName}</span>
          {settings.address && (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="size-4" aria-hidden /> {settings.address}
            </span>
          )}
          {settings.phone && (
            <a href={`tel:${settings.phone.replace(/\s/g, "")}`} className="inline-flex min-h-11 items-center gap-1.5 hover:text-white" dir="ltr">
              <Phone className="size-4" aria-hidden /> {settings.phone}
            </a>
          )}
          <Link href="/login" className="ms-auto inline-flex min-h-11 items-center text-sm text-slate-300 hover:text-white">
            {t.portal.staffLink}
          </Link>
        </div>
      </footer>
    </div>
  );
}
