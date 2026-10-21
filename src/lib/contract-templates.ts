import { LEGAL_VERIFIED_DAY, templateId, type ContractCategory, type TemplateClause, type TemplateField } from "@/lib/contracts";

/**
 * Catalogue of contract templates (V9.0). Copied into the database (ContractTemplate) the first
 * time the contracts are used, with a deterministic id: the copy in the database is what is
 * printed and what an administrator marks as reviewed. Changing a text here means a NEW version
 * (version + 1), which starts again as "to be validated by a lawyer".
 *
 * Legal references: ONLY the ones verified on 21/10/2026 (docs/PLAN-CONTRATS-SHOWROOM.md §2).
 * Nothing here is invented: no amount (minimum wage, hours, leave) is suggested — they are
 * required inputs of the garage. Contract texts are in French (document language).
 */

export type LegalConfidence = "OFFICIAL" | "OFFICIAL_PARTIAL" | "SECONDARY";
export type LegalRef = { ref: string; subject: string; confidence: LegalConfidence };

export const LEGAL: Record<string, LegalRef> = {
  priceTtc: { ref: "Loi n° 2015-36, art. 29", subject: "Prix des services affichés TTC en dinars ; facture remise sur demande", confidence: "OFFICIAL" },
  warranty: { ref: "Loi n° 92-117, art. 17-18", subject: "Toute clause excluant la garantie est nulle (règles du COC)", confidence: "OFFICIAL_PARTIAL" },
  esign: { ref: "Loi n° 2000-83", subject: "Signature électronique : certificat d'un prestataire agréé ANCE — ici, signature manuscrite uniquement", confidence: "OFFICIAL" },
  personalData: { ref: "Loi organique n° 2004-63", subject: "Protection des données personnelles (déclaration INPDP à faire par le garage)", confidence: "SECONDARY" },
  cdi: { ref: "Loi n° 2025-9 du 21/05/2025 (JORT n° 61 du 23/05/2025), C. trav. art. 6-2", subject: "Le contrat de travail est à durée indéterminée par défaut", confidence: "OFFICIAL" },
  probation: { ref: "C. trav. art. 6-3 (loi n° 2025-9)", subject: "Période d'essai : 6 mois au plus, renouvelable une fois ; fin notifiée par écrit 15 jours avant", confidence: "OFFICIAL" },
  cdd: { ref: "C. trav. art. 6-4 (loi n° 2025-9)", subject: "CDD seulement pour surcroît anormal de travail, remplacement temporaire d'un permanent, travail saisonnier / usage ; écrit obligatoire, sinon CDI ; pas de période d'essai", confidence: "OFFICIAL" },
  cddEnd: { ref: "C. trav. art. 17", subject: "Poursuite du travail après le terme du CDD : le contrat devient à durée indéterminée", confidence: "OFFICIAL" },
  subcontracting: { ref: "C. trav. art. 28-30", subject: "Sous-traitance de main-d'œuvre interdite ; prestation seulement pour une expertise spécialisée, hors activité principale, sans subordination", confidence: "OFFICIAL" },
};

/** Points the research could NOT verify: printed with the template, to check with a Tunisian lawyer. */
export const UNVERIFIED = {
  quote: "Devis obligatoire avant travaux : aucune règle générale trouvée",
  warrantyText: "Loi n° 92-117, art. 16-18 : version propre du texte à vérifier",
  dataLaw: "Loi organique n° 2004-63 : texte officiel non consulté",
  collective: "Convention collective applicable aux garages : aucune trouvée",
  decrees: "Décrets d'application de la loi n° 2025-9",
  sanctions: "Art. 234 ter (sanctions) : non vérifié",
  amounts: "Salaire, durée du travail et congés : montants à saisir par le garage, non fournis par l'application",
  subcontractingCase: "Application des art. 28-30 à ce prestataire précis",
  freeText: "Contenu libre : entièrement à faire relire",
};

export type TemplateDef = {
  code: string;
  version: number;
  category: ContractCategory;
  subtype: string | null;
  /** French title printed on the contract. */
  title: string;
  legalRefs: LegalRef[];
  unverified: string[];
  fields: TemplateField[];
  clauses: TemplateClause[];
};

// ── Shared fields / clauses ──────────────────────────────────────────────────

const YES_NO = ["YES", "NO"] as const;

