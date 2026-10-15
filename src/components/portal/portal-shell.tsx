import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, MapPin, Phone } from "lucide-react";
import { LangSwitch } from "@/components/garage/lang-switch";
import { ThemeToggle } from "@/components/theme-toggle";
import { GpMonogram, GpWordmark } from "@/components/brand/garagepro-logo";

type Labels = { tagline: string; about: string; assistant: string; track: string; book: string; staff: string };

const NAV_LINK =
  "f-label inline-flex min-h-11 shrink-0 items-center px-3 text-white/70 transition-colors hover:text-white focus-visible:text-white";

/**
 * Customer site shell, "black marble" style: a flat black bar with small
 * uppercase tracked links, a hairline, then the page; a #181818 footer.
 * Rosso Corsa appears only on hover/focus. `ferrari` scopes the tokens
 * (square corners, black/white palette) to the customer site only.
 */
export function PortalShell({
  garageName,
  address,
  phone,
  labels,
  children,
}: {
  garageName: string;
  address: string | null;
  phone: string | null;
  labels: Labels;
  children: ReactNode;
}) {
  const links = [
    { href: "/a-propos", label: labels.about },
    { href: "/assistant", label: labels.assistant },
    { href: "/suivi", label: labels.track },
  ];

  return (
    <div className="ferrari flex min-h-dvh flex-col bg-background text-foreground">
      <header className="dark border-b border-[#303030] bg-black text-white">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <Link href="/" aria-label={garageName} className="group flex min-w-0 items-center gap-3 py-1">
            <GpMonogram className="h-9 w-auto shrink-0 text-white" aria-hidden />
            <span className="hidden h-7 w-px bg-[#303030] sm:block" aria-hidden />
            <GpWordmark className="h-2.5 w-auto text-white sm:h-3" aria-hidden />
          </Link>

          <nav className="ms-auto hidden items-center lg:flex" aria-label="Navigation">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className={NAV_LINK}>
                {l.label}
              </Link>
            ))}
            <Link
              href="/rdv"
              className="f-label ms-2 inline-flex min-h-10 items-center gap-2 border border-white px-4 text-white transition-colors hover:border-brand-500 hover:bg-brand-500"
            >
              {labels.book}
              <ArrowRight className="size-3.5 rtl:rotate-180" aria-hidden />
            </Link>
          </nav>

          <div className="ms-auto flex items-center gap-1 lg:ms-3">
            <ThemeToggle className="text-white/70 hover:bg-white/10 hover:text-white" />
            <LangSwitch className="border-[#303030]" />
          </div>
        </div>

        {/* Phones and tablets: the same links on one scrollable row. */}
        <nav className="flex overflow-x-auto border-t border-[#303030] px-2 lg:hidden" aria-label="Navigation">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className={NAV_LINK}>
              {l.label}
            </Link>
          ))}
          <Link href="/rdv" className={`${NAV_LINK} gap-1.5 text-white`}>
            {labels.book}
            <ArrowRight className="size-3.5 rtl:rotate-180" aria-hidden />
          </Link>
        </nav>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="dark border-t border-[#303030] bg-[#181818] text-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-3">
          <div className="space-y-4">
            <GpMonogram className="h-10 w-auto text-white" aria-hidden />
            <GpWordmark className="h-3 w-auto text-white" aria-hidden />
            <p className="text-[0.75rem] tracking-[0.06em] text-[#8f8f8f]">{labels.tagline}</p>
          </div>
          <div className="space-y-3 text-[0.75rem] tracking-[0.06em] text-white/80">
            {address && (
              <p className="flex items-start gap-2">
                <MapPin className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} aria-hidden /> {address}
              </p>
            )}
            {phone && (
              <a href={`tel:${phone.replace(/\s/g, "")}`} className="flex items-center gap-2 transition-colors hover:text-brand-500" dir="ltr">
                <Phone className="size-4 shrink-0" strokeWidth={1.5} aria-hidden /> {phone}
              </a>
            )}
          </div>
          <div className="flex flex-col items-start gap-1 sm:items-end">
            <Link href="/rdv" className="f-label inline-flex min-h-11 items-center gap-2 text-white transition-colors hover:text-brand-500">
              {labels.book} <ArrowRight className="size-3.5 rtl:rotate-180" aria-hidden />
            </Link>
            <Link href="/login" className="f-label inline-flex min-h-11 items-center text-[#8f8f8f] transition-colors hover:text-white">
              {labels.staff}
            </Link>
          </div>
        </div>
        <p className="f-label border-t border-[#303030] px-4 py-5 text-center text-[0.6875rem] text-[#666666]">
          © {new Date().getFullYear()} {garageName}
        </p>
      </footer>
    </div>
  );
}
