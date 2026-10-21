import { describe, expect, it } from "vitest";
import {
  LISTING_STATUSES,
  canMoveListing,
  computeFacts,
  isContactable,
  isPubliclyVisible,
  listingChangeEvents,
  listingNumber,
  listingSlug,
  numberFromSlug,
  parseEquipment,
  parseShowroomQuery,
  parseSpecs,
  publishProblems,
  readFacts,
  slugify,
} from "@/lib/showroom";
import { buyerContactSchema, listingSchema, messageSchema } from "@/lib/showroom-validators";

const DAY = 86_400_000;

describe("listing statuses", () => {
  it("a draft can only be published or archived", () => {
    expect(canMoveListing("DRAFT", "PUBLISHED")).toBe(true);
    expect(canMoveListing("DRAFT", "ARCHIVED")).toBe(true);
    for (const to of ["RESERVED", "SOLD", "UNAVAILABLE"]) expect(canMoveListing("DRAFT", to), to).toBe(false);
  });
  it("published → reserved → sold, a sold car can come back (sale cancelled) or be archived", () => {
    expect(canMoveListing("PUBLISHED", "RESERVED")).toBe(true);
    expect(canMoveListing("RESERVED", "SOLD")).toBe(true);
    expect(canMoveListing("SOLD", "PUBLISHED")).toBe(true);
    expect(canMoveListing("SOLD", "ARCHIVED")).toBe(true);
    expect(canMoveListing("SOLD", "DRAFT")).toBe(false);
  });
  it("archived only goes back to draft; no status moves to itself; unknown statuses are refused", () => {
    expect(canMoveListing("ARCHIVED", "DRAFT")).toBe(true);
    expect(canMoveListing("ARCHIVED", "PUBLISHED")).toBe(false);
    for (const s of LISTING_STATUSES) expect(canMoveListing(s, s), s).toBe(false);
    expect(canMoveListing("DRAFT", "DELETED")).toBe(false);
    expect(canMoveListing("HACKED", "PUBLISHED")).toBe(false);
  });
});

describe("what the public sees", () => {
  const now = new Date("2026-10-21T12:00:00Z");
  it("published and reserved are public; draft, unavailable and archived never", () => {
    expect(isPubliclyVisible({ status: "PUBLISHED", soldAt: null }, now)).toBe(true);
    expect(isPubliclyVisible({ status: "RESERVED", soldAt: null }, now)).toBe(true);
    for (const status of ["DRAFT", "UNAVAILABLE", "ARCHIVED"]) expect(isPubliclyVisible({ status, soldAt: null }, now), status).toBe(false);
  });
  it("a sold car stays visible 14 days, then disappears", () => {
    expect(isPubliclyVisible({ status: "SOLD", soldAt: new Date(now.getTime() - 13 * DAY) }, now)).toBe(true);
    expect(isPubliclyVisible({ status: "SOLD", soldAt: new Date(now.getTime() - 15 * DAY) }, now)).toBe(false);
    expect(isPubliclyVisible({ status: "SOLD", soldAt: null }, now)).toBe(false);
  });
  it("buyers can only write about cars still for sale", () => {
    expect(isContactable("PUBLISHED")).toBe(true);
    expect(isContactable("RESERVED")).toBe(true);
    expect(isContactable("SOLD")).toBe(false);
    expect(isContactable("DRAFT")).toBe(false);
  });
  it("publishing needs make, model, a price and a photo", () => {
    expect(publishProblems({ make: "Peugeot", model: "208", price: 30_000_000 }, 1)).toEqual([]);
    expect(publishProblems({ make: " ", model: "", price: null }, 0)).toEqual(["make", "model", "price", "photo"]);
    expect(publishProblems({ make: "Kia", model: "Rio", price: 0 }, 3)).toEqual(["price"]);
  });
});

describe("public address", () => {
  it("readable slug ending with the number, accents removed", () => {
    expect(listingSlug({ number: 12, make: "Citroën", model: "C3 Aircross", version: "Shine", year: 2019 })).toBe("citroen-c3-aircross-shine-2019-12");
    expect(listingSlug({ number: 7, make: "تويوتا", model: "", year: null })).toBe("7");
    expect(slugify("  Mercedes-Benz  Classe A!! ")).toBe("mercedes-benz-classe-a");
  });
  it("only the trailing number is used to find the listing", () => {
    expect(numberFromSlug("citroen-c3-2019-12")).toBe(12);
    expect(numberFromSlug("12")).toBe(12);
    expect(numberFromSlug("old-name-12")).toBe(12);
    for (const bad of ["", "abc", "12abc", "-0", "0", "1;drop", "99999999999"]) expect(numberFromSlug(bad), bad).toBe(null);
    expect(listingNumber(7)).toBe("ANN-0007");
  });
});

describe("history events (price / mileage)", () => {
  const base = { make: "Peugeot", model: "208", price: 30_000_000, mileage: 80_000, colorExt: "Blanc", equipment: ["GPS"] };
  it("a price change gives one PRICE_CHANGED line with before and after", () => {
    expect(listingChangeEvents(base, { ...base, price: 28_500_000 })).toEqual([{ type: "PRICE_CHANGED", before: { price: 30_000_000 }, after: { price: 28_500_000 } }]);
  });
  it("a mileage change gives MILEAGE_CHANGED; other fields one UPDATED line listing only what changed", () => {
    const events = listingChangeEvents(base, { ...base, mileage: 81_000, colorExt: "Noir", equipment: ["GPS", "Toit ouvrant"] });
    expect(events.map((e) => e.type)).toEqual(["MILEAGE_CHANGED", "UPDATED"]);
    expect(events[0]).toEqual({ type: "MILEAGE_CHANGED", before: { mileage: 80_000 }, after: { mileage: 81_000 } });
    expect(Object.keys(events[1]!.after!)).toEqual(["colorExt", "equipment"]);
  });
  it("nothing changed → no history line", () => {
    expect(listingChangeEvents(base, { ...base })).toEqual([]);
  });
});

