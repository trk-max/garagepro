export type Lang = "fr" | "ar" | "en";
export const LANGS: Lang[] = ["fr", "ar", "en"];

const LOCALE: Record<Lang, string> = { fr: "fr-TN", ar: "ar-TN", en: "en-GB" };

/** Amounts are stored in millimes (1 DT = 1000 millimes). */
export function formatMoney(millimes: number, lang: Lang): string {
  return new Intl.NumberFormat(LOCALE[lang], {
    style: "currency",
    currency: "TND",
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
    numberingSystem: "latn",
  }).format(millimes / 1000);
}

/** Quantities are stored ×100 (150 = 1,5). */
export function formatQty(x100: number, lang: Lang): string {
  return new Intl.NumberFormat(LOCALE[lang], { maximumFractionDigits: 2, numberingSystem: "latn" }).format(x100 / 100);
}

/**
 * 24-hour clock in French and Arabic, as in Tunisia. Set explicitly: some ICU
 * versions format "fr-TN" with AM/PM, and the server and the browser could then
 * disagree (hydration mismatch).
 */
const hour24 = (lang: Lang): Intl.DateTimeFormatOptions => (lang === "en" ? {} : { hourCycle: "h23" });

/** Dates are always shown in the garage's time zone, whatever the server's zone is. */
export const GARAGE_TZ = "Africa/Tunis";

export function formatDate(value: Date | string, lang: Lang, timeZone = GARAGE_TZ): string {
  return new Intl.DateTimeFormat(LOCALE[lang], { dateStyle: "medium", numberingSystem: "latn", timeZone }).format(new Date(value));
}

export function formatDateTime(value: Date | string, lang: Lang, timeZone = GARAGE_TZ): string {
  return new Intl.DateTimeFormat(LOCALE[lang], {
    dateStyle: "short",
    timeStyle: "short",
    numberingSystem: "latn",
    timeZone,
    ...hour24(lang),
  }).format(new Date(value));
}

export function formatTime(value: Date | string, lang: Lang, timeZone = GARAGE_TZ): string {
  return new Intl.DateTimeFormat(LOCALE[lang], { timeStyle: "short", numberingSystem: "latn", timeZone, ...hour24(lang) }).format(new Date(value));
}

/** "mercredi 7 octobre" for a YYYY-MM-DD calendar day (no time-zone shift). */
export function formatDay(isoDate: string, lang: Lang, opts: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long" }): string {
  return new Intl.DateTimeFormat(LOCALE[lang], { ...opts, timeZone: "UTC", numberingSystem: "latn" }).format(new Date(`${isoDate}T12:00:00Z`));
}

export function formatKm(km: number | null | undefined, lang: Lang): string {
  if (km == null) return "—";
  return `${new Intl.NumberFormat(LOCALE[lang], { numberingSystem: "latn" }).format(km)} km`;
}

export const woNumber = (n: number) => `OR-${String(n).padStart(4, "0")}`;

/** "123 tu 4567" → "123TU4567" (storage/search key). */
export function normalizePlate(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9؀-ۿ]/g, "");
}

/** "123TU4567" → "123 TU 4567" for display. */
export function displayPlate(plate: string): string {
  const m = /^(\d{1,3})(TU|تونس|RS)(\d{1,4})$/.exec(plate);
  return m ? `${m[1]} ${m[2]} ${m[3]}` : plate;
}

/** Replaces {name} placeholders in dictionary templates. */
export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in vars ? String(vars[key]) : match));
}

export type LineAmounts = { quantityX100: number; unitPrice: number; taxRateBp: number };

export function lineTotalHt(line: Pick<LineAmounts, "quantityX100" | "unitPrice">): number {
  return Math.round((line.quantityX100 * line.unitPrice) / 100);
}

export type Totals = { totalHt: number; totalTax: number; stampDuty: number; totalTtc: number; taxByRate: { rateBp: number; base: number; tax: number }[] };

/** Totals with VAT grouped by rate, as required on Tunisian invoices. */
export function computeTotals(lines: LineAmounts[], stampDuty: number): Totals {
  const byRate = new Map<number, number>();
  for (const line of lines) {
    byRate.set(line.taxRateBp, (byRate.get(line.taxRateBp) ?? 0) + lineTotalHt(line));
  }
  const taxByRate = [...byRate.entries()]
    .sort(([a], [b]) => a - b)
    .map(([rateBp, base]) => ({ rateBp, base, tax: Math.round((base * rateBp) / 10_000) }));
  const totalHt = taxByRate.reduce((sum, r) => sum + r.base, 0);
  const totalTax = taxByRate.reduce((sum, r) => sum + r.tax, 0);
  const stamp = lines.length ? stampDuty : 0;
  return { totalHt, totalTax, stampDuty: stamp, totalTtc: totalHt + totalTax + stamp, taxByRate };
}
