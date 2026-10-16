/**
 * Shared rules for the command-line account tools (reset-access, doctor).
 * Plain JS so the scripts run with `node` without a build step.
 */

/** Domain of the demo accounts created by `npm run db:seed` (all with the public password "password123"). */
export const DEMO_DOMAIN = "@garage.tn";

export function isDemoEmail(email) {
  return String(email).trim().toLowerCase().endsWith(DEMO_DOMAIN);
}

/** Active demo accounts, whatever their role (ADMIN, RECEPTION, MECHANIC, STOREKEEPER). */
export function activeDemoAccounts(users) {
  return users.filter((u) => u.isActive && isDemoEmail(u.email));
}

/**
 * Checks the first-admin input. Returns { ok: true, email, password, name } or
 * { ok: false, error } with a message in French for the console.
 */
export function validateNewAdmin({ email, password, name }) {
  const e = String(email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || e.length > 200) return { ok: false, error: "E-mail invalide." };
  if (isDemoEmail(e)) return { ok: false, error: `N'utilisez pas une adresse ${DEMO_DOMAIN} (domaine des comptes de démo) : mettez votre vraie adresse.` };
  const p = String(password ?? "");
  if (p.length < 8 || p.length > 100) return { ok: false, error: "Le mot de passe doit contenir entre 8 et 100 caractères." };
  if (p.toLowerCase() === "password123") return { ok: false, error: "Ce mot de passe est public (comptes de démo) : choisissez-en un autre." };
  const n = String(name ?? "").trim() || e.split("@")[0];
  return { ok: true, email: e, password: p, name: n.slice(0, 120) };
}
