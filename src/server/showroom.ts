import "server-only";
import type { Prisma, Role } from "@prisma/client";
import { createId } from "@/lib/id";
import { displayPlate, woNumber } from "@/lib/format";
import { AppError } from "@/lib/http";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import type { StaffUser } from "@/lib/session";
import {
  canMoveListing,
  computeFacts,
  isPubliclyVisible,
  listingChangeEvents,
  listingNumber,
  publicWhere,
  publishProblems,
  type GarageMileage,
  type GarageVehicle,
  type ListingEventDraft,
  type ListingStatus,
  type ShowroomQuery,
} from "@/lib/showroom";
import type { ListingInput } from "@/lib/showroom-validators";
import { audit } from "@/server/audit";
import { MAX_PHOTO_BYTES, deleteObject, putObject, sniffMedia } from "@/server/storage";

/**
 * Showroom (V9, Prompt 5/5): listings of vehicles for sale.
 * - ADMIN and SHOWROOM_MANAGER (manageAllListings) manage every listing;
 * - SELLER (createListing) creates listings and manages ONLY their own (sellerId);
 * - MANAGER and RECEPTION (viewShowroom) only look.
 * Every check is done here, on the server, whatever the page shows. Every change writes the
 * listing history (ListingEvent) and, for the important ones, the audit journal — in the same transaction.
 */

type Db = Prisma.TransactionClient | typeof prisma;

export const MAX_PHOTOS = 30;
export const MAX_DOCUMENTS = 10;
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
/** Roles a listing can be assigned to. */
export const SELLER_ROLES: Role[] = ["ADMIN", "SHOWROOM_MANAGER", "SELLER"];
/** Listings still "in progress" for a vehicle (a second one would be a duplicate). */
const ACTIVE: ListingStatus[] = ["DRAFT", "PUBLISHED", "RESERVED", "UNAVAILABLE"];

// ── Rights ──────────────────────────────────────────────────────────────────

/** May this team member change this listing? Admin / showroom manager: all; seller: their own only. */
export function canEditListing(actor: Pick<StaffUser, "id" | "role">, listing: { sellerId: string }): boolean {
  if (can(actor, "manageAllListings")) return true;
  return can(actor, "createListing") && listing.sellerId === actor.id;
}

function assertView(actor: StaffUser) {
  if (!can(actor, "viewShowroom")) throw new AppError("forbidden", {}, 403);
}

async function loadForEdit(db: Db, actor: StaffUser, listingId: string) {
  const listing = await db.listing.findUnique({ where: { id: listingId } });
  if (!listing) throw new AppError("notFound", {}, 404);
  // Same answer as "not found" would leak nothing more: the seller already sees the inventory.
  if (!canEditListing(actor, listing)) throw new AppError("forbidden", {}, 403);
  return listing;
}

const actorOf = (a: StaffUser) => ({ id: a.id, name: a.name });

async function writeEvents(db: Db, listingId: string, actor: StaffUser, events: ListingEventDraft[]) {
  for (const e of events) {
    await db.listingEvent.create({
      data: {
        listingId,
        type: e.type,
        before: e.before === undefined ? undefined : (e.before as Prisma.InputJsonValue),
        after: e.after === undefined ? undefined : (e.after as Prisma.InputJsonValue),
        actorId: actor.id,
        actorName: actor.name,
      },
    });
  }
}

// ── Garage records of a linked vehicle (the only "verified" facts) ──────────

/**
 * What the garage itself recorded about a vehicle: its file (make, model, year, fuel) and the last
 * mileage READ BY THE GARAGE — at check-in on a repair order, or from the car's OBD odometer
 * (real adapter reading, confirmed). Simulated OBD readings never count.
 */
