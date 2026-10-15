import { PrismaClient, type Customer, type LineType, type User, type Vehicle } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomInt } from "node:crypto";
import { demoSeedRefusal } from "./seed-guard";

const prisma = new PrismaClient();
const DT = (v: number) => Math.round(v * 1000); // dinars → millimes
const Q = (v: number) => Math.round(v * 100); // quantity ×100

async function main() {
  // Demo data uses the shared password "password123": never in production or on Supabase by accident.
  const refusal = demoSeedRefusal(process.env);
  if (refusal) throw new Error(refusal);
  const passwordHash = await bcrypt.hash("password123", 12);

  const users = await Promise.all(
    [
      { email: "admin@garage.tn", name: "Malek (Admin)", role: "ADMIN" as const },
      { email: "accueil@garage.tn", name: "Sonia Accueil", role: "RECEPTION" as const },
      { email: "karim@garage.tn", name: "Karim Mécanicien", role: "MECHANIC" as const },
      { email: "hedi@garage.tn", name: "Hédi Mécanicien", role: "MECHANIC" as const },
      { email: "stock@garage.tn", name: "Ali Magasinier", role: "STOREKEEPER" as const },
    ].map((u) => prisma.user.upsert({ where: { email: u.email }, update: {}, create: { ...u, passwordHash } })),
  );
  const [admin, reception, mech1, mech2, storekeeper] = users as [User, User, User, User, User];

  await prisma.setting.upsert({
    where: { id: "garage" },
    update: {},
    create: {
      id: "garage",
      garageName: "Garage Atlas",
      address: "Zone industrielle, Ben Arous",
      phone: "+216 71 000 000",
      taxId: "1234567/A/M/000",
      laborRate: DT(35),
      defaultTaxBp: 1900,
      stampDuty: DT(1),
      invoiceFooter: "RIB : 00 000 0000000000000 00",
    },
  });

  if ((await prisma.part.count()) === 0) await seedWorkshop(admin, reception, mech1, mech2);
  await seedSuppliers(admin, storekeeper);
  await seedPortal(mech1);
  console.log("Seeded. Sign in with admin@garage.tn / password123 (also accueil@, karim@, hedi@, stock@).");
  const demo = await prisma.workOrder.findFirst({ where: { trackingPin: { not: null }, status: { notIn: ["DELIVERED", "CANCELLED"] } }, include: { vehicle: true }, orderBy: { number: "asc" } });
  if (demo) console.log(`Customer tracking demo: http://localhost:3000/suivi  →  plate ${demo.vehicle.plate}  code ${demo.trackingPin}`);
}

