/** V12 — agenda des prochaines réparations : calculs purs (src/lib/agenda.ts). */
import { describe, expect, it } from "vitest";
import {
  agendaDedupeKey,
  cleanReadings,
  computeForecast,
  DAY_MS,
  detectInOrder,
  drivingRhythm,
  forecastSignature,
  garageSignals,
  historyGroup,
  keywordMatches,
  MONTH_DAYS,
  observedIntervals,
  packagePriceTtc,
  quartiles,
  renderAgendaMessage,
  DEFAULT_AGENDA_TEMPLATES,
  type ForecastInput,
  type OdoReading,
  type Replacement,
} from "@/lib/agenda";

const D = (s: string) => new Date(`${s}T12:00:00Z`);
const NOW = D("2026-10-22");
const months = (n: number) => n * MONTH_DAYS * DAY_MS;

describe("médiane et quartiles", () => {
  it("median and quartiles (linear interpolation), not the mean", () => {
    expect(quartiles([])).toBeNull();
    expect(quartiles([10])).toEqual({ n: 1, q1: 10, median: 10, q3: 10 });
    // Mean would be 32 (pulled by 100); the median stays at 15.
    expect(quartiles([10, 20, 15, 100, 15])).toEqual({ n: 5, q1: 15, median: 15, q3: 20 });
    expect(quartiles([1, 2, 3, 4])).toEqual({ n: 4, q1: 1.75, median: 2.5, q3: 3.25 });
  });
});

describe("rythme de conduite", () => {
  it("km per month from real dated readings ≥ 30 days apart", () => {
    const r = drivingRhythm([
      { at: D("2026-01-01"), km: 50_000, source: "ORDER" },
      { at: D("2026-07-02"), km: 56_000, source: "ADAPTER" },
    ]);
    expect(r.kmPerMonth).toBe(Math.round(6000 / (182 / MONTH_DAYS)));
    expect(r.current).toEqual({ at: D("2026-07-02"), km: 56_000 });
  });

  it("unknown with one reading, or readings too close", () => {
    expect(drivingRhythm([{ at: D("2026-01-01"), km: 50_000, source: "ORDER" }])).toMatchObject({ kmPerMonth: null, reason: "notEnough" });
    expect(
      drivingRhythm([
        { at: D("2026-01-01"), km: 50_000, source: "ORDER" },
        { at: D("2026-01-20"), km: 51_000, source: "ORDER" },
      ]),
    ).toMatchObject({ kmPerMonth: null, reason: "tooClose" });
    expect(drivingRhythm([])).toMatchObject({ kmPerMonth: null, current: null });
  });

  it("decreasing km and simulated OBD readings are excluded from the calculation", () => {
    const readings: OdoReading[] = [
      { at: D("2026-01-01"), km: 50_000, source: "ORDER" },
      { at: D("2026-03-01"), km: 999_999, source: "SIMULATED" },
      { at: D("2026-04-01"), km: 40_000, source: "ADAPTER" }, // lower than before: typo / wrong car
      { at: D("2026-07-01"), km: 56_000, source: "ORDER" },
    ];
    const { kept, excluded } = cleanReadings(readings);
    expect(kept.map((r) => r.km)).toEqual([50_000, 56_000]);
    expect(excluded.map((r) => r.reason).sort()).toEqual(["LOWER", "SIMULATED"]);
    const r = drivingRhythm(readings);
    expect(r.excluded).toBe(2);
    expect(r.current?.km).toBe(56_000);
    expect(r.kmPerMonth).toBe(Math.round(6000 / (181 / MONTH_DAYS)));
  });
});

describe("historique du garage", () => {
  const ev = (vehicleId: string, at: string, km: number | null): Replacement => ({ vehicleId, doneAt: D(at), km });

  it("intervals only between two replacements of the same vehicle", () => {
    const iv = observedIntervals([ev("a", "2024-01-01", 10_000), ev("a", "2025-01-01", 40_000), ev("b", "2024-06-01", 20_000), ev("a", "2026-01-01", 70_000)]);
    expect(iv.km).toEqual([30_000, 30_000]);
    expect(iv.months).toHaveLength(2);
  });

  it("uses the most precise group with at least N cases, else falls back", () => {
    const fleet = Array.from({ length: 6 }, (_, i) => ({
      vehicle: { id: `v${i}`, make: "Peugeot", model: "208", fuel: i < 3 ? "DIESEL" : "ESSENCE", year: 2018 },
      events: [ev(`v${i}`, "2023-01-01", 10_000), ev(`v${i}`, "2024-01-01", 10_000 + 28_000 + i * 1000)],
    }));
    // 3 diesel cases < N=5 → falls back to the whole model (6 cases).
    const g = historyGroup({ make: "PEUGEOT", model: "208", fuel: "DIESEL", year: 2019 }, fleet, 5);
    expect(g?.level).toBe("MODEL");
    expect(g?.cases).toBe(6);
    expect(g?.km?.median).toBe(30_500);
    expect(historyGroup({ make: "Peugeot", model: "208" }, fleet, 7)).toBeNull();
    expect(historyGroup({ make: "Renault", model: "Clio" }, fleet, 1)).toBeNull();
  });
});

