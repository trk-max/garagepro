import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, CalendarCheck, Gauge, MapPin, Phone } from "lucide-react";
import { CinematicFooter } from "@/components/ui/motion-footer";
import type { Dictionary } from "@/lib/i18n/fr";
import { LangSwitch } from "@/components/garage/lang-switch";
import { ThemeToggle } from "@/components/theme-toggle";
import { GpMonogram, GpWordmark } from "@/components/brand/garagepro-logo";

type Labels = { tagline: string; about: string; assistant: string; track: string; book: string; staff: string; claims: string; showroom: string };

const NAV_LINK =
  "f-label inline-flex min-h-11 shrink-0 items-center whitespace-nowrap px-3 text-white/70 transition-colors hover:text-white focus-visible:text-white";

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
  footer,
  children,
}: {
  garageName: string;
  address: string | null;
  phone: string | null;
  labels: Labels;
  footer: Dictionary["footer"];
  children: ReactNode;
}) {
  const links = [
    { href: "/showroom", label: labels.showroom },
    { href: "/a-propos", label: labels.about },
    { href: "/assistant", label: labels.assistant },
    { href: "/suivi", label: labels.track },
    { href: "/reclamation", label: labels.claims },
  ];

  return (
    <div className="ferrari flex min-h-dvh flex-col bg-background text-foreground">
      <header className="dark border-b border-[#303030] bg-black text-white">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <Link href="/" aria-label={garageName} className="group flex shrink-0 items-center gap-3 py-1">
            <GpMonogram className="h-9 w-auto shrink-0 text-white" aria-hidden />
            <span className="hidden h-7 w-px bg-[#303030] sm:block" aria-hidden />
            <GpWordmark className="h-2.5 w-auto shrink-0 text-white sm:h-3" aria-hidden />
          </Link>

          <nav className="ms-auto hidden items-center xl:flex" aria-label="Navigation">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className={NAV_LINK}>
                {l.label}
              </Link>
            ))}
            <Link
              href="/rdv"
              className="f-label ms-2 inline-flex min-h-10 items-center gap-2 whitespace-nowrap border border-white px-4 text-white transition-colors hover:border-brand-500 hover:bg-brand-500"
            >
              {labels.book}
              <ArrowRight className="size-3.5 rtl:rotate-180" aria-hidden />
            </Link>
          </nav>

          <div className="ms-auto flex items-center gap-1 xl:ms-3">
            <ThemeToggle className="text-white/70 hover:bg-white/10 hover:text-white" />
            <LangSwitch className="border-[#303030]" />
          </div>
        </div>

        {/* Phones and tablets: booking first (the main action, always visible),
            then the other links on one swipeable row. */}
        <nav className="scroll-row flex overflow-x-auto border-t border-[#303030] px-2 xl:hidden" aria-label="Navigation">
          <Link href="/rdv" className={`${NAV_LINK} gap-1.5 text-white underline decoration-brand-500 decoration-2 underline-offset-8`}>
            {labels.book}
            <ArrowRight className="size-3.5 rtl:rotate-180" aria-hidden />
          </Link>
          {["/suivi", "/showroom", "/assistant", "/a-propos", "/reclamation"].flatMap((href) => links.filter((l) => l.href === href)).map((l) => (
            <Link key={l.href} href={l.href} className={NAV_LINK}>
              {l.label}
            </Link>
          ))}
        </nav>
      </header>

      <main className="flex-1">{children}</main>

      <CinematicFooter
        className="dark"
        giantText="GARAGEPRO"
        marquee={footer.marquee}
        heading={footer.heading}
        primaryLinks={[
          { href: "/rdv", label: labels.book, icon: <CalendarCheck aria-hidden /> },
          { href: "/suivi", label: labels.track, icon: <Gauge aria-hidden /> },
          ...(phone ? [{ href: `tel:${phone.replace(/\s/g, "")}`, label: footer.call, icon: <Phone aria-hidden />, external: true }] : []),
        ]}
        secondaryLinks={[
          { href: "/showroom", label: labels.showroom },
          { href: "/a-propos", label: labels.about },
          { href: "/assistant", label: labels.assistant },
          { href: "/reclamation", label: labels.claims },
          { href: "/login", label: labels.staff },
        ]}
        copyright={`© ${new Date().getFullYear()} ${garageName}. ${footer.rights}`}
        credit={{ before: footer.craftedWith, after: footer.by, name: garageName }}
        backToTopLabel={footer.backToTop}
        info={
          <span className="inline-flex flex-wrap items-center justify-center gap-x-4 gap-y-1 md:justify-start">
            <span>{labels.tagline}</span>
            {address && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3.5" strokeWidth={1.5} aria-hidden /> {address}
              </span>
            )}
            {phone && (
              <span dir="ltr" className="inline-flex items-center gap-1">
                <Phone className="size-3.5" strokeWidth={1.5} aria-hidden /> {phone}
              </span>
            )}
          </span>
        }
      />
    </div>
  );
}
