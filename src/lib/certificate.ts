/**
 * Work certificate ("attestation de travail") — pure text, from the data
 * really recorded. Nothing is invented: a missing mandatory field blocks the
 * issue (see missingCertificateFields); an optional one (capital, registry,
 * contract type, recipient) simply leaves its clause out. The sentence "n'est
 * ni démissionnaire, ni en procédure de licenciement" is written ONLY when the
 * issuer confirmed it. No signature or stamp is drawn: the document leaves an
 * empty space for the handwritten signature and stamp.
 */
export const CONTRACT_TYPES = ["CDI", "CDD", "SIVP", "OTHER"] as const;
export type ContractType = (typeof CONTRACT_TYPES)[number];

export type CertificateSnapshot = {
  number: string;
  issuedAt: string; // ISO
  company: {
    legalName: string;
    address: string;
    taxId: string | null;
    repName: string;
    repTitle: string;
    city: string;
    phone: string | null;
    email: string | null;
    /** Added in V7.8 (absent from older certificates). */
    capital?: string | null;
    registryNumber?: string | null;
    registryCity?: string | null;
  };
  employee: { name: string; nationalId: string | null; jobTitle: string; hireDate: string; endDate: string | null; contractType?: ContractType | null; notResigning?: boolean };
  recipient?: { name: string; address: string | null } | null;
  purpose: string | null;
};

export type CertificateSources = {
  company: {
    legalName?: string | null;
    garageName?: string | null;
    address?: string | null;
    legalAddress?: string | null;
    taxId?: string | null;
    legalRepName?: string | null;
    legalRepTitle?: string | null;
    city?: string | null;
    phone?: string | null;
    email?: string | null;
    legalCapital?: string | null;
    registryNumber?: string | null;
    registryCity?: string | null;
  };
  employee: { name: string; nationalId?: string | null; jobTitle?: string | null; hireDate?: Date | null; isActive: boolean; contractType?: string | null };
  endDate?: Date | null;
};

export function missingCertificateFields(s: CertificateSources): string[] {
  const missing: string[] = [];
  if (!(s.company.legalName || s.company.garageName)) missing.push("raison sociale");
  if (!(s.company.legalAddress || s.company.address)) missing.push("adresse du siège social");
  if (!s.company.legalRepName) missing.push("nom du représentant légal");
  if (!s.company.legalRepTitle) missing.push("qualité du représentant légal");
  if (!s.company.city) missing.push("ville");
  if (!s.employee.jobTitle) missing.push("poste de l'employé");
  if (!s.employee.hireDate) missing.push("date d'embauche");
  if (!s.employee.isActive && !s.endDate) missing.push("date de fin de contrat (ancien employé)");
  return missing;
}

const day = (d: Date) => d.toISOString().slice(0, 10);
const contract = (v?: string | null): ContractType | null => ((CONTRACT_TYPES as readonly string[]).includes(v ?? "") ? (v as ContractType) : null);

export function buildCertificateSnapshot(
  number: string,
  issuedAt: Date,
  s: CertificateSources,
  purpose: string | null,
  extra: { notResigning?: boolean; recipient?: { name: string; address?: string | null } | null } = {},
): CertificateSnapshot {
  const c = s.company;
  return {
    number,
    issuedAt: issuedAt.toISOString(),
    company: {
      legalName: (c.legalName || c.garageName)!,
      address: (c.legalAddress || c.address)!,
      taxId: c.taxId ?? null,
      repName: c.legalRepName!,
      repTitle: c.legalRepTitle!,
      city: c.city!,
      phone: c.phone ?? null,
      email: c.email ?? null,
      capital: c.legalCapital || null,
      registryNumber: c.registryNumber || null,
      registryCity: c.registryCity || null,
    },
    employee: {
      name: s.employee.name,
      nationalId: s.employee.nationalId ?? null,
      jobTitle: s.employee.jobTitle!,
      hireDate: day(s.employee.hireDate!),
      endDate: s.employee.isActive ? null : day(s.endDate!),
      contractType: contract(s.employee.contractType),
      // Only a current employee can be "not resigning", and only if the issuer confirmed it.
      notResigning: s.employee.isActive && !!extra.notResigning,
    },
    recipient: extra.recipient?.name ? { name: extra.recipient.name, address: extra.recipient.address || null } : null,
    purpose,
  };
}

export const frDate = (iso: string) => new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso.slice(0, 10)}T12:00:00Z`));

const CONTRACT_TEXT: Record<ContractType, string | null> = {
  CDI: "d'un contrat à durée indéterminée (CDI)",
  CDD: "d'un contrat à durée déterminée (CDD)",
  SIVP: "d'un contrat SIVP (stage d'initiation à la vie professionnelle)",
  OTHER: null,
};

/** The text of the certificate, in French, laid out like a standard model. */
export function certificateText(s: CertificateSnapshot) {
  const e = s.employee;
  const c = s.company;
  const id = e.nationalId ? `, titulaire de la carte d'identité nationale n° ${e.nationalId}` : "";
  const capital = c.capital ? ` au capital de ${c.capital}` : "";
  const registry = c.registryNumber ? `, immatriculée ${c.registryCity ? `au registre du commerce de ${c.registryCity}` : "au Registre National des Entreprises"} sous le numéro ${c.registryNumber}` : "";
  const tax = c.taxId ? `, matricule fiscal ${c.taxId}` : "";
  const ct = e.contractType ? CONTRACT_TEXT[e.contractType] : null;
  const contractClause = ct ? ` au titre ${ct}` : "";
  const intro = `Je, soussigné(e) ${c.repName}, agissant en qualité de ${c.repTitle} de la société ${c.legalName}${capital}, dont le siège social est situé ${c.address}${registry}${tax}, atteste et certifie par la présente que ${e.name}${id} :`;
  const bullets = e.endDate
    ? [`a été salarié(e) de la société du ${frDate(e.hireDate)} au ${frDate(e.endDate)}${contractClause} ;`, `y a exercé les fonctions de ${e.jobTitle}.`]
    : [
        `est salarié(e) de la société depuis le ${frDate(e.hireDate)}${contractClause}${e.notResigning ? " et n'est ni démissionnaire, ni en procédure de licenciement" : ""} ;`,
        `exerce actuellement les fonctions de ${e.jobTitle}.`,
      ];
  return {
    subject: `Objet : Attestation de travail / ${e.name}`,
    intro,
    bullets,
    closing: `Cette attestation est délivrée à la demande du salarié pour servir et valoir ce que de droit${s.purpose ? ` (${s.purpose})` : ""}.`,
    madeAt: `Fait à ${c.city}, le ${frDate(s.issuedAt)}`,
  };
}

/** Plain paragraphs (kept for tests and simple displays). */
export function certificateParagraphs(s: CertificateSnapshot): string[] {
  const t = certificateText(s);
  return [t.intro, ...t.bullets.map((b) => `- ${b}`), t.closing, `${t.madeAt}.`];
}
