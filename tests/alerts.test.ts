import { describe, expect, it } from "vitest";
import { ALERT_DEFAULTS, alertCutoffs } from "@/lib/alerts";

const now = new Date("2026-10-21T12:00:00Z");
const hoursBefore = (d: Date) => (now.getTime() - d.getTime()) / 3_600_000;

describe("seuils d'alerte (Suivi & retards)", () => {
  it("par défaut : comme avant la V7.1 (0 h, 0 j, assurance 3 j)", () => {
    const c = alertCutoffs(null, now);
    expect(c.values).toEqual(ALERT_DEFAULTS);
    expect(c.order).toEqual(now);
    expect(c.part).toEqual(now);
    expect(hoursBefore(c.insurance)).toBe(72);
  });
  it("utilise les valeurs des Paramètres", () => {
    const c = alertCutoffs({ alertOrderLateHours: 4, alertPartLateDays: 2, alertInsuranceDays: 7 }, now);
    expect(hoursBefore(c.order)).toBe(4);
    expect(hoursBefore(c.part)).toBe(48);
    expect(hoursBefore(c.insurance)).toBe(168);
  });
  it("une livraison promise il y a 3 h n'est pas en retard avec 4 h de tolérance, elle l'est avec 2 h", () => {
    const promised = new Date(now.getTime() - 3 * 3_600_000);
    expect(promised < alertCutoffs({ alertOrderLateHours: 4 }, now).order).toBe(false);
    expect(promised < alertCutoffs({ alertOrderLateHours: 2 }, now).order).toBe(true);
  });
  it("valeurs hors limites ramenées dans les bornes (base modifiée à la main)", () => {
    const c = alertCutoffs({ alertOrderLateHours: -5, alertPartLateDays: 999, alertInsuranceDays: 0 }, now);
    expect(c.values).toEqual({ alertOrderLateHours: 0, alertPartLateDays: 60, alertInsuranceDays: 1 });
  });
});
