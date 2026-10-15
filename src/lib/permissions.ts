import type { Role } from "@prisma/client";

/**
 * Single source of truth for who can do what. Used by the menu, the pages
 * (what is shown) and the Server Actions (what is allowed).
 */
const MATRIX = {
  // Espace client
  viewWorkOrders: ["ADMIN", "RECEPTION", "MECHANIC"],
  viewCustomers: ["ADMIN", "RECEPTION", "MECHANIC"],
  printQuote: ["ADMIN", "RECEPTION", "MECHANIC"],
  viewClientInvoices: ["ADMIN", "RECEPTION"],
  createInvoice: ["ADMIN"],
  recordPayment: ["ADMIN", "RECEPTION"],
  sendReminder: ["ADMIN", "RECEPTION"],
  viewFinance: ["ADMIN", "RECEPTION"],
  uploadMedia: ["ADMIN", "RECEPTION", "MECHANIC"],
  manageTracking: ["ADMIN", "RECEPTION"],
  viewAppointments: ["ADMIN", "RECEPTION", "MECHANIC"],
  manageAppointments: ["ADMIN", "RECEPTION"],
  useWorkshop: ["ADMIN", "RECEPTION", "MECHANIC"],
  manageClaims: ["ADMIN", "RECEPTION"],

  // Espace fournisseur
  viewStock: ["ADMIN", "RECEPTION", "MECHANIC", "STOREKEEPER"],
  manageStock: ["ADMIN", "STOREKEEPER"],
  viewSuppliers: ["ADMIN", "STOREKEEPER"],
  manageSuppliers: ["ADMIN", "STOREKEEPER"],
  requestPurchase: ["ADMIN", "STOREKEEPER"],
  approvePurchase: ["ADMIN"],
  receiveGoods: ["ADMIN", "STOREKEEPER"],
  viewSupplierInvoices: ["ADMIN", "STOREKEEPER"],
  manageSupplierInvoices: ["ADMIN", "STOREKEEPER"],
  paySupplier: ["ADMIN"],

  // Administration
  manageSettings: ["ADMIN"],
  viewReports: ["ADMIN"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof MATRIX;

export function can(role: Role | null | undefined, permission: Permission): boolean {
  return !!role && (MATRIX[permission] as readonly Role[]).includes(role);
}

export function rolesFor(permission: Permission): Role[] {
  return [...MATRIX[permission]];
}
