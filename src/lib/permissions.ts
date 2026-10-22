import type { Role } from "@prisma/client";

/**
 * Single source of truth for who can do what. Used by the menu, the pages
 * (what is shown) and the Server Actions (what is allowed).
 */
const MATRIX = {
  // Espace client
  viewWorkOrders: ["ADMIN", "MANAGER", "RECEPTION", "MECHANIC"],
  viewCustomers: ["ADMIN", "MANAGER", "RECEPTION", "MECHANIC"],
  printQuote: ["ADMIN", "MANAGER", "RECEPTION", "MECHANIC"],
  viewClientInvoices: ["ADMIN", "MANAGER", "RECEPTION", "ACCOUNTANT"],
  /// V16 : la réception et le chef d’atelier facturent aussi (livraison seulement avec facture soldée).
  createInvoice: ["ADMIN", "MANAGER", "RECEPTION"],
  recordPayment: ["ADMIN", "MANAGER", "RECEPTION"],
  sendReminder: ["ADMIN", "MANAGER", "RECEPTION"],
  viewFinance: ["ADMIN", "MANAGER", "RECEPTION", "ACCOUNTANT"],
  uploadMedia: ["ADMIN", "MANAGER", "RECEPTION", "MECHANIC"],
  manageTracking: ["ADMIN", "MANAGER", "RECEPTION"],
  /// Plans d'entretien des véhicules (rappels vidange, filtres…).
  manageMaintenance: ["ADMIN", "MANAGER", "RECEPTION"],
  /// V12 — agenda des prochaines réparations : voir les prévisions (le mécanicien en lecture seule).
  viewAgenda: ["ADMIN", "MANAGER", "RECEPTION", "MECHANIC"],
  /// V12 — valider / ignorer une prévision, préparer et envoyer le message au client, ajouter au devis.
  manageAgenda: ["ADMIN", "MANAGER", "RECEPTION"],
  /// V12 — régler le catalogue des éléments d’entretien, les seuils et l’envoi automatique.
  configureAgenda: ["ADMIN", "MANAGER"],
  /// Diagnostic OBD-II (lecture des codes défauts, jamais d'effacement).
  obdDiagnose: ["ADMIN", "MANAGER", "RECEPTION", "MECHANIC"],
  /// Historique des rappels envoyés aux clients.
  viewNotifications: ["ADMIN", "MANAGER"],
  /// Créer, imprimer, renouveler ou révoquer le QR Code d'un véhicule.
  manageVehicleQr: ["ADMIN", "MANAGER", "RECEPTION"],
  viewAppointments: ["ADMIN", "MANAGER", "RECEPTION", "MECHANIC"],
  manageAppointments: ["ADMIN", "MANAGER", "RECEPTION"],
  useWorkshop: ["ADMIN", "MANAGER", "RECEPTION", "MECHANIC"],
  manageClaims: ["ADMIN", "MANAGER", "RECEPTION"],
  /// Dossier assurance, pièces manquantes, retards.
  manageRepairFollowUp: ["ADMIN", "MANAGER", "RECEPTION"],
  /// Déclarer une pièce manquante (le mécanicien qui la constate aussi).
  reportMissingPart: ["ADMIN", "MANAGER", "RECEPTION", "MECHANIC", "STOREKEEPER"],
  /// Chronométrer son propre temps sur une réparation.
  logOwnLabor: ["ADMIN", "MANAGER", "RECEPTION", "MECHANIC"],
  /// Saisir / corriger le temps des autres.
  manageLabor: ["ADMIN", "MANAGER"],
  /// Remplir la checklist de contrôle qualité.
  fillQualityCheck: ["ADMIN", "MANAGER", "RECEPTION", "MECHANIC"],
  /// Validation finale du contrôle qualité (débloque « Prêt »).
  approveQualityCheck: ["ADMIN", "MANAGER"],
  // ── Parcours atelier (V16) : une permission par décision, réglable par employé ──
  /// Devis : envoyer, attente client, refus (motif), accord enregistré (passage en travaux), devis complémentaire.
  manageQuotes: ["ADMIN", "MANAGER", "RECEPTION"],
  /// V16 Lot 2 — enregistrer l'accord du client (téléphone, sur place, SMS, e-mail, WhatsApp) ligne par ligne. Jamais le mécanicien par défaut.
  recordQuoteApproval: ["ADMIN", "MANAGER", "RECEPTION"],
  /// V16 Lot 3 — confirmer la décharge de sécurité signée (ligne « Sécurité » refusée) avant « Prêt ».
  recordSafetyWaiver: ["ADMIN", "MANAGER", "RECEPTION"],
  /// V16 Lot 3 — mettre à jour une pièce manquante (statut, fournisseur, date prévue motivée) : le magasinier aussi (audit n° 14).
  managePartNeeds: ["ADMIN", "MANAGER", "RECEPTION", "STOREKEEPER"],
  /// Annuler un ordre de réparation (motif obligatoire ; pièces remises en stock).
  cancelWorkOrder: ["ADMIN", "MANAGER"],
  /// Livrer le véhicule (Prêt → Livré).
  deliverWorkOrder: ["ADMIN", "MANAGER", "RECEPTION"],
  /// Livrer malgré une facture absente ou un solde dû (dérogation, motif obligatoire, journalisée).
  deliverWithBalance: ["ADMIN", "MANAGER"],
  /// Clôturer un ordre livré dont la facture est soldée (sinon automatique au paiement).
  closeWorkOrder: ["ADMIN", "MANAGER", "RECEPTION"],
  /// Comptes du portail entreprise d'un client.
  manageCompanyAccess: ["ADMIN", "MANAGER"],

  // Espace fournisseur
  viewStock: ["ADMIN", "MANAGER", "RECEPTION", "MECHANIC", "STOREKEEPER"],
  manageStock: ["ADMIN", "STOREKEEPER"],
  /// Réserver une pièce pour une réparation / libérer la réservation.
  reserveStock: ["ADMIN", "MANAGER", "RECEPTION", "STOREKEEPER"],
  viewSuppliers: ["ADMIN", "MANAGER", "STOREKEEPER", "ACCOUNTANT"],
  manageSuppliers: ["ADMIN", "STOREKEEPER"],
  requestPurchase: ["ADMIN", "MANAGER", "STOREKEEPER"],
  approvePurchase: ["ADMIN"],
  receiveGoods: ["ADMIN", "STOREKEEPER"],
  viewSupplierInvoices: ["ADMIN", "STOREKEEPER", "ACCOUNTANT"],
  manageSupplierInvoices: ["ADMIN", "STOREKEEPER", "ACCOUNTANT"],
  paySupplier: ["ADMIN"],

  // Équipe
  /// Pointer, demander un congé, voir ses heures : tout le personnel.
  useTimeClock: ["ADMIN", "MANAGER", "RECEPTION", "MECHANIC", "STOREKEEPER", "HR", "ACCOUNTANT"],
  /// Voir la présence de l'équipe, corriger un pointage, valider les congés, rapports par employé.
  manageTeam: ["ADMIN", "MANAGER", "HR"],
  /// Afficher la borne de pointage (écran du garage).
  showClockKiosk: ["ADMIN", "MANAGER", "HR"],
  /// Délivrer une attestation de travail.
  issueCertificates: ["ADMIN", "MANAGER", "HR"],

  // Administration
  manageSettings: ["ADMIN"],
  viewReports: ["ADMIN"],
  /// Rentabilité (coûts, main-d'œuvre, marges) : données sensibles, administrateur seulement.
  viewProfit: ["ADMIN"],
  /// Saisir / annuler une dépense directe sur une réparation ; charges fixes et échéances (page « Dépenses et échéances »).
  manageExpenses: ["ADMIN", "MANAGER"],
  /// Garanties : consulter, ajouter une garantie à une réparation, ouvrir une réclamation (sans montants).
  manageWarranties: ["ADMIN", "MANAGER", "RECEPTION", "MECHANIC"],
  /// Garanties : voir et saisir les montants (coûts, montant réclamé / accepté, remboursements), décider, annuler.
  viewWarrantyMoney: ["ADMIN", "MANAGER"],
  /// Prévision de trésorerie : saisir le solde (caisse + banque). Lecture seule : readCashForecast.
  viewCashForecast: ["ADMIN", "MANAGER"],
  /// Prévision de trésorerie en lecture (page Trésorerie), sans saisie du solde (V9 : comptable).
  readCashForecast: ["ADMIN", "MANAGER", "ACCOUNTANT"],
  /// Contrats (V9) : accès à la page. Ce que chacun voit / fait dépend AUSSI de la catégorie du contrat
  /// (emploi : administrateur + RH seulement) — voir CONTRACT_ACCESS dans src/lib/contracts.ts.
  viewContracts: ["ADMIN", "MANAGER", "RECEPTION", "HR", "ACCOUNTANT"],
  /// Marquer une version de modèle de contrat comme relue par un juriste (jamais automatique).
  reviewContractTemplates: ["ADMIN"],
  viewAuditLog: ["ADMIN"],

  // ── Showroom et messagerie (V9) ──
  /// Voir l'inventaire du showroom (lecture seule pour l'accueil et le responsable d'atelier).
  viewShowroom: ["ADMIN", "MANAGER", "RECEPTION", "SHOWROOM_MANAGER", "SELLER"],
  /// Créer une annonce et gérer SES annonces (photos, prix, statut). Le vendeur ne touche qu'aux siennes.
  createListing: ["ADMIN", "SHOWROOM_MANAGER", "SELLER"],
  /// Gérer TOUTES les annonces (y compris réattribuer le vendeur, archiver celles des autres).
  manageAllListings: ["ADMIN", "SHOWROOM_MANAGER"],
  /// Messagerie acheteurs : le vendeur ne voit que les conversations de ses annonces.
  useShowroomMessages: ["ADMIN", "SHOWROOM_MANAGER", "SELLER"],
  /// Lire et répondre à TOUTES les conversations du showroom.
  readAllShowroomMessages: ["ADMIN", "SHOWROOM_MANAGER"],

  // ── Carte des compétences (V14) ──
  /// Voir les compétences, certificats et objectifs de TOUTE l'équipe (matrice, fiches). Chacun voit
  /// toujours les siens, sans cette permission.
  viewSkills: ["ADMIN", "MANAGER", "HR"],
  /// Décider d'un niveau (avec motif), certificats, objectifs, catalogue et réglages des compétences.
  manageSkills: ["ADMIN", "MANAGER"],
  /// Déroger à la règle « habilitation exigée » lors d'une affectation (motif obligatoire, journalisé).
  overrideSkillBlock: ["ADMIN", "MANAGER"],
  // ── Accueil : file d'attente (V15) ──
  /// Poste d'accueil : file en direct, Suivant / Appeler / Rappeler / Absent / Transférer / Terminer, ticket manuel.
  useReception: ["ADMIN", "MANAGER", "RECEPTION"],
  /// Rapports de l'accueil (attente par motif / heure / jour, heures de pointe, absents) et export CSV.
  viewReceptionReports: ["ADMIN", "MANAGER"],
  /// Motifs, guichets, priorités, seuils, écran de salle, imprimante.
  configureReception: ["ADMIN", "MANAGER"],
  /// Jetons d'appareil de la borne et de l'écran de salle (créer, nommer, révoquer).
  manageReceptionDevices: ["ADMIN"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof MATRIX;

export const PERMISSIONS = Object.keys(MATRIX) as Permission[];

export function isPermission(value: unknown): value is Permission {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(MATRIX, value);
}

/** What the role alone allows (the matrix above, without any per-user override). */
export function roleCan(role: Role | null | undefined, permission: Permission): boolean {
  return !!role && (MATRIX[permission] as readonly Role[]).includes(role);
}

/**
 * V10.3 — per-employee overrides set by an administrator (table UserPermission).
 * Loaded once per request with the signed-in user (src/lib/session.ts getStaff).
 */
export type PermOverrides = { grant: readonly Permission[]; deny: readonly Permission[] };
export type PermEffect = "GRANT" | "DENY";
/** A role alone, or a user (role + optional overrides). */
export type PermSubject = Role | { role: Role; perms?: PermOverrides | null } | null | undefined;

/**
 * Effective rule: DENY override > GRANT override > role matrix.
 * Passing a bare role keeps the historic role-only behaviour.
 */
export function can(subject: PermSubject, permission: Permission): boolean {
  if (!subject) return false;
  if (typeof subject === "string") return roleCan(subject, permission);
  const perms = subject.perms;
  if (perms) {
    if (perms.deny.includes(permission)) return false;
    if (perms.grant.includes(permission)) return true;
  }
  return roleCan(subject.role, permission);
}

/** Builds the overrides from database rows (unknown permission names are ignored). */
export function overridesFrom(rows: readonly { permission: string; effect: string }[] | null | undefined): PermOverrides {
  const grant: Permission[] = [];
  const deny: Permission[] = [];
  for (const r of rows ?? []) {
    if (!isPermission(r.permission)) continue;
    if (r.effect === "DENY") deny.push(r.permission);
    else if (r.effect === "GRANT") grant.push(r.permission);
  }
  return { grant, deny };
}

/** Permissions an administrator may never refuse to themselves (they would lock themselves out). */
export const SELF_PROTECTED: readonly Permission[] = ["manageTeam", "manageSettings"];

export type OverrideChoice = PermEffect | "ROLE";

/**
 * Normalises a requested set of overrides against the role: an override equal to the role
 * default is dropped (it would change nothing), so only real differences are stored.
 */
export function normaliseOverrides(role: Role, wanted: Partial<Record<string, OverrideChoice>>): { permission: Permission; effect: PermEffect }[] {
  const out: { permission: Permission; effect: PermEffect }[] = [];
  for (const permission of PERMISSIONS) {
    const effect = wanted[permission];
    if (effect !== "GRANT" && effect !== "DENY") continue;
    const byRole = roleCan(role, permission);
    if ((effect === "GRANT" && byRole) || (effect === "DENY" && !byRole)) continue;
    out.push({ permission, effect });
  }
  return out;
}

/** Display groups for the "Accès" editor (every permission appears exactly once). */
export const PERMISSION_GROUPS = {
  workshop: ["viewWorkOrders", "useWorkshop", "printQuote", "uploadMedia", "obdDiagnose", "viewAppointments", "manageAppointments", "manageTracking", "manageRepairFollowUp", "reportMissingPart", "logOwnLabor", "manageLabor", "fillQualityCheck", "approveQualityCheck", "manageClaims", "manageWarranties", "manageQuotes", "recordQuoteApproval", "recordSafetyWaiver", "managePartNeeds", "cancelWorkOrder", "deliverWorkOrder", "deliverWithBalance", "closeWorkOrder"],
  customers: ["viewCustomers", "manageMaintenance", "viewAgenda", "manageAgenda", "configureAgenda", "manageVehicleQr", "viewNotifications", "manageCompanyAccess"],
  money: ["viewFinance", "viewClientInvoices", "createInvoice", "recordPayment", "sendReminder", "manageExpenses", "viewWarrantyMoney", "viewCashForecast", "readCashForecast", "viewProfit", "viewReports"],
  stock: ["viewStock", "manageStock", "reserveStock", "viewSuppliers", "manageSuppliers", "requestPurchase", "approvePurchase", "receiveGoods", "viewSupplierInvoices", "manageSupplierInvoices", "paySupplier"],
  team: ["useTimeClock", "manageTeam", "showClockKiosk", "issueCertificates", "viewSkills", "manageSkills", "overrideSkillBlock"],
  contracts: ["viewContracts", "reviewContractTemplates"],
  showroom: ["viewShowroom", "createListing", "manageAllListings", "useShowroomMessages", "readAllShowroomMessages"],
  // V15 — accueil (file d'attente).
  reception: ["useReception", "viewReceptionReports", "configureReception", "manageReceptionDevices"],
  admin: ["manageSettings", "viewAuditLog"],
} as const satisfies Record<string, readonly Permission[]>;
export type PermissionGroup = keyof typeof PERMISSION_GROUPS;

export function rolesFor(permission: Permission): Role[] {
  return [...MATRIX[permission]];
}
