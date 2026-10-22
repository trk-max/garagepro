/**
 * Prise en charge / ordre de réparation (V10.6) — pure rules, unit-tested in tests/repair-order.test.ts.
 *
 * The clauses are the owner's own models ("Master Legal Kit", "Ordre de réparation" page, plus the
 * abandonment article of his requirements), editable in Paramètres. They are NOT legally verified:
 * the printed page says "Clauses à faire valider par un juriste (droit tunisien)" until an
 * administrator records that a lawyer validated them (docs/LEGAL-KIT.md lists the risks).
 */

export const FUEL_LEVELS = [1, 2, 3, 4] as const;
export const fuelLabel = (q: number | null | undefined) => (q && q >= 1 && q <= 4 ? `${q}/4` : null);

export const PARTS_ORIGINS = ["ORIGINE", "ADAPTABLE", "OCCASION", "FOURNIES_CLIENT"] as const;
export type PartsOrigin = (typeof PARTS_ORIGINS)[number];
export const isPartsOrigin = (v: unknown): v is PartsOrigin => typeof v === "string" && (PARTS_ORIGINS as readonly string[]).includes(v);
/** Printed (French) labels. */
export const PARTS_ORIGIN_FR: Record<PartsOrigin, string> = {
  ORIGINE: "Pièces d'origine",
  ADAPTABLE: "Pièces adaptables",
  OCCASION: "Pièces d'occasion",
  FOURNIES_CLIENT: "Pièces fournies par le client",
};

/** Optional body checklist at check-in (zones with scratches / dents). */
export const BODY_ZONES = ["FRONT_BUMPER", "REAR_BUMPER", "HOOD", "ROOF", "TRUNK", "LEFT_SIDE", "RIGHT_SIDE", "WINDSHIELD", "MIRRORS", "LIGHTS", "WHEELS"] as const;
export type BodyZone = (typeof BODY_ZONES)[number];
export const BODY_ZONE_FR: Record<BodyZone, string> = {
  FRONT_BUMPER: "Pare-chocs avant",
  REAR_BUMPER: "Pare-chocs arrière",
  HOOD: "Capot",
  ROOF: "Toit",
  TRUNK: "Coffre / hayon",
  LEFT_SIDE: "Côté gauche",
  RIGHT_SIDE: "Côté droit",
  WINDSHIELD: "Pare-brise / vitres",
  MIRRORS: "Rétroviseurs",
  LIGHTS: "Optiques / feux",
  WHEELS: "Jantes / pneus",
};

/** Keeps the known zones only, without duplicates, in the catalogue order. */
export function cleanBodyZones(raw: unknown): BodyZone[] {
  const list = Array.isArray(raw) ? raw : [];
  return BODY_ZONES.filter((z) => list.includes(z));
}

// ── Clauses ──────────────────────────────────────────────────────────────────

export type RepairClause = { title: string; body: string };
export const MAX_CLAUSES = 12;
export const CLAUSE_LIMITS = { title: 120, body: 2000 } as const;

/**
 * Default articles, taken from the owner's kit (page "Ordre de réparation", art. 1-5) and from his
 * requirements (art. 6, abandonment). Amounts and delays are separate settings: {storageFee},
 * {graceHours}, {abandonDays}. Wording kept as provided — to be validated by a Tunisian lawyer.
 */
export const DEFAULT_REPAIR_CLAUSES: readonly RepairClause[] = [
  {
    title: "Autorisation de réparation et essais",
    body: "Le client autorise expressément le garage à effectuer les travaux mentionnés ci-dessus ainsi que les essais sur route jugés nécessaires par le chef d'atelier. Le garage ne répond pas des vices cachés ni des usures préexistantes à la prise en charge du véhicule.",
  },
  {
    title: "Travaux supplémentaires",
    body: "Tout travail additionnel découvert lors du démontage sera notifié au client (téléphone, WhatsApp ou e-mail) et fera l'objet de son accord préalable, verbal ou écrit. En cas d'urgence sécuritaire, le garage se réserve le droit de procéder aux réparations conservatoires.",
  },
  {
    title: "Droit de rétention",
    body: "Conformément aux articles du Code des Obligations et des Contrats (COC) tunisien, le garage bénéficie d'un droit de rétention légal sur le véhicule jusqu'au paiement intégral du montant total de la facture.",
  },
  {
    title: "Frais de gardiennage",
    body: "Après notification de l'achèvement des travaux, une franchise de {graceHours} heures est accordée. Passé ce délai, des frais de gardiennage de {storageFee} par jour seront de plein droit facturés au propriétaire.",
  },
  {
    title: "Effets personnels",
    body: "Le garage décline toute responsabilité quant aux objets de valeur ou documents laissés à l'intérieur du véhicule et non signalés à la réception.",
  },
  {
    title: "Abandon du véhicule",
    body: "Après un préavis resté sans réponse pendant {abandonDays} jours, des procédures légales de vente aux enchères seront engagées aux frais du client.",
  },
];

