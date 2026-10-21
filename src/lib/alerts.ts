/** Alert thresholds of the "Suivi & retards" page, set in Paramètres (Setting.alert*). */
export type AlertSettings = { alertOrderLateHours: number; alertPartLateDays: number; alertInsuranceDays: number };

export const ALERT_DEFAULTS: AlertSettings = { alertOrderLateHours: 0, alertPartLateDays: 0, alertInsuranceDays: 3 };

/** Allowed ranges (form validation and safety clamp when reading the database). */
export const ALERT_LIMITS = {
  alertOrderLateHours: { min: 0, max: 168 },
  alertPartLateDays: { min: 0, max: 60 },
  alertInsuranceDays: { min: 1, max: 60 },
} as const;

const clamp = (v: number, { min, max }: { min: number; max: number }) => (Number.isFinite(v) ? Math.min(max, Math.max(min, Math.trunc(v))) : min);

/**
 * Something is "late" when its date is strictly before the cutoff:
 * promised time + N hours, expected part date + N days, insurance asked + N days.
 */
export function alertCutoffs(s: Partial<AlertSettings> | null | undefined, now = new Date()) {
  const v = { ...ALERT_DEFAULTS, ...s };
  const hours = clamp(v.alertOrderLateHours, ALERT_LIMITS.alertOrderLateHours);
  const partDays = clamp(v.alertPartLateDays, ALERT_LIMITS.alertPartLateDays);
  const insuranceDays = clamp(v.alertInsuranceDays, ALERT_LIMITS.alertInsuranceDays);
  return {
    order: new Date(now.getTime() - hours * 3_600_000),
    part: new Date(now.getTime() - partDays * 86_400_000),
    insurance: new Date(now.getTime() - insuranceDays * 86_400_000),
    values: { alertOrderLateHours: hours, alertPartLateDays: partDays, alertInsuranceDays: insuranceDays },
  };
}
