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
  viewClientInvoices: ["ADMIN", "MANAGER", "RECEPTION"],
  createInvoice: ["ADMIN"],
  recordPayment: ["ADMIN", "MANAGER", "RECEPTION"],
  sendReminder: ["ADMIN", "MANAGER", "RECEPTION"],
  viewFinance: ["ADMIN", "MANAGER", "RECEPTION"],
  uploadMedia: ["ADMIN", "MANAGER", "RECEPTION", "MECHANIC"],
  manageTracking: ["ADMIN", "MANAGER", "RECEPTION"],
  /// Plans d'entretien des véhicules (rappels vidange, filtres…).
  manageMaintenance: ["ADMIN", "MANAGER", "RECEPTION"],
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
  /// Comptes du portail entreprise d'un client.
  manageCompanyAccess: ["ADMIN", "MANAGER"],

  // Espace fournisseur
  viewStock: ["ADMIN", "MANAGER", "RECEPTION", "MECHANIC", "STOREKEEPER"],
  manageStock: ["ADMIN", "STOREKEEPER"],
  /// Réserver une pièce pour une réparation / libérer la réservation.
  reserveStock: ["ADMIN", "MANAGER", "RECEPTION", "STOREKEEPER"],
  viewSuppliers: ["ADMIN", "MANAGER", "STOREKEEPER"],
  manageSuppliers: ["ADMIN", "STOREKEEPER"],
  requestPurchase: ["ADMIN", "MANAGER", "STOREKEEPER"],
  approvePurchase: ["ADMIN"],
  receiveGoods: ["ADMIN", "STOREKEEPER"],
  viewSupplierInvoices: ["ADMIN", "STOREKEEPER"],
  manageSupplierInvoices: ["ADMIN", "STOREKEEPER"],
  paySupplier: ["ADMIN"],

  // Équipe
  /// Pointer, demander un congé, voir ses heures : tout le personnel.
  useTimeClock: ["ADMIN", "MANAGER", "RECEPTION", "MECHANIC", "STOREKEEPER"],
  /// Voir la présence de l'équipe, corriger un pointage, valider les congés, rapports par employé.
  manageTeam: ["ADMIN", "MANAGER"],
  /// Afficher la borne de pointage (écran du garage).
  showClockKiosk: ["ADMIN", "MANAGER"],
  /// Délivrer une attestation de travail.
  issueCertificates: ["ADMIN", "MANAGER"],

  // Administration
  manageSettings: ["ADMIN"],
  viewReports: ["ADMIN"],
  /// Rentabilité (coûts, main-d'œuvre, marges) : données sensibles, administrateur seulement.
  viewProfit: ["ADMIN"],
  /// Saisir / annuler une dépense directe sur une réparation.
  manageExpenses: ["ADMIN", "MANAGER"],
  viewAuditLog: ["ADMIN"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof MATRIX;

export function can(role: Role | null | undefined, permission: Permission): boolean {
  return !!role && (MATRIX[permission] as readonly Role[]).includes(role);
}

export function rolesFor(permission: Permission): Role[] {
  return [...MATRIX[permission]];
}