describe("source of each fact", () => {
  const listing = { make: "Peugeot", model: "208", year: 2019, fuel: "DIESEL", mileage: 84_000 };
  const garage = {
    mileage: { km: 84_000, at: new Date("2026-09-01T09:00:00Z"), ref: "OR-0042" },
    vehicle: { make: "PEUGEOT", model: "208", year: 2019, fuel: "DIESEL" },
  };
  it("mileage is 'verified by the garage' only when it equals the garage's own reading", () => {
    expect(computeFacts(listing, garage).mileage).toEqual({ source: "GARAGE", ref: "OR-0042", at: "2026-09-01" });
    expect(computeFacts({ ...listing, mileage: 80_000 }, garage).mileage).toEqual({ source: "SELLER" });
  });
  it("without a linked vehicle, everything is declared by the seller", () => {
    const f = computeFacts(listing, { mileage: null, vehicle: null });
    expect(Object.values(f).every((x) => x?.source === "SELLER")).toBe(true);
  });
  it("identity, year and fuel compared with the garage's vehicle file", () => {
    const f = computeFacts({ ...listing, year: 2020 }, garage);
    expect(f.identity?.source).toBe("GARAGE");
    expect(f.fuel?.source).toBe("GARAGE");
    expect(f.year?.source).toBe("SELLER");
  });
  it("stored JSON is read defensively", () => {
    expect(readFacts(null)).toEqual({});
    expect(readFacts({ mileage: { source: "HACK" }, year: { source: "GARAGE", ref: 3 } })).toEqual({ year: { source: "GARAGE" } });
  });
});

describe("forms", () => {
  it("equipment: one per line, bullets removed, no duplicates", () => {
    expect(parseEquipment("- GPS\n• Climatisation\n\ngps\n  Caméra de recul ")).toEqual(["GPS", "Climatisation", "Caméra de recul"]);
  });
  it("specs: 'label : value' lines only", () => {
    expect(parseSpecs("Couple : 250 Nm\nsans deux-points\n: vide\nCoffre: 380 L")).toEqual([
      { label: "Couple", value: "250 Nm" },
      { label: "Coffre", value: "380 L" },
    ]);
  });
  it("listing form: price in dinars → millimes, bad values refused", () => {
    const ok = listingSchema.parse({ make: "Kia", model: "Picanto", price: "32 500", year: "2021", mileage: "", fuel: "ESSENCE", equipment: "GPS", historyPublic: "on" });
    expect(ok.price).toBe(32_500_000);
    expect(ok.mileage).toBeUndefined();
    expect(ok.equipment).toEqual(["GPS"]);
    expect(listingSchema.safeParse({ make: "Kia", model: "Rio", fuel: "WOOD" }).success).toBe(false);
    expect(listingSchema.safeParse({ make: "", model: "Rio" }).success).toBe(false);
    expect(listingSchema.safeParse({ make: "Kia", model: "Rio", year: "1800" }).success).toBe(false);
  });
  it("textarea line breaks (CRLF from the browser) are stored as LF: re-saving is not a change", () => {
    const v = listingSchema.parse({ make: "Kia", model: "Rio", description: "Ligne 1\r\nLigne 2", historySummary: "a\r\nb" });
    expect(v.description).toBe("Ligne 1\nLigne 2");
    expect(v.historySummary).toBe("a\nb");
  });
  it("buyer contact: a phone or an e-mail is required, the honeypot must stay empty", () => {
    expect(buyerContactSchema.safeParse({ name: "Sami", message: "Toujours dispo ?" }).success).toBe(false);
    expect(buyerContactSchema.safeParse({ name: "Sami", phone: "20 111 222", message: "Toujours dispo ?" }).success).toBe(true);
    expect(buyerContactSchema.safeParse({ name: "Sami", email: "s@x.tn", message: "Bonjour" }).success).toBe(true);
    expect(buyerContactSchema.safeParse({ name: "Sami", email: "s@x.tn", message: "Bonjour", website: "http://spam" }).success).toBe(false);
  });
  it("messages: plain text, control characters removed, 1 to 2000 characters", () => {
    expect(messageSchema.parse({ body: "  Bonjour\u0007 <b>ok</b>  " }).body).toBe("Bonjour <b>ok</b>");
    expect(messageSchema.safeParse({ body: "   " }).success).toBe(false);
    expect(messageSchema.safeParse({ body: "x".repeat(2001) }).success).toBe(false);
  });
});

describe("public search query", () => {
  it("keeps valid filters, ignores the rest", () => {
    const q = parseShowroomQuery({ make: "Peugeot", priceMax: "40 000", yearMin: "2018", fuel: "DIESEL", gearbox: "ROBOT", sort: "priceAsc", page: "2", kmMax: "-5" });
    expect(q).toMatchObject({ make: "Peugeot", priceMax: 40_000, yearMin: 2018, fuel: "DIESEL", sort: "priceAsc", page: 2 });
    expect(q.gearbox).toBeUndefined();
    expect(q.kmMax).toBeUndefined();
    expect(parseShowroomQuery({}).sort).toBe("recent");
    expect(parseShowroomQuery({ page: "0" }).page).toBe(1);
  });
  it("favourites: listing numbers only", () => {
    expect(parseShowroomQuery({ ids: "12,peugeot-208-7,abc,0" }).numbers).toEqual([12, 7]);
  });
});