export async function garageRecords(db: Db, vehicleId: string | null): Promise<{ mileage: GarageMileage; vehicle: GarageVehicle }> {
  if (!vehicleId) return { mileage: null, vehicle: null };
  const [vehicle, wo, reading] = await Promise.all([
    db.vehicle.findUnique({ where: { id: vehicleId }, select: { make: true, model: true, year: true, fuel: true } }),
    db.workOrder.findFirst({
      where: { vehicleId, mileageIn: { not: null }, status: { not: "CANCELLED" } },
      orderBy: { createdAt: "desc" },
      select: { number: true, mileageIn: true, createdAt: true },
    }),
    db.vehicleReading.findFirst({
      where: { vehicleId, source: "ADAPTER", odometerStatus: "APPLIED", odometerKm: { not: null } },
      orderBy: { recordedAt: "desc" },
      select: { odometerKm: true, recordedAt: true },
    }),
  ]);
  const candidates: NonNullable<GarageMileage>[] = [];
  if (wo?.mileageIn != null) candidates.push({ km: wo.mileageIn, at: wo.createdAt, ref: woNumber(wo.number) });
  if (reading?.odometerKm != null) candidates.push({ km: reading.odometerKm, at: reading.recordedAt, ref: "OBD" });
  candidates.sort((a, b) => b.at.getTime() - a.at.getTime());
  return {
    mileage: candidates[0] ?? null,
    vehicle: vehicle ? { make: vehicle.make, model: vehicle.model, year: vehicle.year, fuel: vehicle.fuel } : null,
  };
}

/** A plate typed on the listing links it to the garage's vehicle file when the plate is known. */
async function vehicleIdForPlate(db: Db, plate: string | undefined | null): Promise<string | null> {
  if (!plate) return null;
  const v = await db.vehicle.findUnique({ where: { plate }, select: { id: true } });
  return v?.id ?? null;
}

async function assertNoDuplicate(db: Db, exceptId: string | null, vehicleId: string | null, plate: string | null) {
  if (!vehicleId && !plate) return;
  const other = await db.listing.findFirst({
    where: {
      status: { in: ACTIVE },
      ...(exceptId ? { id: { not: exceptId } } : {}),
      OR: [...(vehicleId ? [{ vehicleId }] : []), ...(plate ? [{ plate }] : [])],
    },
    select: { number: true },
  });
  if (other) throw new AppError("listingDuplicate", { number: listingNumber(other.number) }, 409);
}

async function resolveSeller(db: Db, actor: StaffUser, requested: string | undefined, current: string | null): Promise<string> {
  if (!requested || !can(actor, "manageAllListings")) return current ?? actor.id;
  const user = await db.user.findUnique({ where: { id: requested }, select: { role: true, isActive: true } });
  if (!user || !user.isActive || !SELLER_ROLES.includes(user.role)) throw new AppError("invalid", {}, 422);
  return requested;
}

function dataOf(input: ListingInput) {
  return {
    make: input.make,
    model: input.model,
    version: input.version ?? null,
    year: input.year ?? null,
    mileage: input.mileage ?? null,
    fuel: input.fuel ?? null,
    gearbox: input.gearbox ?? null,
    engineCc: input.engineCc ?? null,
    powerHp: input.powerHp ?? null,
    fiscalHp: input.fiscalHp ?? null,
    doors: input.doors ?? null,
    seats: input.seats ?? null,
    colorExt: input.colorExt ?? null,
    colorInt: input.colorInt ?? null,
    condition: input.condition ?? null,
    price: input.price ?? null,
    description: input.description ?? null,
    equipment: input.equipment,
    specs: input.specs,
    historySummary: input.historySummary ?? null,
    // Nothing to publish without a summary.
    historyPublic: input.historyPublic && !!input.historySummary,
    plate: input.plate ?? null,
    vin: input.vin ?? null,
  };
}

// ── Create / edit ───────────────────────────────────────────────────────────

