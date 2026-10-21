/**
 * Showroom demo cars: 6 PUBLISHED listings, clearly marked as demo, with photos from public/site.
 * Photos go through the SAME storage as a showroom upload (src/server/storage.ts): ./storage/listings/<id>/…
 * on the garage PC, or the private Supabase bucket when SUPABASE_STORAGE_BUCKET (+ URL, key) is set.
 * Idempotent: a demo car already there is skipped. Run from the project folder:
 *   node --env-file=.env scripts/seed-showroom-demo.mjs --seller-email=admin@garage.tn
 *   node --env-file=.env scripts/seed-showroom-demo.mjs --remove     (deletes exactly the demo listings + files)
 * Marker: description ends with « Annonce de démonstration — à supprimer » AND specs contain
 * { label: "Annonce", value: "Démonstration (DEMO-n)" }. Both are required to touch a listing.
 */
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export const DEMO_NOTE = "Annonce de démonstration — à supprimer";
const SPEC_LABEL = "Annonce";
const specValue = (key) => `Démonstration (${key})`;
const DT = (v) => Math.round(v * 1000);
const PHOTOS = ["galerie/01-turbo.jpg", "galerie/02-studio.jpg", "galerie/03-arriere-or.jpg", "galerie/04-phare.jpg", "galerie/05-roue.jpg", "galerie/06-arriere.jpg", "hero.jpg", "band.jpg", "about.jpg"];

const CARS = [
  { key: "DEMO-1", make: "Peugeot", model: "208", version: "1.2 PureTech Active", year: 2020, mileage: 58000, fuel: "ESSENCE", gearbox: "MANUAL", engineCc: 1199, powerHp: 82, fiscalHp: 5, doors: 5, seats: 5, colorExt: "Blanc nacré", colorInt: "Tissu gris", condition: "EXCELLENT", price: 52500, equipment: ["Climatisation", "Écran tactile 7\"", "Bluetooth", "Régulateur de vitesse", "Radar de recul"] },
  { key: "DEMO-2", make: "Volkswagen", model: "Golf 7", version: "1.6 TDI Comfortline", year: 2017, mileage: 124000, fuel: "DIESEL", gearbox: "MANUAL", engineCc: 1598, powerHp: 110, fiscalHp: 7, doors: 5, seats: 5, colorExt: "Gris carbone", colorInt: "Tissu noir", condition: "GOOD", price: 68000, equipment: ["Climatisation automatique", "Jantes alliage 16\"", "Radar avant/arrière", "Apple CarPlay"] },
  { key: "DEMO-3", make: "Kia", model: "Picanto", version: "1.0 MPI", year: 2021, mileage: 32000, fuel: "ESSENCE", gearbox: "MANUAL", engineCc: 998, powerHp: 67, fiscalHp: 4, doors: 5, seats: 4, colorExt: "Rouge", colorInt: "Tissu noir", condition: "EXCELLENT", price: 41900, equipment: ["Climatisation", "Vitres électriques", "Bluetooth", "Fermeture centralisée"] },
  { key: "DEMO-4", make: "Hyundai", model: "i20", version: "1.2 Comfort", year: 2019, mileage: 71000, fuel: "ESSENCE", gearbox: "MANUAL", engineCc: 1248, powerHp: 84, fiscalHp: 5, doors: 5, seats: 5, colorExt: "Bleu nuit", colorInt: "Tissu gris", condition: "GOOD", price: 46500, equipment: ["Climatisation", "Caméra de recul", "Volant multifonction"] },
  { key: "DEMO-5", make: "Renault", model: "Clio 5", version: "1.0 TCe Intens", year: 2022, mileage: 24000, fuel: "ESSENCE", gearbox: "MANUAL", engineCc: 999, powerHp: 90, fiscalHp: 5, doors: 5, seats: 5, colorExt: "Orange Valencia", colorInt: "Tissu noir", condition: "EXCELLENT", price: 63000, equipment: ["Climatisation automatique", "Écran 9.3\" GPS", "Caméra de recul", "Feux LED", "Carte mains libres"] },
  { key: "DEMO-6", make: "Toyota", model: "Yaris", version: "1.5 Hybride Dynamic", year: 2021, mileage: 45000, fuel: "HYBRID", gearbox: "AUTOMATIC", engineCc: 1490, powerHp: 116, fiscalHp: 6, doors: 5, seats: 5, colorExt: "Gris platine", colorInt: "Tissu noir", condition: "EXCELLENT", price: 74000, equipment: ["Boîte automatique", "Climatisation automatique", "Aide au maintien de voie", "Caméra de recul", "Apple CarPlay / Android Auto"] },
];

