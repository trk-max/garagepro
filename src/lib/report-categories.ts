/**
 * Groups the customer's complaint ("ce que le client signale") into problem
 * families for the reports: brakes, engine, electrical… Keyword match in
 * French, Arabic (and Tunisian words) and English, accents ignored.
 * The first family that matches wins, so each work order counts once.
 */
export const PROBLEM_CATEGORIES = [
  "brakes",
  "cooling",
  "ac",
  "electrical",
  "transmission",
  "suspension",
  "tyres",
  "exhaust",
  "leak",
  "body",
  "service",
  "diagnostic",
  "engine",
  "other",
] as const;
export type ProblemCategory = (typeof PROBLEM_CATEGORIES)[number];

const KEYWORDS: Record<Exclude<ProblemCategory, "other">, string[]> = {
  brakes: ["frein", "plaquette", "disque", "etrier", "abs", "فرامل", "فران", "brake"],
  cooling: ["chauffe", "surchauffe", "radiateur", "refroidissement", "temperature", "ventilateur", "durite", "حرارة", "سخان", "overheat", "coolant"],
  ac: ["clim", "climatisation", "air conditionne", "مكيف", "كليماتيزور", "air con", "a/c"],
  electrical: ["batterie", "electri", "alternateur", "demarr", "demarre pas", "fusible", "phare", "ampoule", "vitre electrique", "بطارية", "كهرباء", "battery", "starter", "alternator"],
  transmission: ["boite", "embrayage", "vitesse", "transmission", "cardan", "قير", "فيتاس", "clutch", "gearbox"],
  suspension: ["suspension", "amortisseur", "rotule", "silent", "triangle", "cogne", "claque", "شوك", "amortis", "shock"],
  tyres: ["pneu", "roue", "direction", "parallelisme", "geometrie", "equilibrage", "vibration", "volant", "عجلة", "عجلات", "tyre", "tire", "steering", "alignment"],
  exhaust: ["echappement", "pot ", "catalyseur", "fap", "egr", "fumee", "شكمان", "exhaust"],
  leak: ["fuite", "goutte", "perd de l", "تسريب", "يقطر", "leak"],
  body: ["carrosserie", "rayure", "choc", "peinture", "pare-brise", "pare brise", "retroviseur", "طلاء", "دهان", "body", "scratch", "dent"],
  service: ["vidange", "huile", "entretien", "revision", "filtre", "courroie", "bougie", "زيت", "فيدونج", "oil", "service", "timing belt"],
  engine: ["moteur", "ralenti", "cale", "perte de puissance", "a-coup", "bruit moteur", "injecteur", "turbo", "محرك", "موتور", "engine", "misfire"],
  diagnostic: ["voyant", "diagnostic", "check engine", "code defaut", "valise", "ضوء", "warning light"],
};

/** Lowercase, without accents, for keyword matching. */
function fold(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function classifyComplaint(complaint: string): ProblemCategory {
  const text = ` ${fold(complaint)} `;
  for (const category of PROBLEM_CATEGORIES) {
    if (category === "other") continue;
    if (KEYWORDS[category].some((k) => text.includes(fold(k)))) return category;
  }
  return "other";
}