async function seedWorkshop(admin: User, reception: User, mech1: User, mech2: User) {

  const partsData = [
    { sku: "HUI-5W30-5L", name: "Huile moteur 5W30 5L", brand: "Total", cost: 62, sale: 85, stock: 12, min: 4, unit: "bidon" },
    { sku: "FLT-HUI-208", name: "Filtre à huile", brand: "Purflux", cost: 9, sale: 16, stock: 20, min: 5, unit: "pce" },
    { sku: "FLT-AIR-208", name: "Filtre à air", brand: "Mann", cost: 14, sale: 24, stock: 8, min: 3, unit: "pce" },
    { sku: "FLT-HAB", name: "Filtre habitacle", brand: "Bosch", cost: 12, sale: 22, stock: 2, min: 3, unit: "pce" },
    { sku: "PLQ-AV-208", name: "Plaquettes de frein AV", brand: "Brembo", cost: 70, sale: 115, stock: 6, min: 2, unit: "jeu" },
    { sku: "DSQ-AV-208", name: "Disques de frein AV", brand: "Brembo", cost: 150, sale: 230, stock: 2, min: 2, unit: "paire" },
    { sku: "BAT-70AH", name: "Batterie 70Ah", brand: "Varta", cost: 260, sale: 340, stock: 3, min: 1, unit: "pce" },
    { sku: "BOU-ALL-4", name: "Bougies d'allumage (x4)", brand: "NGK", cost: 40, sale: 64, stock: 0, min: 2, unit: "jeu" },
    { sku: "LIQ-REF-5L", name: "Liquide de refroidissement 5L", brand: "Motul", cost: 28, sale: 42, stock: 5, min: 2, unit: "bidon" },
    { sku: "KIT-DIS-208", name: "Kit distribution", brand: "Gates", cost: 320, sale: 450, stock: 1, min: 1, unit: "kit" },
  ];
  const parts = Object.fromEntries(
    await Promise.all(
      partsData.map(async (p) => {
        const part = await prisma.part.create({
          data: {
            sku: p.sku, name: p.name, brand: p.brand, unit: p.unit,
            costPrice: DT(p.cost), salePrice: DT(p.sale), stockX100: Q(p.stock), minStockX100: Q(p.min),
            movements: { create: { deltaX100: Q(p.stock), reason: "PURCHASE", note: "Stock initial", actorId: admin.id } },
          },
        });
        return [p.sku, part] as const;
      }),
    ),
  );

  const pkgs: { name: string; description: string; lines: { type: LineType; description: string; qty: number; sku?: string }[] }[] = [
    {
      name: "Vidange complète",
      description: "Huile + filtres huile/air",
      lines: [
        { type: "PART", description: "Huile moteur 5W30 5L", qty: 1, sku: "HUI-5W30-5L" },
        { type: "PART", description: "Filtre à huile", qty: 1, sku: "FLT-HUI-208" },
        { type: "PART", description: "Filtre à air", qty: 1, sku: "FLT-AIR-208" },
        { type: "LABOR", description: "Main d'œuvre vidange", qty: 0.5 },
      ],
    },
    {
      name: "Freinage avant",
      description: "Plaquettes + disques AV",
      lines: [
        { type: "PART", description: "Plaquettes de frein AV", qty: 1, sku: "PLQ-AV-208" },
        { type: "PART", description: "Disques de frein AV", qty: 1, sku: "DSQ-AV-208" },
        { type: "LABOR", description: "Remplacement freinage AV", qty: 1.5 },
      ],
    },
    {
      name: "Diagnostic électronique",
      description: "Lecture valise + rapport",
      lines: [{ type: "LABOR", description: "Diagnostic valise", qty: 1 }],
    },
  ];
  for (const pkg of pkgs) {
    await prisma.servicePackage.create({
      data: {
        name: pkg.name,
        description: pkg.description,
        lines: {
          create: pkg.lines.map((l, i) => ({
            type: l.type,
            description: l.description,
            quantityX100: Q(l.qty),
            partId: l.sku ? parts[l.sku]!.id : null,
            position: i,
          })),
        },
      },
    });
  }

  const customers = [
    { name: "Sarra Ben Ali", phone: "+21620111222", vehicle: { plate: "215TU8841", make: "Peugeot", model: "208", year: 2019, fuel: "ESSENCE" as const, mileage: 78500 } },
    { name: "Mohamed Trabelsi", phone: "+21655333444", vehicle: { plate: "198TU1203", make: "Volkswagen", model: "Golf 7", year: 2016, fuel: "DIESEL" as const, mileage: 162000 } },
    { name: "Société Carthage Logistique", phone: "+21671999888", taxId: "7654321/B/A/000", vehicle: { plate: "230TU4410", make: "Renault", model: "Kangoo", year: 2021, fuel: "DIESEL" as const, mileage: 54000 } },
    { name: "Nour Haddad", phone: "+21698765432", vehicle: { plate: "205TU7777", make: "Kia", model: "Picanto", year: 2018, fuel: "ESSENCE" as const, mileage: 91000 } },
  ];
  const created: (Customer & { vehicles: Vehicle[] })[] = [];
  for (const c of customers) {
    created.push(
      await prisma.customer.create({
        data: { name: c.name, phone: c.phone, taxId: c.taxId, vehicles: { create: c.vehicle } },
        include: { vehicles: true },
      }),
    );
  }

  const wo = async (
    i: number,
    status: "RECEIVED" | "IN_PROGRESS" | "READY" | "DIAGNOSIS",
    complaint: string,
    mechanicId: string | null,
    lines: { type: LineType; description: string; qty: number; price: number; sku?: string }[],
  ) => {
    const customer = created[i]!;
    const vehicle = customer.vehicles[0]!;
    const order = await prisma.workOrder.create({
      data: {
        status,
        complaint,
        customerId: customer.id,
        vehicleId: vehicle.id,
        mechanicId,
        createdById: reception.id,
        mileageIn: vehicle.mileage,
        promisedAt: new Date(Date.now() + 86_400_000),
        events: { create: [{ type: "CREATED", actorId: reception.id }] },
        lines: {
          create: lines.map((l, idx) => ({
            type: l.type,
            description: l.description,
            quantityX100: Q(l.qty),
            unitPrice: DT(l.price),
            partId: l.sku ? parts[l.sku]!.id : null,
            position: idx,
          })),
        },
      },
    });
    for (const l of lines) {
      if (!l.sku) continue;
      await prisma.part.update({ where: { id: parts[l.sku]!.id }, data: { stockX100: { decrement: Q(l.qty) } } });
      await prisma.stockMovement.create({ data: { partId: parts[l.sku]!.id, deltaX100: -Q(l.qty), reason: "WORK_ORDER", workOrderId: order.id, actorId: mechanicId } });
    }
    return order;
  };

  await wo(0, "READY", "Vidange + bruit au freinage", mech1.id, [
    { type: "PART", description: "Huile moteur 5W30 5L (Total)", qty: 1, price: 85, sku: "HUI-5W30-5L" },
    { type: "PART", description: "Filtre à huile (Purflux)", qty: 1, price: 16, sku: "FLT-HUI-208" },
    { type: "PART", description: "Plaquettes de frein AV (Brembo)", qty: 1, price: 115, sku: "PLQ-AV-208" },
    { type: "LABOR", description: "Vidange + remplacement plaquettes", qty: 1.5, price: 35 },
  ]);
  await wo(1, "IN_PROGRESS", "Voyant moteur allumé, perte de puissance", mech2.id, [
    { type: "LABOR", description: "Diagnostic valise", qty: 1, price: 35 },
  ]);
  await wo(2, "DIAGNOSIS", "Climatisation ne refroidit plus", mech1.id, []);
  await wo(3, "RECEIVED", "Révision 90 000 km", null, []);

}

