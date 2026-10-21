import Link from "next/link";
import type { ReactNode } from "react";
import { GpMonogram } from "@/components/brand/garagepro-logo";
import { NavProgress } from "@/components/shell/nav-progress";
import { SideRail } from "@/components/shell/side-rail";
import { SignOutForm } from "@/components/shell/sign-out-form";
import { TopNav } from "@/components/shell/top-nav";
import type { ShellUser } from "@/components/shell/user-menu";
import type { NavBadges } from "@/components/shell/nav";

/**
 * V10 staff frame: grey canvas in a 32 px rounded container, floating pill top
 * bar, icon rail (bottom bar below 1280 px). Everything but the page itself is
 * hidden on paper (print:hidden), so printed documents are unchanged.
 */
export function AppShell({
  user,
  garage,
  badges,
  skipLabel,
  children,
}: {
  user: ShellUser;
  garage: { name: string; logo: string | null };
  badges: NavBadges;
  skipLabel: string;
  children: ReactNode;
}) {
  return (
    <div className="gp-app min-h-dvh bg-gp-outer text-gp-ink md:p-3 print:bg-white print:p-0">
      <a
        href="#gp-main"
        className="sr-only z-50 rounded-full bg-gp-primary px-4 py-2 text-sm text-gp-primary-ink focus:not-sr-only focus:fixed focus:start-4 focus:top-4"
      >
        {skipLabel}
      </a>
      <SignOutForm />
      <NavProgress />
      <div className="min-h-dvh bg-gp-canvas md:min-h-[calc(100dvh-1.5rem)] md:rounded-[32px] print:min-h-0 print:rounded-none print:bg-white">
        <TopNav logo={<LogoPill garage={garage} />} user={user} badges={badges} />
        <div className="xl:grid xl:grid-cols-[5rem_minmax(0,1fr)] xl:ps-4 print:block print:ps-0">
          <SideRail role={user.role} badges={badges} />
          <main id="gp-main" tabIndex={-1} className="min-w-0 pb-28 outline-none xl:pb-8 print:pb-0">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}

/**
 * Garage logo (settings) or the GaragePro mark, with the garage's name from the settings.
 * The logo keeps its proportions at a fixed height inside a white capsule whose width is
 * capped (wide logos shrink, square ones stay square), so it never pushes the page pills.
 */
function LogoPill({ garage }: { garage: { name: string; logo: string | null } }) {
  return (
    <Link href="/garage" className="flex h-full min-w-0 items-center gap-3 rounded-full p-1.5 sm:pe-5" aria-label={garage.name} title={garage.name}>
      {garage.logo ? (
        <span className="flex h-11 max-w-28 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white px-2.5 sm:max-w-32" aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element -- data URL from the settings (same as printed documents) */}
          <img src={garage.logo} alt="" className="h-8 w-auto max-w-full object-contain" />
        </span>
      ) : (
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-gp-primary text-gp-primary-ink" aria-hidden>
          <GpMonogram className="h-6 w-auto" aria-hidden />
        </span>
      )}
      <span className="hidden max-w-40 min-w-0 truncate text-[15px] font-semibold sm:block xl:max-w-36 2xl:max-w-48">{garage.name}</span>
    </Link>
  );
}