const args = process.argv.slice(2);
const arg = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const REMOVE = args.includes("--remove");

// ── Storage: same rules as src/server/storage.ts ────────────────────────────
const ROOT = path.join(process.cwd(), "storage");
const sb = () => {
  const bucket = process.env.SUPABASE_STORAGE_BUCKET, url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return bucket && url && key ? { bucket, url: url.replace(/\/$/, ""), key } : null;
};
const localPath = (key) => {
  const full = path.join(ROOT, key);
  if (!full.startsWith(ROOT + path.sep)) throw new Error("Invalid storage key");
  return full;
};
async function putObject(key, body, contentType) {
  const s = sb();
  if (s) {
    const res = await fetch(`${s.url}/storage/v1/object/${s.bucket}/${key}`, { method: "POST", headers: { Authorization: `Bearer ${s.key}`, apikey: s.key, "Content-Type": contentType, "x-upsert": "false" }, body: new Uint8Array(body) });
    if (!res.ok) throw new Error(`Supabase Storage upload failed: ${res.status} ${await res.text()}`);
    return;
  }
  await mkdir(path.dirname(localPath(key)), { recursive: true });
  await writeFile(localPath(key), body);
}
async function deleteObject(key) {
  const s = sb();
  if (s) await fetch(`${s.url}/storage/v1/object/${s.bucket}`, { method: "DELETE", headers: { Authorization: `Bearer ${s.key}`, apikey: s.key, "Content-Type": "application/json" }, body: JSON.stringify({ prefixes: [key] }) });
  await rm(localPath(key), { force: true });
}

// ── Demo listings ───────────────────────────────────────────────────────────
const isDemo = (l) =>
  typeof l.description === "string" && l.description.includes(DEMO_NOTE) && Array.isArray(l.specs) && l.specs.some((s) => s?.label === SPEC_LABEL && String(s?.value ?? "").startsWith("Démonstration (DEMO-"));