describe("prévision", () => {
  const base: ForecastInput = {
    now: NOW,
    lastDone: { at: D("2026-01-01"), km: 50_000 },
    rhythm: { kmPerMonth: 1000, current: { at: D("2026-07-01"), km: 56_000 } },
    history: null,
    reference: { intervalKm: 10_000, intervalMonths: null },
    goodCases: 10,
  };

  it("N insufficient → b) the garage's reference interval", () => {
    const r = computeForecast(base);
    expect(r.method).toBe("REFERENCE");
    expect(r.dueKm).toBe(60_000);
    expect([r.dueKmLow, r.dueKmHigh]).toEqual([60_000, 60_000]);
    // km → date with the rhythm: 4 000 km left at 1 000 km/month = 4 months after the last reading.
    expect(r.dueByKmDate!.getTime()).toBeCloseTo(D("2026-07-01").getTime() + months(4), -3);
    expect(r.basis).toBe("KM");
    expect(r.confidence).toBe("MEDIUM");
  });

  it("no history and no reference → c) estimation impossible, with what is missing", () => {
    const r = computeForecast({ ...base, reference: { intervalKm: null, intervalMonths: null } });
    expect(r).toMatchObject({ method: "IMPOSSIBLE", confidence: null, dueKm: null, dueDate: null });
    expect(r.missing).toEqual(["history", "interval"]);
    expect(computeForecast({ ...base, lastDone: null }).missing).toEqual(["lastReplacement"]);
  });

  it("unknown rhythm → due in km only (no date), low confidence", () => {
    const r = computeForecast({ ...base, rhythm: { kmPerMonth: null, current: { at: D("2026-07-01"), km: 56_000 } } });
    expect(r.dueKm).toBe(60_000);
    expect(r.dueDate).toBeNull();
    expect(r.missing).toContain("rhythm");
    expect(r.confidence).toBe("LOW");
  });

  it("km vs months: the nearest is kept, both are given", () => {
    // km: due ~ 2026-11-01 (4 months after July); months: 2026-01-01 + 6 months = July 2026 → time wins.
    const r = computeForecast({ ...base, reference: { intervalKm: 10_000, intervalMonths: 6 } });
    expect(r.basis).toBe("TIME");
    expect(r.dueByTimeDate!.getTime()).toBeCloseTo(D("2026-01-01").getTime() + months(6), -3);
    expect(r.dueByKmDate).not.toBeNull();
    expect(r.dueDate).toEqual(r.dueByTimeDate);
    // 24 months: the km date is nearer.
    const r2 = computeForecast({ ...base, reference: { intervalKm: 10_000, intervalMonths: 24 } });
    expect(r2.basis).toBe("KM");
    expect(r2.dueDate).toEqual(r2.dueByKmDate);
  });

  it("a) history: median and Q1–Q3 range, confidence by cases and spread", () => {
    const history = { level: "MODEL" as const, label: "Peugeot 208", vehicles: 12, km: { n: 12, q1: 28_000, median: 30_000, q3: 33_000 }, months: null, cases: 12 };
    const r = computeForecast({ ...base, history });
    expect(r.method).toBe("HISTORY_MODEL");
    expect([r.dueKmLow, r.dueKm, r.dueKmHigh]).toEqual([78_000, 80_000, 83_000]);
    expect(r.dueDateLow! < r.dueDate! && r.dueDate! < r.dueDateHigh!).toBe(true);
    expect(r.cases).toBe(12);
    expect(r.confidence).toBe("GOOD");
    expect(computeForecast({ ...base, history: { ...history, cases: 6, km: { ...history.km, n: 6 } } }).confidence).toBe("MEDIUM");
  });

  it("km of the last replacement unknown → only the time rule, or impossible", () => {
    const r = computeForecast({ ...base, lastDone: { at: D("2026-01-01"), km: null }, reference: { intervalKm: 10_000, intervalMonths: 12 } });
    expect(r.basis).toBe("TIME");
    expect(r.missing).toContain("lastReplacementKm");
    expect(r.confidence).toBe("LOW");
    expect(computeForecast({ ...base, lastDone: { at: D("2026-01-01"), km: null } }).method).toBe("IMPOSSIBLE");
  });

  it("same inputs → same signature (idempotent recompute)", () => {
    const extra = { lastEventId: "e1", priceTtc: 180_000, warrantyUntil: null, kmPerMonth: 1000 };
    expect(forecastSignature(computeForecast(base), extra)).toBe(forecastSignature(computeForecast(base), extra));
    expect(forecastSignature(computeForecast(base), extra)).not.toBe(forecastSignature(computeForecast({ ...base, reference: { intervalKm: 12_000, intervalMonths: null } }), extra));
  });
});

