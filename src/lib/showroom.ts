/**
 * Showroom (V9) — pure rules shared by the server, the pages and the tests:
 * statuses and allowed moves, what is public, publication checks, history events,
 * the public address (slug) and the source of each fact ("verified by the garage"
 * vs "declared by the seller").
 */

export const LISTING_STATUSES = ["DRAFT", "PUBLISHED", "RESERVED", "SOLD", "UNAVAILABLE", "ARCHIVED"] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

/** Buyer messages are plain text, limited in size (and escaped when shown — React does it). */
export const MESSAGE_MAX = 2000;

export const FUELS =["ESSENCE", "DIESEL", "HYBRID", "ELECTRIC", "GPL"] as const;
export const GEARBOXES = ["MANUAL", "AUTOMATIC"] as const;
export const CONDITIONS = ["NEW", "EXCELLENT", "GOOD", "FAIR", "TO_REPAIR"] as const;

/**
 * Allowed status changes. SOLD → PUBLISHED = sale cancelled. Nothing is ever deleted:
 * ARCHIVED → DRAFT brings a listing back to work on it.
 */
export const LISTING_TRANSITIONS: Record<ListingStatus, readonly ListingStatus[]> = {
  DRAFT: ["PUBLISHED", "ARCHIVED"],
  PUBLISHED: ["RESERVED", "SOLD", "UNAVAILABLE", "DRAFT", "ARCHIVED"],
  RESERVED: ["PUBLISHED", "SOLD", "UNAVAILABLE"],
  UNAVAILABLE: ["PUBLISHED", "DRAFT", "ARCHIVED"],
  SOLD: ["PUBLISHED", "ARCHIVED"],
  ARCHIVED: ["DRAFT"],
};

export const isListingStatus = (s: string): s is ListingStatus => (LISTING_STATUSES as readonly string[]).includes(s);

export function canMoveListing(from: string, to: string): boolean {
  return isListingStatus(from) && isListingStatus(to) && LISTING_TRANSITIONS[from].includes(to);
}

/** A sold car stays on the site this long, marked "Sold" and without the contact form; then it is hidden. */
export const SOLD_VISIBLE_DAYS = 14;

/** Is this listing shown on the public site? DRAFT, UNAVAILABLE and ARCHIVED never are. */
export function isPubliclyVisible(l: { status: string; soldAt: Date | null }, now = new Date()): boolean {
  if (l.status === "PUBLISHED" || l.status === "RESERVED") return true;
  if (l.status === "SOLD") return !!l.soldAt && now.getTime() - l.soldAt.getTime() < SOLD_VISIBLE_DAYS * 86_400_000;
  return false;
}

/** Buyers can write only about a car that is still for sale (published or reserved). */
export const isContactable = (status: string) => status === "PUBLISHED" || status === "RESERVED";

/** The Prisma `where` for public listings at `now`. */
export function publicWhere(now = new Date()) {
  return {
    OR: [{ status: { in: ["PUBLISHED", "RESERVED"] } }, { status: "SOLD", soldAt: { gte: new Date(now.getTime() - SOLD_VISIBLE_DAYS * 86_400_000) } }],
  };
}

export type PublishProblem = "price" | "make" | "model" | "photo";

/** What is missing before a listing can go on the site (empty = ready). */
export function publishProblems(l: { price: number | null; make: string; model: string }, photoCount: number): PublishProblem[] {
  const out: PublishProblem[] = [];
  if (!l.make.trim()) out.push("make");
  if (!l.model.trim()) out.push("model");
  if (!l.price || l.price <= 0) out.push("price");
  if (photoCount < 1) out.push("photo");
  return out;
}

export const listingNumber = (n: number) => `ANN-${String(n).padStart(4, "0")}`;

/** "Peugeot 208 GT Line 2019" → "peugeot-208-gt-line-2019". Accents removed, Arabic letters dropped. */
export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

/** Public address of a listing: readable words, then the listing number (the only part that is used). */
export function listingSlug(l: { number: number; make: string; model: string; version?: string | null; year?: number | null }): string {
  const words = slugify([l.make, l.model, l.version ?? "", l.year ?? ""].join(" "));
  return words ? `${words}-${l.number}` : String(l.number);
}