export async function createListing(actor: StaffUser, input: ListingInput) {
  if (!can(actor, "createListing")) throw new AppError("forbidden", {}, 403);
  return prisma.$transaction(async (tx) => {
    const data = dataOf(input);
    const vehicleId = await vehicleIdForPlate(tx, data.plate);
    await assertNoDuplicate(tx, null, vehicleId, data.plate);
    const sellerId = await resolveSeller(tx, actor, input.sellerId, null);
    const facts = computeFacts(data, await garageRecords(tx, vehicleId));
    const listing = await tx.listing.create({
      data: { ...data, vehicleId, sellerId, createdById: actor.id, facts: facts as Prisma.InputJsonValue },
      select: { id: true, number: true },
    });
    await writeEvents(tx, listing.id, actor, [{ type: "CREATED", after: { make: data.make, model: data.model, price: data.price, mileage: data.mileage, sellerId } }]);
    await audit(tx, actorOf(actor), "listing.create", "Listing", listing.id, { after: { number: listing.number, make: data.make, model: data.model, sellerId } });
    return listing;
  });
}

export async function updateListing(actor: StaffUser, listingId: string, input: ListingInput) {
  return prisma.$transaction(async (tx) => {
    const before = await loadForEdit(tx, actor, listingId);
    const data = dataOf(input);
    const vehicleId = await vehicleIdForPlate(tx, data.plate);
    await assertNoDuplicate(tx, listingId, vehicleId, data.plate);
    const sellerId = await resolveSeller(tx, actor, input.sellerId, before.sellerId);
    const facts = computeFacts(data, await garageRecords(tx, vehicleId));
    await tx.listing.update({ where: { id: listingId }, data: { ...data, vehicleId, sellerId, facts: facts as Prisma.InputJsonValue } });
    const events = listingChangeEvents(before as unknown as Record<string, unknown>, { ...data, vehicleId });
    if (sellerId !== before.sellerId) events.push({ type: "SELLER_CHANGED", before: { sellerId: before.sellerId }, after: { sellerId } });
    await writeEvents(tx, listingId, actor, events);
    if (events.some((e) => e.type === "PRICE_CHANGED" || e.type === "SELLER_CHANGED")) {
      await audit(tx, actorOf(actor), "listing.update", "Listing", listingId, {
        before: { price: before.price, sellerId: before.sellerId },
        after: { price: data.price, sellerId },
      });
    }
    return { id: listingId, changes: events.length };
  });
}

/**
 * Status change, checked against the allowed moves (lib/showroom.ts). Publishing needs a price,
 * a make, a model and at least one public photo. Two people clicking at once: only one wins.
 */
export async function setListingStatus(actor: StaffUser, listingId: string, to: string) {
  return prisma.$transaction(async (tx) => {
    const listing = await loadForEdit(tx, actor, listingId);
    if (!canMoveListing(listing.status, to)) throw new AppError("listingTransition", {}, 409);
    if (to === "PUBLISHED") {
      const photos = await tx.listingMedia.count({ where: { listingId, kind: "PHOTO", isPublic: true } });
      const missing = publishProblems(listing, photos);
      if (missing.length) throw new AppError("listingIncomplete", { missing: missing.join(",") }, 422);
    }
    if (to === "PUBLISHED" || to === "RESERVED") {
      // Re-publishing a car that is already listed again elsewhere would make a public duplicate.
      await assertNoDuplicate(tx, listingId, listing.vehicleId, listing.plate);
    }
    const now = new Date();
    const moved = await tx.listing.updateMany({
      where: { id: listingId, status: listing.status },
      data: {
        status: to,
        statusChangedAt: now,
        ...(to === "PUBLISHED" && !listing.publishedAt ? { publishedAt: now } : {}),
        ...(to === "SOLD" ? { soldAt: now } : listing.status === "SOLD" ? { soldAt: null } : {}),
      },
    });
    if (moved.count !== 1) throw new AppError("listingTransition", {}, 409);
    await writeEvents(tx, listingId, actor, [{ type: "STATUS_CHANGED", before: { status: listing.status }, after: { status: to } }]);
    await audit(tx, actorOf(actor), "listing.status", "Listing", listingId, { before: { status: listing.status }, after: { status: to } });
    return { from: listing.status, to };
  });
}

// ── Photos and documents (existing storage: ./storage or Supabase bucket) ───

export class ListingFileError extends Error {
  constructor(public readonly reason: "type" | "limit", public readonly max: number) {
    super(reason);
  }
}