describe("signaux du garage", () => {
  it("an item often replaced around the same km on a model, with the number of cases", () => {
    const rows = [98_000, 100_000, 101_000, 102_000, 99_000].map((km) => ({ make: "Peugeot", model: "208", itemId: "pump", km }));
    const s = garageSignals([...rows, { make: "Peugeot", model: "208", itemId: "pads", km: 30_000 }], 5);
    expect(s).toEqual([{ make: "Peugeot", model: "208", itemId: "pump", aroundKm: 100_000, lowKm: 99_000, highKm: 101_000, cases: 5 }]);
    expect(garageSignals(rows, 6)).toEqual([]);
    // Scattered replacements are not a signal.
    expect(garageSignals([20_000, 60_000, 100_000, 140_000, 180_000].map((km) => ({ make: "Kia", model: "Rio", itemId: "x", km })), 5)).toEqual([]);
  });
});

describe("détection dans les lignes d'ordre", () => {
  const items = [
    { id: "pads", keywords: ["plaquettes av"], partIds: ["p-pads"], packageIds: [] },
    { id: "oil", keywords: ["vidange"], partIds: [], packageIds: ["pkg-oil"], packageNames: ["Vidange 5W30"] },
    { id: "belt", keywords: ["courroie de distribution"], partIds: [], packageIds: [] },
  ];
  const line = (description: string, partId: string | null = null) => ({ description, partId, quantityX100: 100, unitPrice: 100_000, taxRateBp: 1900 });

  it("by linked part, by package, by keyword (accents and case ignored)", () => {
    const d = detectInOrder([line("Plaquettes AV Bosch", "p-pads"), line("Main-d'œuvre")], [{ id: "pkg-oil", name: "Vidange 5W30" }], items);
    expect(d.map((x) => [x.itemId, x.source])).toEqual([
      ["pads", "PART"],
      ["oil", "PACKAGE"],
    ]);
    expect(d[0]!.amountTtc).toBe(119_000);
    expect(detectInOrder([line("Remplacement COURROIE de Distribution")], [], items)[0]).toMatchObject({ itemId: "belt", source: "KEYWORD" });
    expect(detectInOrder([line("Contrôle")], [{ name: "vidange 5w30" }], items)[0]).toMatchObject({ itemId: "oil", source: "PACKAGE" });
  });

  it("whole words only", () => {
    expect(keywordMatches("Pneus avant", "pneu")).toBe(false);
    expect(keywordMatches("2 pneus avant", "pneus")).toBe(true);
    expect(keywordMatches("Bougies d'allumage", "bougies")).toBe(true);
  });
});

describe("prix et messages", () => {
  it("package price TTC; unknown part price → no price (never invented)", () => {
    expect(packagePriceTtc([{ type: "LABOR", quantityX100: 100, unitPrice: null }, { type: "PART", quantityX100: 400, unitPrice: null, partSalePrice: 25_000 }], 35_000, 1900)).toBe(160_650);
    expect(packagePriceTtc([{ type: "PART", quantityX100: 100, unitPrice: null, partSalePrice: null }], 35_000, 1900)).toBeNull();
    expect(packagePriceTtc([], 35_000, 1900)).toBeNull();
  });

  it("templates in French and Arabic say 'estimation'; one reminder key per cycle", () => {
    const fr = renderAgendaMessage(DEFAULT_AGENDA_TEMPLATES.fr, { garage: "Garage X", item: "vos plaquettes", plate: "123 TU 4567", when: "janvier", price: ", environ 180 DT", phone: "71 000 000" });
    expect(fr).toContain("d'ici janvier, environ 180 DT — estimation");
    expect(DEFAULT_AGENDA_TEMPLATES.ar).toContain("تقدير");
    expect(agendaDedupeKey("v", "i", "e1")).not.toBe(agendaDedupeKey("v", "i", "e2"));
  });
});
