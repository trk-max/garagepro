import { LEGAL_VERIFIED_DAY, templateId, type ContractCategory, type TemplateClause, type TemplateField } from "@/lib/contracts";
import { CDI_V2_CLAUSES, CDI_V2_EXTRA_FIELDS } from "@/lib/contract-templates-cdi";

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
  ownerModel: "Version 2 : structure reprise du modèle de CDI du garage (22 articles) ; formulations adaptées, articles 12-13 du modèle illisibles",
  mobility: "Clause de mobilité, retenue sur le solde de tout compte et remboursement de formation : validité à vérifier",
  noticeAbsence: "Préavis : durée et absences pour recherche d'emploi selon le Code du travail / la convention applicable, à vérifier",
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

// ── Employment (CDI by default — Labour Code as amended by Law 2025-9) ──────

/** Job templates: title and duties are configurable defaults; salary / hours / leave are REQUIRED inputs. */
export const JOBS: { subtype: string; title: string; duties: string }[] = [
  { subtype: "MECHANIC", title: "Mécanicien automobile", duties: "Diagnostic, entretien et réparation mécanique des véhicules confiés au garage, selon les ordres de réparation ; respect des consignes de sécurité et de qualité de l'atelier." },
  { subtype: "BODYWORK_TECHNICIAN", title: "Carrossier", duties: "Réparation et remise en forme des éléments de carrosserie, préparation des surfaces et remplacement d'éléments, selon les ordres de réparation." },
  { subtype: "AUTO_ELECTRICIAN", title: "Électricien automobile", duties: "Diagnostic et réparation des circuits électriques et électroniques des véhicules (charge, démarrage, éclairage, faisceaux, équipements)." },
  { subtype: "DIAGNOSTIC_TECHNICIAN", title: "Technicien diagnostic", duties: "Diagnostic électronique des véhicules (lecture des codes défauts, mesures, essais) et compte rendu au responsable d'atelier." },
  { subtype: "STOREKEEPER", title: "Magasinier", duties: "Réception, rangement et sortie des pièces, tenue du stock, préparation des commandes et inventaires." },
  { subtype: "SECTOR_MANAGER", title: "Responsable de secteur", duties: "Organisation et suivi de l'activité de son secteur, encadrement de l'équipe du secteur, suivi des délais et de la qualité." },
  { subtype: "GARAGE_MANAGER", title: "Directeur de garage", duties: "Direction de l'exploitation du garage : organisation de l'atelier, relation client, suivi commercial et financier, encadrement du personnel." },
  { subtype: "HR_EMPLOYEE", title: "Chargé des ressources humaines", duties: "Gestion administrative du personnel : dossiers, présences et congés, attestations, contrats, relations avec les organismes sociaux." },
  { subtype: "GENERAL_TECHNICIAN", title: "Technicien polyvalent", duties: "Interventions courantes de mécanique, d'électricité et d'entretien, selon les ordres de réparation et ses compétences." },
  { subtype: "SALESPERSON", title: "Vendeur", duties: "Accueil et conseil des clients, présentation des véhicules et des services, établissement des offres et suivi des ventes." },
  { subtype: "SHOWROOM_EMPLOYEE", title: "Employé de showroom", duties: "Accueil des visiteurs du showroom, présentation et mise en valeur des véhicules exposés, tenue de l'espace d'exposition." },
  { subtype: "EMPLOYMENT_BLANK", title: "", duties: "" },
];

/**
 * Version 1 (V9.0) stays in the database for the contracts made with it; version 2 (V10.6) follows
 * the structure of the owner's CDI model and is the one offered for new contracts.
 */
function employmentTemplate(job: (typeof JOBS)[number], version: 1 | 2 = 2): TemplateDef {
  const v1 = employmentTemplateV1(job);
  if (version === 1) return v1;
  return {
    ...v1,
    version: 2,
    unverified: [...v1.unverified, UNVERIFIED.ownerModel, UNVERIFIED.mobility, UNVERIFIED.noticeAbsence],
    fields: [...v1.fields.filter((f) => f.key !== "specialConditions"), ...CDI_V2_EXTRA_FIELDS, v1.fields.find((f) => f.key === "specialConditions")!],
    clauses: [...CDI_V2_CLAUSES, C_DATA, C_SIGNATURE],
  };
}