/** JPEG / PNG / WEBP photo, or PDF document — detected from the bytes, never from the browser. */
export function sniffListingFile(bytes: Buffer): { kind: "PHOTO" | "DOCUMENT"; contentType: string; ext: string } | null {
  if (bytes.length >= 5 && bytes.toString("ascii", 0, 5) === "%PDF-") return { kind: "DOCUMENT", contentType: "application/pdf", ext: "pdf" };
  const media = sniffMedia(bytes);
  return media?.kind === "PHOTO" ? { kind: "PHOTO", contentType: media.contentType, ext: media.ext } : null;
}

export async function addListingMedia(actor: StaffUser, listingId: string, file: { bytes: Buffer; caption?: string }) {
  await loadForEdit(prisma, actor, listingId);
  const type = sniffListingFile(file.bytes);
  const maxBytes = type?.kind === "DOCUMENT" ? MAX_DOCUMENT_BYTES : MAX_PHOTO_BYTES;
  if (!type || file.bytes.length > maxBytes) throw new ListingFileError("type", maxBytes / 1024 / 1024);
  const max = type.kind === "PHOTO" ? MAX_PHOTOS : MAX_DOCUMENTS;
  if ((await prisma.listingMedia.count({ where: { listingId, kind: type.kind } })) >= max) throw new ListingFileError("limit", max);

  const storageKey = `listings/${listingId}/${createId()}.${type.ext}`;
  await putObject(storageKey, file.bytes, type.contentType);
  try {
    return await prisma.$transaction(async (tx) => {
      const agg = await tx.listingMedia.aggregate({ where: { listingId }, _max: { position: true } });
      const hasCover = type.kind === "PHOTO" && (await tx.listingMedia.count({ where: { listingId, isCover: true } })) > 0;
      const media = await tx.listingMedia.create({
        data: {
          listingId,
          kind: type.kind,
          storageKey,
          contentType: type.contentType,
          size: file.bytes.length,
          caption: file.caption ?? null,
          position: (agg._max.position ?? -1) + 1,
          isCover: type.kind === "PHOTO" && !hasCover,
          // Documents stay private until the team decides to show them.
          isPublic: type.kind === "PHOTO",
          uploadedById: actor.id,
        },
        select: { id: true, kind: true },
      });
      await writeEvents(tx, listingId, actor, [{ type: type.kind === "PHOTO" ? "PHOTO_ADDED" : "DOCUMENT_ADDED", after: { mediaId: media.id, caption: file.caption ?? null } }]);
      await tx.listing.update({ where: { id: listingId }, data: { updatedAt: new Date() } });
      return media;
    });
  } catch (error) {
    await deleteObject(storageKey).catch(() => {}); // never keep a file without its row
    throw error;
  }
}

export type MediaPatch = { isPublic?: boolean; caption?: string | null; cover?: true; move?: "up" | "down" };

export async function updateListingMedia(actor: StaffUser, mediaId: string, patch: MediaPatch) {
  const media = await prisma.listingMedia.findUnique({ where: { id: mediaId } });
  if (!media) throw new AppError("notFound", {}, 404);
  await loadForEdit(prisma, actor, media.listingId);
  return prisma.$transaction(async (tx) => {
    if (patch.cover) {
      if (media.kind !== "PHOTO") throw new AppError("invalid", {}, 422);
      await tx.listingMedia.updateMany({ where: { listingId: media.listingId, isCover: true }, data: { isCover: false } });
      await tx.listingMedia.update({ where: { id: mediaId }, data: { isCover: true, isPublic: true } });
    }
    if (patch.isPublic !== undefined) await tx.listingMedia.update({ where: { id: mediaId }, data: { isPublic: patch.isPublic } });
    if (patch.caption !== undefined) await tx.listingMedia.update({ where: { id: mediaId }, data: { caption: patch.caption } });
    if (patch.move) {
      const siblings = await tx.listingMedia.findMany({ where: { listingId: media.listingId, kind: media.kind }, orderBy: [{ position: "asc" }, { createdAt: "asc" }], select: { id: true } });
      const i = siblings.findIndex((s) => s.id === mediaId);
      const j = patch.move === "up" ? i - 1 : i + 1;
      if (i >= 0 && j >= 0 && j < siblings.length) {
        [siblings[i], siblings[j]] = [siblings[j]!, siblings[i]!];
        for (const [position, s] of siblings.entries()) await tx.listingMedia.update({ where: { id: s.id }, data: { position } });
      }
    }
    await tx.listing.update({ where: { id: media.listingId }, data: { updatedAt: new Date() } });
    return media.listingId;
  });
}

