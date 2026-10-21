import { GpMonogram, GpWordmark } from "@/components/brand/garagepro-logo";

/**
 * Logo at the top of every printed document: the garage's own logo (Paramètres →
 * Logo des documents) or, when none was uploaded, the GaragePro mark in black.
 */
export function DocLogo({ logo, name }: { logo: string | null | undefined; name: string }) {
  if (logo) {
    // eslint-disable-next-line @next/next/no-img-element -- data URL from the settings, printed as is
    return <img src={logo} alt={name} className="mb-3 max-h-16 max-w-[45mm] object-contain" />;
  }
  return (
    <div className="mb-3 flex items-center gap-2 text-black" aria-label="GaragePro">
      <GpMonogram className="h-10 w-auto" aria-hidden />
      <GpWordmark className="h-3 w-auto" aria-hidden />
    </div>
  );
}

/**
 * Legal footer of every printed document: who issued it, and the free text of the
 * settings (RIB, conditions…). On paper it sits at the bottom of EVERY page
 * (position: fixed in print, see .doc-footer in globals.css).
 */
export function DocFooter({
  garage,
  text,
  taxIdLabel,
}: {
  garage: { name: string; address: string | null; phone: string | null; email: string | null; taxId: string | null };
  text?: string | null;
  taxIdLabel: string;
}) {
  const identity = [garage.name, garage.address?.replace(/\s*\n\s*/g, ", "), garage.phone, garage.email, garage.taxId ? `${taxIdLabel} : ${garage.taxId}` : null].filter(Boolean);
  return (
    <footer className="doc-footer mt-10 border-t pt-2 text-center text-[10px] leading-snug text-zinc-500">
      <p>{identity.join(" · ")}</p>
      {text && <p className="whitespace-pre-line">{text}</p>}
    </footer>
  );
}