function employmentTemplateV1(job: (typeof JOBS)[number]): TemplateDef {
  return {
    code: job.subtype === "EMPLOYMENT_BLANK" ? "EMPLOYMENT_BLANK" : `EMPLOYMENT_${job.subtype}`,
    version: 1,
    category: "EMPLOYMENT",
    subtype: job.subtype,
    title: "Contrat de travail",
    legalRefs: [LEGAL.cdi!, LEGAL.probation!, LEGAL.cdd!, LEGAL.cddEnd!, LEGAL.esign!, LEGAL.personalData!],
    unverified: [UNVERIFIED.collective, UNVERIFIED.decrees, UNVERIFIED.sanctions, UNVERIFIED.amounts, UNVERIFIED.dataLaw],
    fields: [
      { key: "employeeName", type: "text", required: true },
      { key: "nationalId", type: "text", required: false },
      { key: "address", type: "textarea", required: false },
      { key: "jobTitle", type: "text", required: true, ...(job.title ? { default: job.title } : {}) },
      { key: "duties", type: "textarea", required: true, ...(job.duties ? { default: job.duties } : {}) },
      { key: "employmentType", type: "select", required: true, options: ["CDI", "CDD"], default: "CDI" },
      { key: "cddReason", type: "select", required: true, options: ["SURCROIT", "REMPLACEMENT", "SAISONNIER"], showIf: { key: "employmentType", equals: "CDD" } },
      { key: "replacedEmployee", type: "text", required: true, showIf: { key: "cddReason", equals: "REMPLACEMENT" } },
      { key: "probationMonths", type: "number", required: false, min: 0, max: 6, showIf: { key: "employmentType", equals: "CDI" } },
      { key: "probationRenewable", type: "select", required: false, options: ["NO", "YES"], showIf: { key: "employmentType", equals: "CDI" } },
      // Never suggested by the application (no minimum wage, no statutory hours or leave invented).
      { key: "salary", type: "money", required: true },
      { key: "workHours", type: "text", required: true },
      { key: "leave", type: "text", required: true },
      { key: "workplace", type: "text", required: true },
      { key: "specialConditions", type: "textarea", required: false },
    ],
    clauses: [
      { key: "hiring", title: "Engagement", body: "{{employerName}} engage {{employeeName}} en qualité de {{jobTitle}}, à compter du {{startDate}}.", required: true },
      { key: "cdi", title: "Durée du contrat", body: "Le présent contrat est conclu pour une durée indéterminée.", required: true, showIf: { key: "employmentType", equals: "CDI" } },
      {
        key: "cdd",
        title: "Durée du contrat",
        body:
          "Le présent contrat est conclu pour une durée déterminée, du {{startDate}} au {{endDate}}, pour le motif suivant : {{cddReason}}{{replacedText}}. Il ne comporte pas de période d'essai. La poursuite du travail après son terme le transforme en contrat à durée indéterminée. Il n'est jamais renouvelé automatiquement.",
        required: true,
        showIf: { key: "employmentType", equals: "CDD" },
      },
      { key: "probation", title: "Période d'essai", body: "Période d'essai : {{probationText}}.", required: true, showIf: { key: "employmentType", equals: "CDI" } },
      { key: "duties", title: "Fonctions", body: "{{duties}}", required: true },
      { key: "workplace", title: "Lieu de travail", body: "{{workplace}}.", required: true },
      { key: "hours", title: "Durée du travail", body: "{{workHours}}.", required: true },
      { key: "salary", title: "Rémunération", body: "Rémunération brute mensuelle : {{salary}}.", required: true },
      { key: "leave", title: "Congés payés", body: "{{leave}}.", required: true },
      {
        key: "obligations",
        title: "Obligations du salarié",
        body: "Le salarié respecte le règlement intérieur, les consignes de sécurité de l'atelier et la confidentialité des informations des clients et du garage.",
        required: false,
      },
      { key: "special", title: "Conditions particulières", body: "{{specialConditions}}", required: false },
      C_DATA,
      C_SIGNATURE,
    ],
  };
}

// ── Suppliers / partners ─────────────────────────────────────────────────────

const PARTNERS: { subtype: string; object: string; service: boolean }[] = [
  { subtype: "PARTS", object: "Fourniture de pièces détachées au Garage, sur commande.", service: false },
  { subtype: "BATTERIES_CHARGING", object: "Fourniture de batteries et/ou d'équipements de recharge, et le cas échéant leur installation.", service: false },
  { subtype: "SPECIALIZED_GARAGE", object: "Travaux confiés à un garage spécialisé, nécessitant une expertise que le Garage ne possède pas.", service: true },
  { subtype: "BODYWORK_PAINT", object: "Travaux de carrosserie et/ou de peinture confiés par le Garage.", service: true },
  { subtype: "SERVICE_PROVIDER", object: "Prestation de services spécialisée confiée par le Garage.", service: true },
  { subtype: "OTHER", object: "", service: true },
];