export async function removeListingMedia(actor: StaffUser, mediaId: string) {
  const media = await prisma.listingMedia.findUnique({ where: { id: mediaId } });
  if (!media) throw new AppError("notFound", {}, 404);
  await loadForEdit(prisma, actor, media.listingId);
  await prisma.$transaction(async (tx) => {
    await tx.listingMedia.delete({ where: { id: mediaId } });
    if (media.isCover) {
      const next = await tx.listingMedia.findFirst({ where: { listingId: media.listingId, kind: "PHOTO" }, orderBy: { position: "asc" }, select: { id: true } });
      if (next) await tx.listingMedia.update({ where: { id: next.id }, data: { isCover: true } });
    }
    await writeEvents(tx, media.listingId, actor, [{ type: "MEDIA_REMOVED", before: { mediaId, kind: media.kind, caption: media.caption } }]);
    await tx.listing.update({ where: { id: media.listingId }, data: { updatedAt: new Date() } });
  });
  await deleteObject(media.storageKey).catch((e) => console.error("[showroom] file not removed", e));
  return media.listingId;
}

/**
 * A draft of the public history summary, from the linked vehicle's DELIVERED repair orders:
 * month, mileage and the work done (line labels). No customer name, no price, no complaint text.
 * It is only a draft: the team reads it, edits it, and decides to publish it or not.
 */
