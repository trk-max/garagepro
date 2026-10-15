/**
 * What the garage must know about a car before opening a work order:
 * plate, make, model, year, fuel, colour, VIN (chassis number) and mileage.
 * Shared by the check-in form (browser) and the server.
 */

/** ISO 3779 VIN: 17 characters, digits and capital letters except I, O and Q. */
export const VIN_PATTERN = "[A-HJ-NPR-Za-hj-npr-z0-9]{17}";
const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;

/** Uppercase, without spaces or dashes ("vf3 2a5fs-9 …" → "VF32A5FS9…"). */
export function normalizeVin(raw: string): string {
  return raw.toUpperCase().replace(/[\s-]/g, "");
}

export function isValidVin(raw: string): boolean {
  return VIN_RE.test(normalizeVin(raw));
}

export const REQUIRED_VEHICLE_INFO = ["vin", "year", "fuel", "color"] as const;
export type VehicleInfoField = (typeof REQUIRED_VEHICLE_INFO)[number];

type VehicleInfo = { vin?: string | null; year?: number | null; fuel?: string | null; color?: string | null };

/** Fields still missing (or invalid, for the VIN) on a vehicle. */
export function missingVehicleInfo(v: VehicleInfo): VehicleInfoField[] {
  return REQUIRED_VEHICLE_INFO.filter((f) => {
    const value = v[f];
    if (f === "vin") return !value || !isValidVin(String(value));
    return value === null || value === undefined || value === "";
  });
}