/** "/showroom/peugeot-208-2019-12" → 12 ; "12" → 12 ; anything else → null. */
export function numberFromSlug(param: string): number | null {
  const m = /(?:^|-)(\d{1,9})$/.exec(param);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

// ── Facts and their source ───────────────────────────────────────────────────

export type FactSource = "GARAGE" | "SELLER";
export type Fact = { source: FactSource; ref?: string; at?: string };
export type Facts = Partial<Record<"mileage" | "identity" | "year" | "fuel", Fact>>;

/** Last mileage read BY THE GARAGE on the linked vehicle (repair order at check-in, or OBD reading). */
export type GarageMileage = { km: number; at: Date; ref: string } | null;
/** The garage's own vehicle file (filled at check-in by the team). */
export type GarageVehicle = { make: string; model: string; year: number | null; fuel: string | null } | null;

const same = (a: string | null | undefined, b: string | null | undefined) => (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();

/**
 * Source of each public fact, computed by the server from the garage's own records — never
 * from what the form says. A fact is "verified by the garage" only when the listing shows
 * exactly what the garage recorded; anything typed differently is "declared by the seller".
 */
export function computeFacts(
  l: { make: string; model: string; year: number | null; fuel: string | null; mileage: number | null },
  garage: { mileage: GarageMileage; vehicle: GarageVehicle },
): Facts {
  const facts: Facts = {};
  const day = (d: Date) => d.toISOString().slice(0, 10);
  if (l.mileage !== null) {
    facts.mileage =
      garage.mileage && garage.mileage.km === l.mileage ? { source: "GARAGE", ref: garage.mileage.ref, at: day(garage.mileage.at) } : { source: "SELLER" };
  }
  const v = garage.vehicle;
  facts.identity = v && same(v.make, l.make) && same(v.model, l.model) ? { source: "GARAGE" } : { source: "SELLER" };
  if (l.year !== null) facts.year = v && v.year !== null && v.year === l.year ? { source: "GARAGE" } : { source: "SELLER" };
  if (l.fuel !== null) facts.fuel = v && v.fuel !== null && v.fuel === l.fuel ? { source: "GARAGE" } : { source: "SELLER" };
  return facts;
}

/** Reads the stored JSON safely (an old or hand-edited row never breaks a page). */
export function readFacts(value: unknown): Facts {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Facts = {};
  for (const key of ["mileage", "identity", "year", "fuel"] as const) {
    const f = (value as Record<string, unknown>)[key];
    if (f && typeof f === "object") {
      const { source, ref, at } = f as Record<string, unknown>;
      if (source === "GARAGE" || source === "SELLER") out[key] = { source, ...(typeof ref === "string" ? { ref } : {}), ...(typeof at === "string" ? { at } : {}) };
    }
  }
  return out;
}

// ── Equipment and technical specs (typed one per line) ──────────────────────

/** One item per line, trimmed, no duplicates, at most 80 items of 80 characters. */
export function parseEquipment(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const item = raw.replace(/^[-•*]\s*/, "").trim().slice(0, 80);
    if (item && !seen.has(item.toLowerCase())) {
      seen.add(item.toLowerCase());
      out.push(item);
    }
    if (out.length >= 80) break;
  }
  return out;
}

export type Spec = { label: string; value: string };

/** "Couple : 250 Nm" per line → { label: "Couple", value: "250 Nm" }. Lines without ":" are ignored. */
export function parseSpecs(text: string): Spec[] {
  const out: Spec[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const i = raw.indexOf(":");
    if (i <= 0) continue;
    const label = raw.slice(0, i).trim().slice(0, 60);
    const value = raw.slice(i + 1).trim().slice(0, 120);
    if (label && value) out.push({ label, value });
    if (out.length >= 60) break;
  }
  return out;
}

export function readStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string").slice(0, 80) : [];
}

export function readSpecs(value: unknown): Spec[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is Spec => !!v && typeof v === "object" && typeof (v as Spec).label === "string" && typeof (v as Spec).value === "string")
    .slice(0, 60);
}

// ── History events ───────────────────────────────────────────────────────────

export type ListingEventDraft = { type: string; before?: Record<string, unknown>; after?: Record<string, unknown> };