/** Reads Setting.repairClauses (null / invalid → the defaults). */
export function readRepairClauses(raw: unknown): RepairClause[] {
  if (!Array.isArray(raw)) return DEFAULT_REPAIR_CLAUSES.map((c) => ({ ...c }));
  const out = raw
    .filter((c): c is RepairClause => !!c && typeof c === "object" && typeof (c as RepairClause).title === "string" && typeof (c as RepairClause).body === "string")
    .map((c) => ({ title: c.title, body: c.body }));
  return out.length ? out : DEFAULT_REPAIR_CLAUSES.map((c) => ({ ...c }));
}

/** Form rows → clauses: trimmed, cut to the limits, rows with an empty body dropped (max 12). */
export function cleanRepairClauses(rows: readonly { title?: string; body?: string }[]): RepairClause[] {
  return rows
    .map((r) => ({ title: (r.title ?? "").trim().slice(0, CLAUSE_LIMITS.title), body: (r.body ?? "").trim().slice(0, CLAUSE_LIMITS.body) }))
    .filter((r) => r.body.length > 0)
    .slice(0, MAX_CLAUSES);
}

export const REPAIR_AMOUNT_LIMITS = {
  storageFeePerDay: { min: 0, max: 10_000_000 },
  storageGraceHours: { min: 0, max: 8760 },
  abandonmentDays: { min: 1, max: 3650 },
} as const;

/** "20000" millimes → "20,000 DT" (plain characters: printed as is). */
export function dtPlain(millimes: number): string {
  const abs = Math.abs(Math.round(millimes));
  const int = Math.floor(abs / 1000).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${millimes < 0 ? "-" : ""}${int},${String(abs % 1000).padStart(3, "0")} DT`;
}

export type ClauseAmounts = { storageFeePerDay: number; storageGraceHours: number; abandonmentDays: number };

/** Clause texts with their variables filled (unknown variables are left as typed). */
export function renderRepairClauses(clauses: readonly RepairClause[], a: ClauseAmounts): RepairClause[] {
  const vars: Record<string, string> = {
    storageFee: dtPlain(a.storageFeePerDay),
    graceHours: String(a.storageGraceHours),
    abandonDays: String(a.abandonmentDays),
  };
  const fill = (s: string) => s.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);
  return clauses.map((c) => ({ title: fill(c.title), body: fill(c.body) }));
}

/** True when the texts or the amounts differ: the lawyer's validation must then be recorded again. */
export function repairTermsChanged(before: { clauses: readonly RepairClause[] } & ClauseAmounts, after: { clauses: readonly RepairClause[] } & ClauseAmounts): boolean {
  return (
    JSON.stringify(before.clauses) !== JSON.stringify(after.clauses) ||
    before.storageFeePerDay !== after.storageFeePerDay ||
    before.storageGraceHours !== after.storageGraceHours ||
    before.abandonmentDays !== after.abandonmentDays
  );
}

export const LAWYER_NOTICE = "Clauses à faire valider par un juriste (droit tunisien)";

/**
 * Estimated amount printed on the repair order: the work order lines when there are some
 * (same totals as the quote), else the amount typed at check-in, else nothing (left blank).
 */
export function estimateOf(linesTotalTtc: number | null, typed: number | null | undefined): { amount: number; source: "LINES" | "TYPED" } | null {
  if (linesTotalTtc !== null && linesTotalTtc > 0) return { amount: linesTotalTtc, source: "LINES" };
  if (typed !== null && typed !== undefined && typed > 0) return { amount: typed, source: "TYPED" };
  return null;
}
