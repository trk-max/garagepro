/**
 * V12 — agenda des prochaines réparations. PURE calculations (no database), unit-tested in
 * tests/agenda.test.ts. Everything here is an ESTIMATION: each result says its method, its source
 * and how many cases it is based on; when data is missing the answer is "impossible" with the
 * list of what is missing — never a default figure presented as computed.
 *
 * Formulas (also explained in docs/RAPPORT-V12.md and docs/AGENDA-ENTRETIEN.md):
 * - Driving rhythm (km / month) = (last km − first km) ÷ months between the first and the last
 *   REAL dated reading (work order check-in mileage, OBD adapter). At least 2 readings spread over
 *   at least 30 days, otherwise "unknown". Simulated OBD readings and readings lower than an
 *   earlier one (incoherent) are excluded.
 * - a) Garage history on the same model: intervals observed between two replacements of the item
 *   on the same vehicle → MEDIAN and quartiles (Q1–Q3) when there are at least N cases (N = 5 by default).
 * - b) Otherwise the reference interval TYPED by the garage for the item.
 * - c) Otherwise "estimation impossible" + what is missing.
 * - Due by km = last replacement km + interval; converted to a date with the rhythm. Due by time =
 *   last replacement date + interval in months. The nearest of the two is kept; both are shown.
 */

export const DAY_MS = 86_400_000;
/** Average month (365.25 / 12 days). */
export const MONTH_DAYS = 30.4375;
const MONTH_MS = MONTH_DAYS * DAY_MS;
/** Minimum span between the first and the last reading for a driving rhythm. */
export const MIN_RHYTHM_DAYS = 30;

export type Method = "HISTORY_MODEL" | "REFERENCE" | "IMPOSSIBLE";
export type Confidence = "LOW" | "MEDIUM" | "GOOD";
export type MissingKey = "lastReplacement" | "lastReplacementKm" | "interval" | "history" | "currentKm" | "rhythm";
export const FORECAST_STATUSES = ["PROPOSED", "VALIDATED", "SENT", "BOOKED", "DONE", "IGNORED"] as const;
export type ForecastStatus = (typeof FORECAST_STATUSES)[number];
export const CONFIDENCE_RANK: Record<Confidence, number> = { LOW: 1, MEDIUM: 2, GOOD: 3 };

// ── Statistics ─────────────────────────────────────────────────────────────

export type Quartiles = { n: number; q1: number; median: number; q3: number };

