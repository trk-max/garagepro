/**
 * Work certificate ("attestation de travail") — pure text, from the data
 * really recorded. Nothing is invented: a missing field blocks the issue
 * (see missingCertificateFields). No signature or stamp is drawn: the
 * document leaves an empty space for the handwritten signature and stamp.
 */
export type CertificateSnapshot = {
  number: string;
  issuedAt: string; // ISO
  company: { legalName: string; address: string; taxId: string | null; repName: string; repTitle: string; city: string; phone: string | null; email: string | null };
  employee: { name: string; nationalId: string | null; jobTitle: string; hireDate: string; endDate: string | null };
  purpose: string | null;
};

export type CertificateSources = {
  company: { legalName?: string | null; garageName?: string | null; address?: string | null; taxId?: string | null; legalRepName?: string | null; legalRepTitle?: string | null; city?: string | null; phone?: string | null; email?: string | null };
  employee: { name: string; nationalId?: string | null; jobTitle?: string | null; hireDate?: Date | null; isActive: boolean };
  endDate?: Date | null;
};

export function missingCertificateFields(s: CertificateSources): string[] {
  const missing: string[] = [];
  if (!(s.company.legalName || s.company.garageName)) missing.push("raison sociale");
  if (!s.company.address) missing.push("adresse de l'entreprise");
  if (!s.company.legalRepName) missing.push("nom du représentant légal");
  if (!s.company.legalRepTitle) missing.push("qualité du représentant légal");
  if (!s.company.city) missing.push("ville");
  if (!s.employee.jobTitle) missing.push("poste de l'employé");
  if (!s.employee.hireDate) missing.push("date d'embauche");
  if (!s.employee.isActive && !s.endDate) missing.push("date de fin de contrat (ancien employé)");
  return missing;
}

const day = (d: Date) => d.toISOString().slice(0, 10);

export function buildCertificateSnapshot(number: string, issuedAt: Date, s: CertificateSources, purpose: string | null): CertificateSnapshot {
  const c = s.company;
  return {
    number,
    issuedAt: issuedAt.toISOString(),
    company: {
      legalName: (c.legalName || c.garageName)!,
      address: c.address!,
      taxId: c.taxId ?? null,
      repName: c.legalRepName!,
      repTitle: c.legalRepTitle!,
      city: c.city!,
      phone: c.phone ?? null,
      email: c.email ?? null,
    },
    employee: {
      name: s.employee.name,
      nationalId: s.employee.nationalId ?? null,
      jobTitle: s.employee.jobTitle!,
      hireDate: day(s.employee.hireDate!),
      endDate: s.employee.isActive ? null : day(s.endDate!),
    },
    purpose,
  };
}

const frDate = (iso: string) => new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso.slice(0, 10)}T12:00:00Z`));

/** The paragraphs of the certificate, in French. */
export function certificateParagraphs(s: CertificateSnapshot): string[] {
  const e = s.employee;
  const c = s.company;
  const id = e.nationalId ? `, titulaire de la carte d'identité nationale n° ${e.nationalId}` : "";
  const company = `${c.legalName}, sise ${c.address}${c.taxId ? `, matricule fiscal ${c.taxId}` : ""}`;
  const work = e.endDate
    ? `a été employé(e) au sein de notre entreprise en qualité de ${e.jobTitle} du ${frDate(e.hireDate)} au ${frDate(e.endDate)}.`
    : `est employé(e) au sein de notre entreprise en qualité de ${e.jobTitle} depuis le ${frDate(e.hireDate)} à ce jour.`;
  return [
    `Je soussigné(e), ${c.repName}, agissant en qualité de ${c.repTitle} de la société ${company}, atteste par la présente que ${e.name}${id}, ${work}`,
    `La présente attestation est délivrée à l'intéressé(e), à sa demande, pour servir et valoir ce que de droit${s.purpose ? ` (${s.purpose})` : ""}.`,
    `Fait à ${c.city}, le ${frDate(s.issuedAt)}.`,
  ];
}
