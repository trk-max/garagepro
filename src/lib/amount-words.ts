/**
 * Amounts in French words for the invoice (V10.6):
 * « Arrêtée la présente facture à la somme de mille deux cent trente-quatre dinars et cinq cents millimes. »
 * Traditional French spelling (hyphens below one hundred, "et" in 21, 31… 71, plural "vingts" / "cents"
 * only at the end of a number, "mille" invariable). Pure and unit-tested (tests/amount-words.test.ts).
 */

const UNITS = ["zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize"];
const TENS: Record<number, string> = { 2: "vingt", 3: "trente", 4: "quarante", 5: "cinquante", 6: "soixante" };

/** 0–99. `final`: the number ends here (quatre-vingts takes its "s"). */
function below100(n: number, final: boolean): string {
  if (n <= 16) return UNITS[n]!;
  if (n < 20) return `dix-${UNITS[n - 10]}`;
  const ten = Math.floor(n / 10);
  const unit = n % 10;
  if (ten === 7 || ten === 9) {
    // 70–79 = soixante + 10–19, 90–99 = quatre-vingt + 10–19
    const base = ten === 7 ? "soixante" : "quatre-vingt";
    const rest = below100(10 + unit, final);
    return ten === 7 && unit === 1 ? `${base} et ${rest}` : `${base}-${rest}`;
  }
  if (ten === 8) return unit === 0 ? (final ? "quatre-vingts" : "quatre-vingt") : `quatre-vingt-${UNITS[unit]}`;
  const word = TENS[ten]!;
  if (unit === 0) return word;
  if (unit === 1) return `${word} et un`;
  return `${word}-${UNITS[unit]}`;
}

/** 0–999 (0 → ""). `final`: nothing follows except a noun ("dinars", "millions") → "deux cents". */
function below1000(n: number, final: boolean): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (hundreds === 1) parts.push("cent");
  else if (hundreds > 1) parts.push(rest === 0 && final ? `${UNITS[hundreds]} cents` : `${UNITS[hundreds]} cent`);
  if (rest > 0) parts.push(below100(rest, final));
  return parts.join(" ");
}

/** Whole number in French words (0 → "zéro"). Up to 999 999 999 999. */
export function integerToFrenchWords(value: number): string {
  let n = Math.floor(Math.abs(value));
  if (!Number.isFinite(n) || n > 999_999_999_999) throw new RangeError("amount out of range");
  if (n === 0) return "zéro";
  const scales: [number, string, string][] = [
    [1_000_000_000, "milliard", "milliards"],
    [1_000_000, "million", "millions"],
  ];
  const parts: string[] = [];
  for (const [size, one, many] of scales) {
    const count = Math.floor(n / size);
    if (count > 0) parts.push(count === 1 ? `un ${one}` : `${below1000(count, true)} ${many}`);
    n %= size;
  }
  const thousands = Math.floor(n / 1000);
  // "mille" is invariable and never preceded by "un"; what comes before it is not final ("deux cent mille").
  if (thousands === 1) parts.push("mille");
  else if (thousands > 1) parts.push(`${below1000(thousands, false)} mille`);
  const rest = n % 1000;
  if (rest > 0) parts.push(below1000(rest, true));
  return `${value < 0 ? "moins " : ""}${parts.join(" ")}`;
}

/**
 * 1234500 millimes → "mille deux cent trente-quatre dinars et cinq cents millimes".
 * No millimes → the dinars only; a round number of millions → "un million de dinars".
 */
export function amountInFrenchWords(millimes: number): string {
  const abs = Math.abs(Math.round(millimes));
  const dinars = Math.floor(abs / 1000);
  const mil = abs % 1000;
  const sign = millimes < 0 ? "moins " : "";
  const dinarWord = dinars <= 1 ? "dinar" : "dinars";
  const of = dinars >= 1_000_000 && dinars % 1_000_000 === 0 ? "de " : "";
  const dinarText = `${integerToFrenchWords(dinars)} ${of}${dinarWord}`;
  if (mil === 0) return `${sign}${dinarText}`;
  const milText = `${integerToFrenchWords(mil)} ${mil === 1 ? "millime" : "millimes"}`;
  return dinars === 0 ? `${sign}${milText}` : `${sign}${dinarText} et ${milText}`;
}

/** The legal sentence printed under the invoice totals. */
export const invoiceAmountSentence = (millimes: number) => `Arrêtée la présente facture à la somme de ${amountInFrenchWords(millimes)}.`;