export async function historyDraft(actor: StaffUser, listingId: string): Promise<string> {
  const listing = await loadForEdit(prisma, actor, listingId);
  if (!listing.vehicleId) return "";
  const orders = await prisma.workOrder.findMany({
    where: { vehicleId: listing.vehicleId, status: "DELIVERED" },
    orderBy: { deliveredAt: "asc" },
    take: 40,
    select: { deliveredAt: true, createdAt: true, mileageIn: true, lines: { where: { type: { in: ["LABOR", "PART"] } }, orderBy: { position: "asc" }, select: { description: true } } },
  });
  return orders
    .map((o) => {
      const d = o.deliveredAt ?? o.createdAt;
      const month = `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
      const km = o.mileageIn != null ? ` — ${o.mileageIn.toLocaleString("fr-FR")} km` : "";
      const work = [...new Set(o.lines.map((l) => l.description.trim()).filter(Boolean))].slice(0, 8).join(", ");
      return `${month}${km}${work ? ` : ${work}` : ""}`;
    })
    .join("\n");
}

// ── Staff reading ───────────────────────────────────────────────────────────

export type StaffListingFilter = { status?: string; mine?: boolean; q?: string };

export async function listStaffListings(actor: StaffUser, filter: StaffListingFilter = {}) {
  assertView(actor);
  const q = filter.q?.trim();
  const rows = await prisma.listing.findMany({
    where: {
      ...(filter.status ? { status: filter.status } : { status: { not: "ARCHIVED" } }),
      ...(filter.mine ? { sellerId: actor.id } : {}),
      ...(q
        ? {
            OR: [
              { make: { contains: q, mode: "insensitive" as const } },
              { model: { contains: q, mode: "insensitive" as const } },
              { plate: { contains: q.replace(/[\s-]/g, "").toUpperCase() } },
              ...(/^\d+$/.test(q) ? [{ number: Number(q) }] : []),
            ],
          }
        : {}),
    },
    orderBy: [{ updatedAt: "desc" }],
    take: 300,
    select: {
      id: true, number: true, make: true, model: true, version: true, year: true, mileage: true, price: true, status: true, sellerId: true, plate: true, updatedAt: true,
      media: { where: { kind: "PHOTO", isCover: true }, take: 1, select: { id: true } },
      _count: { select: { media: true } },
    },
  });
  const sellers = await sellerNames(rows.map((r) => r.sellerId));
  return rows.map((r) => ({ ...r, coverId: r.media[0]?.id ?? null, sellerName: sellers.get(r.sellerId) ?? "—", canEdit: canEditListing(actor, r) }));
}

async function sellerNames(ids: string[]) {
  const users = await prisma.user.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, name: true } });
  return new Map(users.map((u) => [u.id, u.name]));
}

export async function getStaffListing(actor: StaffUser, listingId: string) {
  assertView(actor);
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    include: {
      media: { orderBy: [{ kind: "asc" }, { position: "asc" }, { createdAt: "asc" }] },
      events: { orderBy: { createdAt: "desc" }, take: 100 },
    },
  });
  if (!listing) return null;
  const [sellers, vehicle] = await Promise.all([
    sellerNames([listing.sellerId]),
    listing.vehicleId ? prisma.vehicle.findUnique({ where: { id: listing.vehicleId }, select: { id: true, plate: true, make: true, model: true } }) : null,
  ]);
  return { ...listing, sellerName: sellers.get(listing.sellerId) ?? "—", vehicle, canEdit: canEditListing(actor, listing) };
}

export async function listSellers() {
  return prisma.user.findMany({ where: { isActive: true, role: { in: SELLER_ROLES } }, orderBy: { name: "asc" }, select: { id: true, name: true, role: true } });
}

export async function showroomCounts() {
  const rows = await prisma.listing.groupBy({ by: ["status"], _count: { _all: true } });
  return Object.fromEntries(rows.map((r) => [r.status, r._count._all])) as Partial<Record<ListingStatus, number>>;
}

// ── Public site (only PUBLISHED / RESERVED, and SOLD for 14 days) ───────────

/** Fields that may leave the server for the public site. Never: plate, VIN, vehicleId, internal ids of staff. */
const PUBLIC_SELECT = {
  id: true, number: true, make: true, model: true, version: true, year: true, mileage: true, fuel: true, gearbox: true,
  engineCc: true, powerHp: true, fiscalHp: true, doors: true, seats: true, colorExt: true, colorInt: true, condition: true,
  price: true, status: true, soldAt: true, publishedAt: true, facts: true,
} as const;

export const PUBLIC_PAGE_SIZE = 12;

export async function listPublicListings(query: ShowroomQuery, now = new Date()) {
  const where: Prisma.ListingWhereInput = {
    AND: [
      publicWhere(now),
      ...(query.make ? [{ make: { equals: query.make, mode: "insensitive" as const } }] : []),
      ...(query.q
        ? [{ OR: [{ make: { contains: query.q, mode: "insensitive" as const } }, { model: { contains: query.q, mode: "insensitive" as const } }, { version: { contains: query.q, mode: "insensitive" as const } }] }]
        : []),
      ...(query.priceMin != null ? [{ price: { gte: query.priceMin * 1000 } }] : []),
      ...(query.priceMax != null ? [{ price: { lte: query.priceMax * 1000 } }] : []),
      ...(query.yearMin != null ? [{ year: { gte: query.yearMin } }] : []),
      ...(query.yearMax != null ? [{ year: { lte: query.yearMax } }] : []),
      ...(query.kmMax != null ? [{ mileage: { lte: query.kmMax } }] : []),
      ...(query.fuel ? [{ fuel: query.fuel }] : []),
      ...(query.gearbox ? [{ gearbox: query.gearbox }] : []),
      ...(query.numbers ? [{ number: { in: query.numbers } }] : []),
    ],
  };
  const orderBy: Prisma.ListingOrderByWithRelationInput[] =
    query.sort === "priceAsc"
      ? [{ price: { sort: "asc", nulls: "last" } }]
      : query.sort === "priceDesc"
        ? [{ price: { sort: "desc", nulls: "last" } }]
        : query.sort === "kmAsc"
          ? [{ mileage: { sort: "asc", nulls: "last" } }]
          : query.sort === "yearDesc"
            ? [{ year: { sort: "desc", nulls: "last" } }]
            : [{ publishedAt: { sort: "desc", nulls: "last" } }];
  const [total, rows] = await Promise.all([
    prisma.listing.count({ where }),
    prisma.listing.findMany({
      where,
      orderBy: [...orderBy, { number: "desc" }],
      skip: (query.page - 1) * PUBLIC_PAGE_SIZE,
      take: PUBLIC_PAGE_SIZE,
      select: { ...PUBLIC_SELECT, media: { where: { kind: "PHOTO", isPublic: true }, orderBy: [{ isCover: "desc" }, { position: "asc" }], take: 1, select: { id: true } } },
    }),
  ]);
  return { total, pages: Math.max(1, Math.ceil(total / PUBLIC_PAGE_SIZE)), rows: rows.map(({ media, ...r }) => ({ ...r, coverId: media[0]?.id ?? null })) };
}

export async function publicMakes(now = new Date()): Promise<string[]> {
  const rows = await prisma.listing.findMany({ where: publicWhere(now), distinct: ["make"], select: { make: true }, orderBy: { make: "asc" } });
  return rows.map((r) => r.make);
}

/** One public listing by its number, or null (draft, archived, unavailable, sold long ago, unknown). */
export async function getPublicListing(number: number, now = new Date()) {
  const listing = await prisma.listing.findFirst({
    where: { AND: [{ number }, publicWhere(now)] },
    select: {
      ...PUBLIC_SELECT,
      description: true, equipment: true, specs: true, historySummary: true, historyPublic: true, sellerId: true,
      media: { where: { isPublic: true }, orderBy: [{ isCover: "desc" }, { position: "asc" }, { createdAt: "asc" }], select: { id: true, kind: true, caption: true, contentType: true, size: true } },
    },
  });
  if (!listing || !isPubliclyVisible(listing, now)) return null;
  const seller = await prisma.user.findUnique({ where: { id: listing.sellerId }, select: { name: true } });
  const { historySummary, historyPublic, sellerId, ...rest } = listing;
  void sellerId;
  return { ...rest, historySummary: historyPublic ? historySummary : null, sellerName: seller?.name ?? null };
}

/** Same make first, then a similar price; still for sale only. */
export async function relatedListings(l: { id: string; make: string; price: number | null }, take = 4) {
  const near = l.price ? { price: { gte: Math.round(l.price * 0.75), lte: Math.round(l.price * 1.25) } } : {};
  const rows = await prisma.listing.findMany({
    where: { id: { not: l.id }, status: { in: ["PUBLISHED", "RESERVED"] }, OR: [{ make: { equals: l.make, mode: "insensitive" } }, near] },
    orderBy: { publishedAt: "desc" },
    take,
    select: { ...PUBLIC_SELECT, media: { where: { kind: "PHOTO", isPublic: true }, orderBy: [{ isCover: "desc" }, { position: "asc" }], take: 1, select: { id: true } } },
  });
  return rows.map(({ media, ...r }) => ({ ...r, coverId: media[0]?.id ?? null }));
}

/**
 * May this file be streamed? Staff who can see the showroom: every file. Public: only files marked
 * public, of a listing currently shown on the site.
 */
export async function listingMediaForViewer(mediaId: string, staff: StaffUser | null, now = new Date()) {
  const media = await prisma.listingMedia.findUnique({
    where: { id: mediaId },
    select: { storageKey: true, contentType: true, isPublic: true, kind: true, caption: true, listing: { select: { status: true, soldAt: true } } },
  });
  if (!media) return null;
  if (staff && can(staff, "viewShowroom")) return media;
  return media.isPublic && isPubliclyVisible(media.listing, now) ? media : null;
}

export const plateLabel = (plate: string | null) => (plate ? displayPlate(plate) : null);
