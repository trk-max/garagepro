"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { LangSwitch } from "@/components/garage/lang-switch";
import { appBackHref } from "@/lib/app-base";
import { useI18n } from "@/lib/i18n/client";

/** Header of every PWA client app page: back arrow (except on the home), garage dot + name, language switch. */
export function AppHeader({ garageName }: { garageName: string }) {
  const pathname = usePathname() ?? "/app";
  const { t } = useI18n();
  const back = appBackHref(pathname);
  return (
    <header className="mx-auto flex w-full max-w-md items-center gap-3 px-4 pt-4 pb-2 sm:max-w-3xl">
      {back && (
        <Link href={back} aria-label={t.common.back} className="-ms-2 grid size-11 shrink-0 place-items-center rounded-full text-white/80 hover:bg-white/10 hover:text-white">
          <ArrowLeft className="size-5 rtl:rotate-180" aria-hidden />
        </Link>
      )}
      <span className="phone-dot shrink-0" aria-hidden />
      <span className="phone-kicker min-w-0 flex-1 truncate !text-white">{garageName}</span>
      <LangSwitch className="border-white/10" />
    </header>
  );
}