function supplierTemplate(p: (typeof PARTNERS)[number]): TemplateDef {
  const independence: TemplateClause[] = p.service
    ? [
        {
          key: "independence",
          title: "Indépendance du Prestataire",
          body: "Le Prestataire exécute sa mission en toute indépendance, avec ses propres moyens et son propre personnel, sans lien de subordination avec le Garage. Le présent contrat n'est pas une mise à disposition de main-d'œuvre.",
          required: true,
        },
      ]
    : [];
  return {
    code: `SUPPLIER_${p.subtype}`,
    version: 1,
    category: "SUPPLIER",
    subtype: p.subtype,
    title: p.service ? "Contrat de prestation de services" : "Contrat de fourniture",
    legalRefs: p.service ? [LEGAL.subcontracting!, LEGAL.esign!] : [LEGAL.esign!],
    unverified: p.service ? [UNVERIFIED.subcontractingCase] : [],
    fields: [
      { key: "object", type: "textarea", required: true, ...(p.object ? { default: p.object } : {}) },
      { key: "prices", type: "textarea", required: true },
      { key: "paymentTerms", type: "textarea", required: true },
      { key: "deliveryTerms", type: "textarea", required: false },
      { key: "warrantyTerms", type: "textarea", required: false },
      { key: "noticeDays", type: "number", required: false, min: 0, max: 365 },
      // Disguised employment check (Labour Code art. 28-30): asked for every service-type partner.
      ...(p.service
        ? ([
            { key: "subordination", type: "select", required: true, options: YES_NO },
            { key: "coreActivity", type: "select", required: true, options: YES_NO },
            { key: "specializedExpertise", type: "select", required: true, options: YES_NO },
            { key: "exclusiveFullTime", type: "select", required: true, options: YES_NO },
          ] satisfies TemplateField[])
        : []),
      { key: "specialConditions", type: "textarea", required: false },
    ],
    clauses: [
      { key: "object", title: "Objet", body: "{{object}}", required: true },
      ...independence,
      { key: "prices", title: "Prix", body: "{{prices}}", required: true },
      { key: "payment", title: "Paiement", body: "{{paymentTerms}}", required: true },
      { key: "delivery", title: p.service ? "Délais d'intervention" : "Livraison", body: "{{deliveryTerms}}", required: false },
      { key: "warranty", title: "Garantie", body: "{{warrantyTerms}}", required: false },
      { key: "duration", title: "Durée", body: "Le contrat prend effet le {{startDate}}{{endText}}.", required: true },
      C_NO_AUTO_RENEWAL,
      { key: "termination", title: "Résiliation", body: "Chaque partie peut mettre fin au contrat par écrit, avec un préavis de {{noticeDays}} jours.", required: false },
      { key: "special", title: "Conditions particulières", body: "{{specialConditions}}", required: false },
      C_SIGNATURE,
    ],
  };
}

/** Current catalogue: the version offered for new contracts. */
export const TEMPLATE_DEFS: TemplateDef[] = [REPAIR, FLEET, ...JOBS.map((j) => employmentTemplate(j, 2)), ...PARTNERS.map(supplierTemplate), BLANK];
/** Older versions still copied into the database (contracts made with them keep printing their text). */
export const PREVIOUS_TEMPLATE_DEFS: TemplateDef[] = JOBS.map((j) => employmentTemplate(j, 1));
export const ALL_TEMPLATE_DEFS: TemplateDef[] = [...TEMPLATE_DEFS, ...PREVIOUS_TEMPLATE_DEFS];

export const templateDefById = (id: string) => ALL_TEMPLATE_DEFS.find((t) => templateId(t.code, t.version) === id) ?? null;

/** Rows to copy into ContractTemplate (created once, never overwritten: the review stays). */
export function templateRows() {
  return ALL_TEMPLATE_DEFS.map((t) => ({
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
  CDI: "contrat à durée indéterminée",
  CDD: "contrat à durée déterminée",
  SURCROIT: "surcroît exceptionnel de travail",
  REMPLACEMENT: "remplacement temporaire d'un salarié permanent absent ou suspendu",
  SAISONNIER: "travail saisonnier ou activité pour laquelle l'usage exclut le contrat à durée indéterminée",
};