/** Quantile with linear interpolation between closest ranks (same as Excel QUARTILE.INC). */
function quantileSorted(sorted: number[], p: number): number {
  const pos = (sorted.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

/** Median and quartiles; null for an empty list. */
export function quartiles(values: readonly number[]): Quartiles | null {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  return { n: sorted.length, q1: quantileSorted(sorted, 0.25), median: quantileSorted(sorted, 0.5), q3: quantileSorted(sorted, 0.75) };
}

// ── Mileage readings and driving rhythm ────────────────────────────────────

/** ORDER = check-in mileage of a work order; ADAPTER = OBD read on the car; SIMULATED = demo (never used). */
export type OdoReading = { at: Date; km: number; source: "ORDER" | "ADAPTER" | "SIMULATED" };
export type ExcludedReading = OdoReading & { reason: "SIMULATED" | "LOWER" };

/** Keeps the real readings in date order; drops simulated ones and any km lower than an earlier one. */
export function cleanReadings(readings: readonly OdoReading[]): { kept: OdoReading[]; excluded: ExcludedReading[] } {
  const kept: OdoReading[] = [];
  const excluded: ExcludedReading[] = [];
  let max = -Infinity;
  for (const r of [...readings].sort((a, b) => a.at.getTime() - b.at.getTime())) {
    if (r.source === "SIMULATED") excluded.push({ ...r, reason: "SIMULATED" });
    else if (!Number.isFinite(r.km) || r.km < 0 || r.km < max) excluded.push({ ...r, reason: "LOWER" });
    else {
      kept.push(r);
      max = r.km;
    }
  }
  return { kept, excluded };
}

export type Rhythm = {
  /** km per month, null = unknown. */
  kmPerMonth: number | null;
  /** Why it is unknown. */
  reason: "notEnough" | "tooClose" | "noProgress" | null;
  readings: number;
  spanDays: number;
  /** Latest real reading (current mileage), null when none. */
  current: { at: Date; km: number } | null;
  excluded: number;
};

export function drivingRhythm(readings: readonly OdoReading[]): Rhythm {
  const { kept, excluded } = cleanReadings(readings);
  const last = kept.at(-1) ?? null;
  const current = last ? { at: last.at, km: last.km } : null;
  const base = { readings: kept.length, current, excluded: excluded.length };
  if (kept.length < 2) return { ...base, kmPerMonth: null, reason: "notEnough", spanDays: 0 };
  const first = kept[0]!;
  const spanDays = (last!.at.getTime() - first.at.getTime()) / DAY_MS;
  if (spanDays < MIN_RHYTHM_DAYS) return { ...base, kmPerMonth: null, reason: "tooClose", spanDays };
  const perMonth = (last!.km - first.km) / (spanDays / MONTH_DAYS);
  if (!(perMonth > 0)) return { ...base, kmPerMonth: null, reason: "noProgress", spanDays };
  return { ...base, kmPerMonth: Math.round(perMonth), reason: null, spanDays };
}

// ── Garage history (same model) ────────────────────────────────────────────

export type Replacement = { vehicleId: string; doneAt: Date; km: number | null };

/** Intervals between two consecutive replacements of the item on the SAME vehicle. */
export function observedIntervals(events: readonly Replacement[]): { km: number[]; months: number[] } {
  const byVehicle = new Map<string, Replacement[]>();
  for (const e of events) byVehicle.set(e.vehicleId, [...(byVehicle.get(e.vehicleId) ?? []), e]);
  const km: number[] = [];
  const months: number[] = [];
  for (const list of byVehicle.values()) {
    const sorted = [...list].sort((a, b) => a.doneAt.getTime() - b.doneAt.getTime());
    for (let i = 1; i < sorted.length; i++) {
      const a = sorted[i - 1]!;
      const b = sorted[i]!;
      if (a.km !== null && b.km !== null && b.km > a.km) km.push(b.km - a.km);
      const m = (b.doneAt.getTime() - a.doneAt.getTime()) / MONTH_MS;
      if (m > 0.5) months.push(Math.round(m * 10) / 10);
    }
  }
  return { km, months };
}

export type VehicleModel = { make: string; model: string; fuel?: string | null; year?: number | null };
export type ModelLevel = "MODEL_FUEL_YEAR" | "MODEL_FUEL" | "MODEL";
export type HistoryGroup = { level: ModelLevel; label: string; vehicles: number; km: Quartiles | null; months: Quartiles | null; cases: number };

const norm = (s: string) => normalizeText(s).replace(/\s+/g, "");
export const sameModel = (a: VehicleModel, b: VehicleModel) => norm(a.make) === norm(b.make) && norm(a.model) === norm(b.model);

/**
 * Most precise group of the same model that has at least `minCases` observed intervals:
 * same model + fuel + year (± 3 years) → same model + fuel → same model. Null when none qualifies.
 */
export function historyGroup(target: VehicleModel, fleet: readonly { vehicle: VehicleModel & { id: string }; events: readonly Replacement[] }[], minCases: number): HistoryGroup | null {
  const levels: { level: ModelLevel; ok: (v: VehicleModel) => boolean; usable: boolean }[] = [
    { level: "MODEL_FUEL_YEAR", ok: (v) => v.fuel === target.fuel && v.year != null && Math.abs(v.year - target.year!) <= 3, usable: !!target.fuel && target.year != null },
    { level: "MODEL_FUEL", ok: (v) => v.fuel === target.fuel, usable: !!target.fuel },
    { level: "MODEL", ok: () => true, usable: true },
  ];
  for (const l of levels) {
    if (!l.usable) continue;
    const group = fleet.filter((f) => sameModel(f.vehicle, target) && l.ok(f.vehicle));
    const iv = observedIntervals(group.flatMap((g) => g.events));
    const km = iv.km.length >= minCases ? quartiles(iv.km) : null;
    const months = iv.months.length >= minCases ? quartiles(iv.months) : null;
    if (km || months) {
      const label = [target.make, target.model, l.level !== "MODEL" ? target.fuel : null, l.level === "MODEL_FUEL_YEAR" ? `${target.year! - 3}–${target.year! + 3}` : null].filter(Boolean).join(" ");
      return { level: l.level, label, vehicles: new Set(group.filter((g) => g.events.length > 1).map((g) => g.vehicle.id)).size, km, months, cases: Math.max(km?.n ?? 0, months?.n ?? 0) };
    }
  }
  return null;
}

// ── Forecast ───────────────────────────────────────────────────────────────

export type ForecastInput = {
  now: Date;
  lastDone: { at: Date; km: number | null; eventId?: string | null } | null;
  rhythm: Pick<Rhythm, "kmPerMonth" | "current">;
  history: HistoryGroup | null;
  reference: { intervalKm: number | null; intervalMonths: number | null };
  goodCases: number;
};

export type Range = { low: number; mid: number; high: number };
export type ForecastResult = {
  method: Method;
  cases: number;
  confidence: Confidence | null;
  missing: MissingKey[];
  interval: { km: Range | null; months: Range | null; source: "HISTORY" | "REFERENCE" | null; group: string | null };
  dueKm: number | null;
  dueKmLow: number | null;
  dueKmHigh: number | null;
  dueByKmDate: Date | null;
  dueByTimeDate: Date | null;
  /** The nearest of the two, with its range. */
  dueDate: Date | null;
  dueDateLow: Date | null;
  dueDateHigh: Date | null;
  /** Which rule gives dueDate (or "KM" when only a km is known). */
  basis: "KM" | "TIME" | null;
};

/** Spread of the observed intervals above which the history is not "good" (IQR ÷ median). */
export const GOOD_MAX_SPREAD = 0.5;

const addMonths = (d: Date, months: number) => new Date(d.getTime() + months * MONTH_MS);
const rangeOf = (q: Quartiles): Range => ({ low: q.q1, mid: q.median, high: q.q3 });
const fixed = (v: number): Range => ({ low: v, mid: v, high: v });

/**
 * Confidence (documented thresholds):
 * - GOOD: garage history with at least `goodCases` cases (10 by default) and a spread (Q3 − Q1) ÷ median ≤ 0.5.
 * - MEDIUM: garage history with at least N cases; or the garage's reference interval when the last
 *   replacement date AND km are known and the due date does not depend on an unknown rhythm.
 * - LOW: reference interval with an incomplete basis (km of the last replacement unknown, or km due
 *   without a known rhythm → no date).
 */
export function computeForecast(input: ForecastInput): ForecastResult {
  const { history, reference, lastDone, rhythm } = input;
  const empty = { dueKm: null, dueKmLow: null, dueKmHigh: null, dueByKmDate: null, dueByTimeDate: null, dueDate: null, dueDateLow: null, dueDateHigh: null, basis: null } as const;
  const missing: MissingKey[] = [];

  let method: Method;
  let km: Range | null = null;
  let months: Range | null = null;
  let cases = 0;
  if (history && (history.km || history.months)) {
    method = "HISTORY_MODEL";
    km = history.km ? rangeOf(history.km) : null;
    months = history.months ? rangeOf(history.months) : null;
    cases = history.cases;
  } else if (reference.intervalKm || reference.intervalMonths) {
    method = "REFERENCE";
    km = reference.intervalKm ? fixed(reference.intervalKm) : null;
    months = reference.intervalMonths ? fixed(reference.intervalMonths) : null;
  } else {
    missing.push("history", "interval");
    if (!lastDone) missing.push("lastReplacement");
    return { method: "IMPOSSIBLE", cases: 0, confidence: null, missing, interval: { km: null, months: null, source: null, group: null }, ...empty };
  }
  const interval = { km, months, source: method === "HISTORY_MODEL" ? ("HISTORY" as const) : ("REFERENCE" as const), group: history?.label ?? null };
  if (!lastDone) return { method: "IMPOSSIBLE", cases, confidence: null, missing: ["lastReplacement"], interval, ...empty };

  // Due by km (needs the km of the last replacement), converted to a date with the rhythm.
  let dueKm: number | null = null;
  let dueKmLow: number | null = null;
  let dueKmHigh: number | null = null;
  let dueByKmDate: Date | null = null;
  let kmDates: { low: Date; high: Date } | null = null;
  if (km) {
    if (lastDone.km === null) missing.push("lastReplacementKm");
    else {
      dueKm = Math.round(lastDone.km + km.mid);
      dueKmLow = Math.round(lastDone.km + km.low);
      dueKmHigh = Math.round(lastDone.km + km.high);
      const cur = rhythm.current;
      if (!cur) missing.push("currentKm");
      if (!rhythm.kmPerMonth) missing.push("rhythm");
      if (cur && rhythm.kmPerMonth) {
        const at = (target: number) => addMonths(cur.at, (target - cur.km) / rhythm.kmPerMonth!);
        dueByKmDate = at(dueKm);
        kmDates = { low: at(dueKmLow), high: at(dueKmHigh) };
      }
    }
  }
  // Due by time.
  const dueByTimeDate = months ? addMonths(lastDone.at, months.mid) : null;
  const timeDates = months ? { low: addMonths(lastDone.at, months.low), high: addMonths(lastDone.at, months.high) } : null;

  if (dueKm === null && !dueByTimeDate) return { method: "IMPOSSIBLE", cases, confidence: null, missing, interval, ...empty };

  let basis: "KM" | "TIME";
  let dueDate: Date | null;
  let dueDateLow: Date | null = null;
  let dueDateHigh: Date | null = null;
  if (dueByKmDate && (!dueByTimeDate || dueByKmDate <= dueByTimeDate)) {
    basis = "KM";
    dueDate = dueByKmDate;
    dueDateLow = kmDates!.low;
    dueDateHigh = kmDates!.high;
  } else if (dueByTimeDate) {
    basis = "TIME";
    dueDate = dueByTimeDate;
    dueDateLow = timeDates!.low;
    dueDateHigh = timeDates!.high;
  } else {
    basis = "KM";
    dueDate = null;
  }

  let confidence: Confidence;
  if (method === "HISTORY_MODEL") {
    const q = basis === "KM" ? (history!.km ?? history!.months) : (history!.months ?? history!.km);
    const spread = q && q.median > 0 ? (q.q3 - q.q1) / q.median : Infinity;
    confidence = cases >= input.goodCases && spread <= GOOD_MAX_SPREAD ? "GOOD" : "MEDIUM";
  } else {
    const complete = lastDone.km !== null && dueDate !== null && (basis === "TIME" || !!rhythm.kmPerMonth);
    confidence = complete ? "MEDIUM" : "LOW";
  }
  return { method, cases, confidence, missing, interval, dueKm, dueKmLow, dueKmHigh, dueByKmDate, dueByTimeDate, dueDate, dueDateLow, dueDateHigh, basis };
}

/** Stable fingerprint of a result: the same inputs give the same signature (no rewrite). */
export function forecastSignature(r: ForecastResult, extra: { lastEventId: string | null; priceTtc: number | null; warrantyUntil: Date | null; kmPerMonth: number | null }): string {
  const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");
  return [
    r.method, r.cases, r.confidence ?? "", r.missing.join("+"), r.dueKm ?? "", r.dueKmLow ?? "", r.dueKmHigh ?? "",
    day(r.dueByKmDate), day(r.dueByTimeDate), day(r.dueDateLow), day(r.dueDateHigh), extra.lastEventId ?? "", extra.priceTtc ?? "", day(extra.warrantyUntil), extra.kmPerMonth ?? "",
  ].join("|");
}

// ── "Garage signals": items often replaced around a given km on a model ───

export type SignalRow = { make: string; model: string; itemId: string; km: number };
export type Signal = { make: string; model: string; itemId: string; aroundKm: number; lowKm: number; highKm: number; cases: number };
/** Max spread (Q3 − Q1) ÷ median for "around the same km". */
export const SIGNAL_MAX_SPREAD = 0.3;

/**
 * Models where an item was often replaced around the same mileage (e.g. water pump of the 208
 * around 100 000 km). Shown as "to watch", with the number of cases — never as a certain failure.
 */
export function garageSignals(rows: readonly SignalRow[], minCases: number): Signal[] {
  const groups = new Map<string, SignalRow[]>();
  for (const r of rows) {
    if (!(r.km > 0)) continue;
    const key = `${norm(r.make)}|${norm(r.model)}|${r.itemId}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const out: Signal[] = [];
  for (const list of groups.values()) {
    const q = quartiles(list.map((r) => r.km));
    if (!q || q.n < minCases || q.median <= 0 || (q.q3 - q.q1) / q.median > SIGNAL_MAX_SPREAD) continue;
    const roundTo = 1000;
    out.push({ make: list[0]!.make, model: list[0]!.model, itemId: list[0]!.itemId, aroundKm: Math.round(q.median / roundTo) * roundTo, lowKm: Math.round(q.q1), highKm: Math.round(q.q3), cases: q.n });
  }
  return out.sort((a, b) => b.cases - a.cases);
}

// ── Detection in work order lines ──────────────────────────────────────────

/** Lower case, no accents, single spaces (Arabic letters are kept). */
export function normalizeText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export type CatalogItem = { id: string; keywords: readonly string[]; partIds: readonly string[]; packageIds: readonly string[]; packageNames?: readonly string[] };
export type OrderLine = { description: string; partId: string | null; quantityX100: number; unitPrice: number; taxRateBp: number };
export type Detection = { itemId: string; source: "PART" | "PACKAGE" | "KEYWORD"; matchedText: string; amountTtc: number | null };

const lineTtc = (l: OrderLine) => {
  const ht = Math.round((l.quantityX100 * l.unitPrice) / 100);
  return ht + Math.round((ht * l.taxRateBp) / 10_000);
};

/** True when the keyword appears as whole word(s) in the text (both normalised). */
export function keywordMatches(text: string, keyword: string): boolean {
  const k = normalizeText(keyword);
  if (!k) return false;
  return ` ${normalizeText(text)} `.includes(` ${k} `);
}

/**
 * Items replaced in a delivered work order: a linked part on a line (PART), a linked package applied
 * to the order (PACKAGE), or a keyword in a line description (KEYWORD). One detection per item.
 */
export function detectInOrder(lines: readonly OrderLine[], appliedPackages: readonly { id?: string | null; name: string }[], items: readonly CatalogItem[]): Detection[] {
  const out: Detection[] = [];
  for (const item of items) {
    const byPart = lines.filter((l) => l.partId && item.partIds.includes(l.partId));
    const byKeyword = lines.filter((l) => !byPart.includes(l) && item.keywords.some((k) => keywordMatches(l.description, k)));
    const pkg = appliedPackages.find((p) => (p.id && item.packageIds.includes(p.id)) || (item.packageNames ?? []).some((n) => normalizeText(n) === normalizeText(p.name)));
    const matched = [...byPart, ...byKeyword];
    const amountTtc = matched.length ? matched.reduce((s, l) => s + lineTtc(l), 0) : null;
    if (byPart.length) out.push({ itemId: item.id, source: "PART", matchedText: byPart[0]!.description, amountTtc });
    else if (pkg) out.push({ itemId: item.id, source: "PACKAGE", matchedText: pkg.name, amountTtc });
    else if (byKeyword.length) out.push({ itemId: item.id, source: "KEYWORD", matchedText: byKeyword[0]!.description, amountTtc });
  }
  return out;
}

/** Indicative price of a package, TTC (millimes): its lines at their price, else labour rate / part sale price. */
export function packagePriceTtc(lines: readonly { type: "LABOR" | "PART"; quantityX100: number; unitPrice: number | null; partSalePrice?: number | null }[], laborRate: number, taxBp: number): number | null {
  if (lines.length === 0) return null;
  let ht = 0;
  for (const l of lines) {
    const unit = l.unitPrice ?? (l.type === "LABOR" ? laborRate : (l.partSalePrice ?? null));
    if (unit === null) return null;
    ht += Math.round((l.quantityX100 * unit) / 100);
  }
  return ht + Math.round((ht * taxBp) / 10_000);
}

// ── Messages ───────────────────────────────────────────────────────────────

export const DEFAULT_AGENDA_TEMPLATES = {
  fr: "{garage} : prévoyez {item} pour votre véhicule {plate} d'ici {when}{price} — estimation. Prenez rendez-vous en ligne ou au {phone}.",
  ar: "{garage}: يُرجى برمجة {item} لسيارتكم {plate} قبل {when}{price} — تقدير. احجزوا موعدًا عبر الموقع أو على الرقم {phone}.",
} as const;
export type MessageLang = keyof typeof DEFAULT_AGENDA_TEMPLATES;

/** Fills {name} placeholders; unknown ones stay visible rather than silently disappearing. */
export function renderAgendaMessage(template: string, vars: Record<string, string | number | null | undefined>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (vars[k] === undefined || vars[k] === null ? m : String(vars[k])));
}

/**
 * One reminder per vehicle, item and maintenance cycle (the cycle changes only when the item is
 * replaced again): a second "send" for the same cycle is refused by the unique (dedupeKey, channel).
 */
export const agendaDedupeKey = (vehicleId: string, itemId: string, lastEventId: string | null) => `agenda:${vehicleId}:${itemId}:${lastEventId ?? "none"}`;

/** Forecasts due within `days` (date known), for counters and the "to do" list. */
export const dueWithin = (dueDate: Date | null, now: Date, days: number) => !!dueDate && dueDate.getTime() <= now.getTime() + days * DAY_MS;

/**
 * Starter catalogue offered to the garage (names and keywords only). Intervals are NOT stored:
 * `example*` values are shown next to the empty field as "example — to be checked by the garage".
 */
export const STARTER_ITEMS: readonly { code: string; fr: string; ar: string; en: string; keywords: string[]; exampleKm: number | null; exampleMonths: number | null }[] = [
  { code: "OIL", fr: "Vidange huile moteur", ar: "تغيير زيت المحرك", en: "Engine oil change", keywords: ["vidange", "huile moteur"], exampleKm: 10000, exampleMonths: 12 },
  { code: "OIL_FILTER", fr: "Filtre à huile", ar: "مصفاة الزيت", en: "Oil filter", keywords: ["filtre a huile", "filtre huile"], exampleKm: 10000, exampleMonths: 12 },
  { code: "AIR_FILTER", fr: "Filtre à air", ar: "مصفاة الهواء", en: "Air filter", keywords: ["filtre a air", "filtre air"], exampleKm: 20000, exampleMonths: 24 },
  { code: "CABIN_FILTER", fr: "Filtre habitacle", ar: "مصفاة المقصورة", en: "Cabin filter", keywords: ["filtre habitacle", "filtre pollen"], exampleKm: 15000, exampleMonths: 12 },
  { code: "FUEL_FILTER", fr: "Filtre à carburant", ar: "مصفاة الوقود", en: "Fuel filter", keywords: ["filtre a gasoil", "filtre a carburant", "filtre gasoil"], exampleKm: 40000, exampleMonths: null },
  { code: "PADS_FRONT", fr: "Plaquettes de frein avant", ar: "وسادات الفرامل الأمامية", en: "Front brake pads", keywords: ["plaquettes av", "plaquettes avant", "plaquette av", "plaquette avant"], exampleKm: 30000, exampleMonths: null },
  { code: "PADS_REAR", fr: "Plaquettes de frein arrière", ar: "وسادات الفرامل الخلفية", en: "Rear brake pads", keywords: ["plaquettes ar", "plaquettes arriere", "plaquette ar", "plaquette arriere"], exampleKm: 50000, exampleMonths: null },
  { code: "DISCS", fr: "Disques de frein", ar: "أقراص الفرامل", en: "Brake discs", keywords: ["disques", "disque de frein", "disques de frein"], exampleKm: 60000, exampleMonths: null },
  { code: "TIMING_BELT", fr: "Courroie de distribution", ar: "سير التوزيع", en: "Timing belt", keywords: ["courroie de distribution", "kit distribution"], exampleKm: 100000, exampleMonths: 60 },
  { code: "BATTERY", fr: "Batterie", ar: "البطارية", en: "Battery", keywords: ["batterie"], exampleKm: null, exampleMonths: 48 },
  { code: "TIRES", fr: "Pneus", ar: "العجلات", en: "Tyres", keywords: ["pneu", "pneus"], exampleKm: 40000, exampleMonths: null },
  { code: "BRAKE_FLUID", fr: "Liquide de frein", ar: "سائل الفرامل", en: "Brake fluid", keywords: ["liquide de frein"], exampleKm: null, exampleMonths: 24 },
  { code: "SPARK_PLUGS", fr: "Bougies", ar: "الشمعات", en: "Spark plugs", keywords: ["bougies", "bougie d allumage"], exampleKm: 30000, exampleMonths: null },
  { code: "SHOCKS", fr: "Amortisseurs", ar: "ممتصات الصدمات", en: "Shock absorbers", keywords: ["amortisseur", "amortisseurs"], exampleKm: 80000, exampleMonths: null },
  { code: "AC", fr: "Climatisation (recharge)", ar: "المكيف (شحن)", en: "Air conditioning (recharge)", keywords: ["climatisation", "recharge clim", "clim"], exampleKm: null, exampleMonths: 24 },
];