/** Suppliers, a storekeeper request waiting for the admin, and an unpaid supplier invoice. */
async function seedSuppliers(admin: User, storekeeper: User) {
  if ((await prisma.supplier.count()) > 0) return;

  const [autoParts, lubs] = await Promise.all([
    prisma.supplier.create({
      data: { name: "Tunisie Auto Pièces", contact: "M. Riadh", phone: "+216 71 222 333", email: "commandes@tap.tn", address: "Route de Sousse, Mégrine", taxId: "1111111/C/M/000" },
    }),
    prisma.supplier.create({
      data: { name: "Lubrifiants du Sahel", contact: "Mme Amel", phone: "+216 73 444 555", address: "Sousse" },
    }),
  ]);

  const parts = await prisma.part.findMany();
  const bySku = new Map(parts.map((p) => [p.sku, p]));
  for (const p of parts) {
    await prisma.part.update({ where: { id: p.id }, data: { defaultSupplierId: p.sku.startsWith("HUI") || p.sku.startsWith("LIQ") ? lubs.id : autoParts.id } });
  }

  const year = new Date().getFullYear();
  await prisma.sequence.upsert({ where: { key: `BC-${year}` }, create: { key: `BC-${year}`, value: 1 }, update: {} });
  const bougies = bySku.get("BOU-ALL-4");
  const habitacle = bySku.get("FLT-HAB");
  if (bougies && habitacle) {
    await prisma.purchaseOrder.create({
      data: {
        number: `BC${year}-0001`,
        supplierId: autoParts.id,
        status: "PENDING_APPROVAL",
        requestedById: storekeeper.id,
        notes: "Rupture bougies + filtre habitacle sous le seuil.",
        lines: {
          create: [
            { partId: bougies.id, quantityX100: Q(4), unitCost: bougies.costPrice, position: 0 },
            { partId: habitacle.id, quantityX100: Q(6), unitCost: habitacle.costPrice, position: 1 },
          ],
        },
      },
    });
  }

  const issuedAt = new Date(Date.now() - 40 * 86_400_000);
  await prisma.supplierInvoice.create({
    data: {
      number: "FA-7781",
      supplierId: lubs.id,
      issuedAt,
      dueDate: new Date(issuedAt.getTime() + 30 * 86_400_000),
      totalHt: DT(620),
      totalTax: DT(117.8),
      totalTtc: DT(737.8),
      notes: `Saisie par ${admin.name}`,
    },
  });
}

