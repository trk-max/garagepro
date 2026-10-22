/**
 * V16 Lot 4 — signed intake and vehicle handover: pure rules (no database, no Node API), safe for client
 * components. Unit-tested in tests/lot4-v16.test.ts.
 */

/** Dashboard warning lights ticked at check-in (printed in French on the frozen intake document). */
export const WARNING_LIGHTS = ["ENGINE", "OIL", "BATTERY", "BRAKES", "ABS", "AIRBAG", "TEMPERATURE", "TIRE_PRESSURE", "ESP", "GLOW_PLUG", "SERVICE", "OTHER"] as const;
export type WarningLight = (typeof WARNING_LIGHTS)[number];
export const WARNING_LIGHT_FR: Record<WarningLight, string> = {
  ENGINE: "Moteur / dépollution",
  OIL: "Pression d'huile",
  BATTERY: "Batterie / charge",
  BRAKES: "Freinage",
  ABS: "ABS",
  AIRBAG: "Airbag",
  TEMPERATURE: "Température moteur",
  TIRE_PRESSURE: "Pression des pneus",
  ESP: "ESP / antipatinage",
  GLOW_PLUG: "Préchauffage",
  SERVICE: "Entretien / révision",
  OTHER: "Autre voyant",
};

/** Keeps the known codes only, once each, in the reference order. */
export function cleanWarningLights(values: unknown[]): WarningLight[] {
  const wanted = new Set(values.filter((v): v is string => typeof v === "string"));
  return WARNING_LIGHTS.filter((w) => wanted.has(w));
}

/** Read from the database JSON (anything unexpected is ignored). */
export const readWarningLights = (value: unknown): WarningLight[] => (Array.isArray(value) ? cleanWarningLights(value) : []);

/** What happens to the replaced parts at delivery. */
export const OLD_PARTS = ["RETURNED", "LEFT", "WARRANTY", "NONE"] as const;
export type OldParts = (typeof OLD_PARTS)[number];
export const OLD_PARTS_FR: Record<OldParts, string> = {
  RETURNED: "Pièces remplacées rendues au client",
  LEFT: "Pièces remplacées laissées au garage",
  WARRANTY: "Pièces remplacées gardées pour la garantie",
  NONE: "Aucune pièce remplacée",
};

export type HandoverChecklist = { workExplained: boolean; oldParts: OldParts; keysReturned: boolean; clean: boolean };

export function readChecklist(value: unknown): HandoverChecklist {
  const v = (value ?? {}) as Partial<Record<keyof HandoverChecklist, unknown>>;
  return {
    workExplained: v.workExplained === true,
    oldParts: (OLD_PARTS as readonly unknown[]).includes(v.oldParts) ? (v.oldParts as OldParts) : "NONE",
    keysReturned: v.keysReturned === true,
    clean: v.clean === true,
  };
}

/**
 * Mileage typed lower than the last one known for the vehicle (odometer replaced, typing error…): never written
 * over the vehicle's mileage without an explicit confirmation.
 */
export function mileageLowerThanKnown(typed: number | null | undefined, known: number | null | undefined): boolean {
  return typed !== null && typed !== undefined && known !== null && known !== undefined && typed < known;
}

/** Signature image limits: the browser draws on a small canvas and sends a PNG far below Vercel's 4.5 MB. */
export const SIGNATURE_MAX_BYTES = 300 * 1024;
export const SIGNATURE_WIDTH = 600;
export const SIGNATURE_HEIGHT = 220;
export const SIGNER_NAME_MIN = 2;

/**
 * Authorization ceiling signed at reception: work may start without a quote while the order's total TTC stays
 * under it — only once the intake is SIGNED (an unsigned ceiling proves nothing).
 */
export function withinCeiling(input: { ceiling: number | null | undefined; intakeSigned: boolean; totalTtc: number }): boolean {
  return input.intakeSigned && !!input.ceiling && input.ceiling > 0 && input.totalTtc > 0 && input.totalTtc <= input.ceiling;
}