const keyOf = (l) => l.specs.find((s) => s?.label === SPEC_LABEL)?.value.slice("Démonstration (".length, -1);

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL manquant : lancez avec node --env-file=.env …");
  if (!existsSync(path.join(process.cwd(), "package.json"))) throw new Error("Lancez le script depuis le dossier du projet (stockage ./storage).");
  const prisma = new PrismaClient();
  try {
    const candidates = await prisma.listing.findMany({ where: { description: { contains: DEMO_NOTE } }, include: { media: true } });
    const demos = candidates.filter(isDemo);
    if (REMOVE) return await remove(prisma, demos);

    const email = arg("seller-email")?.trim().toLowerCase();
    if (!email) throw new Error("--seller-email=<e-mail d'un compte ADMIN ou SHOWROOM_MANAGER> est obligatoire.");
    const seller = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true, role: true, isActive: true } });
    if (!seller || !seller.isActive || !["ADMIN", "SHOWROOM_MANAGER"].includes(seller.role)) throw new Error(`${email} : compte actif ADMIN ou SHOWROOM_MANAGER introuvable.`);
    const actor = { actorId: seller.id, actorName: `${seller.name} (script démo)` };
    const existing = new Set(demos.map(keyOf));
    let created = 0;
    for (const [i, car] of CARS.entries()) {
      if (existing.has(car.key)) { console.log(`= ${car.key} ${car.make} ${car.model} : déjà présente`); continue; }
      const { key, price, ...fields } = car;
      const now = new Date();
      const listing = await prisma.listing.create({
        data: {
          ...fields, price: DT(price), sellerId: seller.id, createdById: seller.id, status: "PUBLISHED", publishedAt: now, statusChangedAt: now,
          description: `${car.make} ${car.model} ${car.version}, ${car.year}, entretenue. Visible sur rendez-vous au garage. ${DEMO_NOTE}.`,
          specs: [{ label: SPEC_LABEL, value: specValue(key) }, { label: "Première main", value: i % 2 ? "Non" : "Oui" }],
          // No workshop vehicle linked: every fact is "declared by the seller" (same as computeFacts without records).
          facts: { mileage: { source: "SELLER" }, identity: { source: "SELLER" }, year: { source: "SELLER" }, fuel: { source: "SELLER" } },
          events: { create: [{ type: "CREATED", after: { make: car.make, model: car.model, price: DT(price), mileage: car.mileage, sellerId: seller.id, demo: true }, ...actor }, { type: "STATUS_CHANGED", before: { status: "DRAFT" }, after: { status: "PUBLISHED" }, ...actor }] },
        },
        select: { id: true, number: true },
      });
      const files = [0, 1, 2].map((k) => PHOTOS[(i * 2 + k) % PHOTOS.length]);
      for (const [pos, file] of files.entries()) {
        const bytes = readFileSync(path.join(process.cwd(), "public/site", file));
        if (!(bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)) throw new Error(`${file} n'est pas un JPEG`);
        const storageKey = `listings/${listing.id}/${randomBytes(12).toString("base64url")}.jpg`;
        await putObject(storageKey, bytes, "image/jpeg");
        const media = await prisma.listingMedia.create({ data: { listingId: listing.id, kind: "PHOTO", storageKey, contentType: "image/jpeg", size: bytes.length, caption: pos === 0 ? `${car.make} ${car.model}` : null, position: pos, isCover: pos === 0, isPublic: true, uploadedById: seller.id }, select: { id: true } });
        await prisma.listingEvent.create({ data: { listingId: listing.id, type: "PHOTO_ADDED", after: { mediaId: media.id, demo: true }, ...actor } });
      }
      await prisma.auditLog.create({ data: { actorId: seller.id, actorName: actor.actorName, action: "listing.create", entity: "Listing", entityId: listing.id, after: { number: listing.number, make: car.make, model: car.model, demo: key } } });
      created++;
      console.log(`+ ${key} ANN-${String(listing.number).padStart(4, "0")} ${car.make} ${car.model} (${files.length} photos)`);
    }
    console.log(`${created} annonce(s) de démonstration créée(s), ${CARS.length - created} déjà présente(s).`);
  } finally {
    await prisma.$disconnect();
  }
}

async function remove(prisma, demos) {
  let files = 0, conversations = 0;
  for (const l of demos) {
    const convs = await prisma.conversation.findMany({ where: { listingId: l.id }, select: { id: true } });
    await prisma.$transaction(async (tx) => {
      await tx.message.deleteMany({ where: { conversationId: { in: convs.map((c) => c.id) } } });
      await tx.conversation.deleteMany({ where: { listingId: l.id } });
      await tx.listingEvent.deleteMany({ where: { listingId: l.id } });
      await tx.listingMedia.deleteMany({ where: { listingId: l.id } });
      await tx.listing.delete({ where: { id: l.id } });
      await tx.auditLog.create({ data: { actorName: "Script démo showroom", action: "listing.demoRemove", entity: "Listing", entityId: l.id, before: { number: l.number, make: l.make, model: l.model, demo: keyOf(l) } } });
    });
    for (const m of l.media) { await deleteObject(m.storageKey).catch((e) => console.error(`fichier non supprimé ${m.storageKey}`, e.message)); files++; }
    conversations += convs.length;
    console.log(`- ${keyOf(l)} ANN-${String(l.number).padStart(4, "0")} ${l.make} ${l.model}`);
  }
  console.log(`${demos.length} annonce(s) de démonstration supprimée(s) (${files} fichier(s), ${conversations} conversation(s)).`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