/** Bookable services, tracking codes for orders that have none, and a few appointments. */
async function seedPortal(mech: User) {
  // Every open order gets a 4-digit code (orders created before this version had none).
  const withoutPin = await prisma.workOrder.findMany({ where: { trackingPin: null }, select: { id: true } });
  for (const w of withoutPin) {
    await prisma.workOrder.update({ where: { id: w.id }, data: { trackingPin: String(randomInt(0, 10_000)).padStart(4, "0") } });
  }

  if ((await prisma.bookableService.count()) === 0) {
    const services = [
      { name: "Vidange & filtres", nameAr: "تغيير الزيت والفلاتر", description: "Huile moteur, filtre à huile et filtre à air", descriptionAr: "زيت المحرك وفلتر الزيت وفلتر الهواء", durationMin: 45, priceFrom: DT(150) },
      { name: "Révision générale", nameAr: "مراجعة شاملة", description: "Contrôle complet selon le carnet constructeur", descriptionAr: "فحص كامل حسب دفتر الصانع", durationMin: 120, priceFrom: DT(280) },
      { name: "Diagnostic électronique", nameAr: "تشخيص إلكتروني", description: "Lecture des codes défaut à la valise", descriptionAr: "قراءة رموز الأعطال بالجهاز", durationMin: 30, priceFrom: DT(40) },
      { name: "Freinage", nameAr: "الفرامل", description: "Plaquettes, disques, liquide de frein", descriptionAr: "الوسادات والأقراص وسائل الفرامل", durationMin: 90, priceFrom: DT(180) },
      { name: "Climatisation", nameAr: "المكيّف", description: "Recharge et contrôle d'étanchéité", descriptionAr: "تعبئة الغاز وفحص التسرّب", durationMin: 60, priceFrom: DT(120) },
      { name: "Réparation spécifique", nameAr: "إصلاح خاص", description: "Décrivez le problème, nous établissons un devis", descriptionAr: "صفوا المشكلة وسنعدّ تقديرًا", durationMin: 60, priceFrom: null },
    ];
    for (const [i, svc] of services.entries()) await prisma.bookableService.create({ data: { ...svc, position: i } });
  }

  if ((await prisma.appointment.count()) === 0) {
    const services = await prisma.bookableService.findMany({ orderBy: { position: "asc" } });
    // Tomorrow (or Monday if tomorrow is Sunday), garage time.
    const local = new Date(Date.now() + 86_400_000 + 3_600_000);
    if (local.getUTCDay() === 0) local.setUTCDate(local.getUTCDate() + 1);
    const day = local.toISOString().slice(0, 10);
    const at = (hhmm: string) => new Date(`${day}T${hhmm}:00+01:00`); // Tunisia = UTC+1, no DST
    const samples = [
      { time: "08:30", svc: 0, firstName: "Amine", lastName: "Jaziri", phone: "+21622333444", plate: "220TU1505", make: "Renault", model: "Clio 4" },
      { time: "09:00", svc: 3, firstName: "Leila", lastName: "Mansour", phone: "+21655777888", plate: "198TU1203", make: "Volkswagen", model: "Golf 7", mechanicId: mech.id },
      { time: "10:30", svc: 2, firstName: "Yassine", lastName: "Gharbi", phone: "+21698111000", plate: "231TU9001", make: "Hyundai", model: "i20" },
    ];
    for (const [i, a] of samples.entries()) {
      const svc = services[a.svc]!;
      const startAt = at(a.time);
      const vehicle = await prisma.vehicle.findUnique({ where: { plate: a.plate }, select: { id: true, customerId: true } });
      await prisma.appointment.create({
        data: {
          reference: `RDV-DEMO${i + 1}`,
          serviceId: svc.id,
          startAt,
          endAt: new Date(startAt.getTime() + svc.durationMin * 60_000),
          firstName: a.firstName,
          lastName: a.lastName,
          phone: a.phone,
          plate: a.plate,
          make: a.make,
          model: a.model,
          mechanicId: a.mechanicId,
          vehicleId: vehicle?.id,
          customerId: vehicle?.customerId,
        },
      });
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