const C_SIGNATURE: TemplateClause = {
  key: "signature",
  title: "Signature",
  body: "Le présent contrat est établi en deux exemplaires originaux, signés à la main et revêtus du cachet du Garage. Aucune signature électronique n'est utilisée.",
  required: true,
};
const C_NO_AUTO_RENEWAL: TemplateClause = {
  key: "noRenewal",
  title: "Renouvellement",
  body: "Le présent contrat n'est jamais renouvelé automatiquement : tout renouvellement fait l'objet d'un nouveau contrat écrit.",
  required: true,
};
const C_DATA: TemplateClause = {
  key: "personalData",
  title: "Données personnelles",
  body: "Les données personnelles recueillies sont utilisées uniquement pour l'exécution du présent contrat et conservées de manière confidentielle.",
  required: false,
};

// ── Repair (from a work order) ───────────────────────────────────────────────

const REPAIR: TemplateDef = {
  code: "REPAIR",
  version: 1,
  category: "REPAIR",
  subtype: null,
  title: "Contrat de réparation automobile",
  legalRefs: [LEGAL.priceTtc!, LEGAL.warranty!, LEGAL.esign!, LEGAL.personalData!],
  unverified: [UNVERIFIED.quote, UNVERIFIED.warrantyText, UNVERIFIED.dataLaw],
  fields: [
    { key: "authorizationToStart", type: "select", required: true, options: YES_NO },
    {
      key: "extraWorkProcedure",
      type: "textarea",
      required: true,
      default:
        "Tout travail supplémentaire non prévu au devis fait l'objet d'un devis complémentaire soumis à l'accord préalable du Client (écrit, SMS ou portail de suivi) avant toute exécution. Sans accord, seuls les travaux acceptés sont réalisés.",
    },
    { key: "deposit", type: "money", required: false },
    { key: "expectedDate", type: "date", required: false },
    { key: "warrantyTerms", type: "textarea", required: true },
    {
      key: "handover",
      type: "textarea",
      required: true,
      default:
        "Le véhicule est restitué au Client (ou à la personne qu'il désigne par écrit) après paiement du solde. À la remise, le Client vérifie les travaux et peut formuler ses réserves par écrit.",
    },
    { key: "specialConditions", type: "textarea", required: false },
  ],
  clauses: [
    { key: "object", title: "Objet", body: "Le Client confie au Garage le véhicule désigné ci-dessus pour les travaux décrits au présent contrat. Réclamation du Client : {{complaint}}.", required: true },
    {
      key: "prices",
      title: "Prix",
      body: "Les prix des travaux et des pièces sont exprimés toutes taxes comprises (TTC), en dinars tunisiens, selon le détail ci-dessus. Montant total TTC : {{totalTtc}}. Une facture est remise au Client.",
      required: true,
    },
    { key: "approval", title: "Accord avant travaux", body: "Devis : {{quoteApproval}}. Autorisation donnée par le Client de commencer les travaux : {{authorizationToStart}}.", required: true },
    { key: "extraWork", title: "Travaux supplémentaires", body: "{{extraWorkProcedure}}", required: true },
    { key: "payment", title: "Acompte et solde", body: "Acompte versé : {{deposit}}. Le solde est payable à la remise du véhicule. Situation de la facture : {{invoiceSituation}}.", required: true },
    { key: "delay", title: "Délai", body: "Date prévue de restitution : {{expectedDate}}. Ce délai est indicatif ; le Client est prévenu de tout retard.", required: false },
    {
      key: "warranty",
      title: "Garantie",
      body: "{{warrantyTerms}} Aucune clause du présent contrat ne peut exclure ou limiter la garantie due au Client en application de la loi.",
      required: true,
    },
    { key: "handover", title: "Remise du véhicule", body: "{{handover}}", required: true },
    { key: "special", title: "Conditions particulières", body: "{{specialConditions}}", required: false },
    C_DATA,
    C_SIGNATURE,
  ],
};

// ── Fleet / business customer ───────────────────────────────────────────────