/** Fields compared to write the history (price and mileage get their own event). */
const TRACKED = [
  "make", "model", "version", "year", "fuel", "gearbox", "engineCc", "powerHp", "fiscalHp", "doors", "seats",
  "colorExt", "colorInt", "condition", "description", "equipment", "specs", "historySummary", "historyPublic", "vehicleId", "plate", "vin",
] as const;

const eq = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * History lines for an edit: PRICE_CHANGED and MILEAGE_CHANGED (before → after) when they move,
 * plus one UPDATED line listing the other fields that changed. Nothing changed → no line.
 */
export function listingChangeEvents(before: Record<string, unknown>, after: Record<string, unknown>): ListingEventDraft[] {
  const events: ListingEventDraft[] = [];
  if (!eq(before.price, after.price)) events.push({ type: "PRICE_CHANGED", before: { price: before.price ?? null }, after: { price: after.price ?? null } });
  if (!eq(before.mileage, after.mileage)) events.push({ type: "MILEAGE_CHANGED", before: { mileage: before.mileage ?? null }, after: { mileage: after.mileage ?? null } });
  const fields = TRACKED.filter((k) => k in after && !eq(before[k], after[k]));
  if (fields.length) {
    const pick = (o: Record<string, unknown>) => Object.fromEntries(fields.map((k) => [k, o[k] ?? null]));
    events.push({ type: "UPDATED", before: pick(before), after: pick(after) });
  }
  return events;
}

// ── Public search (URL query → safe filters) ────────────────────────────────

export const SORTS = ["recent", "priceAsc", "priceDesc", "kmAsc", "yearDesc"] as const;
export type ShowroomSort = (typeof SORTS)[number];

export type ShowroomQuery = {
  q?: string;
  make?: string;
  /** Dinars. */
  priceMin?: number;
  priceMax?: number;
  yearMin?: number;
  yearMax?: number;
  kmMax?: number;
  fuel?: (typeof FUELS)[number];
  gearbox?: (typeof GEARBOXES)[number];
  sort: ShowroomSort;
  page: number;
  /** Favourites (listing numbers kept in the visitor's browser). */
  numbers?: number[];
};

type Params = Record<string, string | string[] | undefined>;

/** Reads the search form of /showroom. Anything unexpected is ignored, never trusted. */
export function parseShowroomQuery(params: Params): ShowroomQuery {
  const one = (k: string) => {
    const v = params[k];
    return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
  };
  const int = (k: string, min: number, max: number) => {
    const s = one(k).replace(/[\s.]/g, "");
    if (!/^\d{1,9}$/.test(s)) return undefined;
    const n = Number(s);
    return n >= min && n <= max ? n : undefined;
  };
  const pick = <T extends readonly string[]>(k: string, values: T) => ((values as readonly string[]).includes(one(k)) ? (one(k) as T[number]) : undefined);
  const text = (k: string) => one(k).replace(/[\u0000-\u001f]/g, "").slice(0, 60) || undefined;
  const numbers = one("ids")
    .split(",")
    .map((s) => numberFromSlug(s.trim()))
    .filter((n): n is number => n !== null)
    .slice(0, 50);
  return {
    q: text("q"),
    make: text("make"),
    priceMin: int("priceMin", 0, 100_000_000),
    priceMax: int("priceMax", 0, 100_000_000),
    yearMin: int("yearMin", 1950, 2100),
    yearMax: int("yearMax", 1950, 2100),
    kmMax: int("kmMax", 0, 2_000_000),
    fuel: pick("fuel", FUELS),
    gearbox: pick("gearbox", GEARBOXES),
    sort: pick("sort", SORTS) ?? "recent",
    page: int("page", 1, 10_000) ?? 1,
    ...(numbers.length ? { numbers } : {}),
  };
}

/** Prices are typed in dinars and stored in millimes; the public price is shown without millimes. */
export const priceDt = (millimes: number) => Math.round(millimes / 1000);

const LOCALES = { fr: "fr-TN", ar: "ar-TN", en: "en-GB" } as const;

/** "32 500 DT" (car prices are shown in whole dinars). */
export function formatPriceDt(millimes: number, lang: keyof typeof LOCALES): string {
  return `${new Intl.NumberFormat(LOCALES[lang], { maximumFractionDigits: 0, numberingSystem: "latn" }).format(priceDt(millimes))} DT`;
}