const FLEET: TemplateDef = {
  code: "FLEET",
  version: 1,
  category: "FLEET",
  subtype: null,
  title: "Contrat d'entretien et de réparation de flotte",
  legalRefs: [LEGAL.priceTtc!, LEGAL.warranty!, LEGAL.esign!, LEGAL.personalData!],
  unverified: [UNVERIFIED.quote, UNVERIFIED.warrantyText, UNVERIFIED.dataLaw],
  fields: [
    { key: "object", type: "textarea", required: true, default: "Entretien et réparation des véhicules de l'Entreprise listés ci-dessus." },
    { key: "agreedConditions", type: "textarea", required: true },
    { key: "discountPercent", type: "number", required: false, min: 0, max: 100 },
    { key: "billingFrequency", type: "select", required: true, options: ["PER_REPAIR", "MONTHLY"] },
    { key: "paymentTerms", type: "textarea", required: true },
    { key: "warrantyTerms", type: "textarea", required: true },
    { key: "noticeDays", type: "number", required: false, min: 0, max: 365 },
    { key: "contactPerson", type: "text", required: false },
    { key: "specialConditions", type: "textarea", required: false },
  ],
  clauses: [
    { key: "object", title: "Objet", body: "{{object}}", required: true },
    { key: "vehicles", title: "Véhicules concernés", body: "{{vehicleList}}", required: true },
    { key: "conditions", title: "Conditions convenues", body: "{{agreedConditions}}", required: true },
    {
      key: "prices",
      title: "Prix",
      body: "Chaque intervention fait l'objet d'un devis détaillé ; les prix sont exprimés toutes taxes comprises (TTC), en dinars tunisiens. Remise convenue : {{discountPercent}} %.",
      required: true,
    },
    { key: "billing", title: "Facturation et paiement", body: "Facturation : {{billingFrequency}}. Conditions de paiement : {{paymentTerms}}", required: true },
    { key: "duration", title: "Durée", body: "Le contrat prend effet le {{startDate}}{{endText}}.", required: true },
    C_NO_AUTO_RENEWAL,
    { key: "warranty", title: "Garantie", body: "{{warrantyTerms}} Aucune clause ne peut exclure la garantie légale.", required: true },
    { key: "termination", title: "Résiliation", body: "Chaque partie peut mettre fin au contrat par écrit, avec un préavis de {{noticeDays}} jours.", required: false },
    { key: "contact", title: "Interlocuteur de l'Entreprise", body: "{{contactPerson}}", required: false },
    { key: "special", title: "Conditions particulières", body: "{{specialConditions}}", required: false },
    C_DATA,
    C_SIGNATURE,
  ],
};

// ── Blank ───────────────────────────────────────────────────────────────────

const BLANK: TemplateDef = {
  code: "BLANK",
  version: 1,
  category: "BLANK",
  subtype: null,
  title: "Contrat",
  legalRefs: [LEGAL.esign!],
  unverified: [UNVERIFIED.freeText],
  fields: [
    { key: "partyName", type: "text", required: false },
    { key: "partyAddress", type: "textarea", required: false },
    { key: "object", type: "textarea", required: true },
    { key: "body", type: "textarea", required: true },
  ],
  clauses: [
    { key: "object", title: "Objet", body: "{{object}}", required: true },
    { key: "body", title: "Stipulations", body: "{{body}}", required: true },
    { key: "duration", title: "Durée", body: "Le contrat prend effet le {{startDate}}{{endText}}.", required: true },
    C_NO_AUTO_RENEWAL,
    C_SIGNATURE,
  ],
};

export const TEMPLATE_DEFS: TemplateDef[] = [REPAIR, FLEET, BLANK];

export const templateDefById = (id: string) => TEMPLATE_DEFS.find((t) => templateId(t.code, t.version) === id) ?? null;

/** Rows to copy into ContractTemplate (created once, never overwritten: the review stays). */
export function templateRows() {
  return TEMPLATE_DEFS.map((t) => ({
    id: templateId(t.code, t.version),
    code: t.code,
    version: t.version,
    category: t.category,
    subtype: t.subtype,
    title: t.title,
    jurisdiction: "TN",
    legalRefs: t.legalRefs,
    unverified: t.unverified,
    verifiedAt: new Date(`${LEGAL_VERIFIED_DAY}T00:00:00Z`),
    fields: t.fields,
    clauses: t.clauses,
  }));
}

/** French labels of the select values, printed in the contract. */
export const OPTION_LABELS_FR: Record<string, string> = {
  YES: "Oui",
  NO: "Non",
  PER_REPAIR: "à chaque intervention",
  MONTHLY: "facture mensuelle récapitulative",
};
