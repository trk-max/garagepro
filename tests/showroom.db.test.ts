import { describe, expect, it } from "vitest";
import { listingSchema } from "@/lib/showroom-validators";
import { createListing, getPublicListing, listPublicListings, listingMediaForViewer, setListingStatus, updateListing } from "@/server/showroom";
import { makeUser, makeWorkOrder, prisma } from "./helpers/db";

const input = (extra: Record<string, string> = {}) => listingSchema.parse({ make: "Peugeot", model: "208", year: "2019", mileage: "84000", price: "30000", fuel: "DIESEL", ...extra });

/** A public photo row (the file itself is not needed for these checks). */
async function addPhoto(listingId: string) {
  return prisma.listingMedia.create({ data: { listingId, kind: "PHOTO", storageKey: `listings/${listingId}/${Math.random().toString(36).slice(2)}.jpg`, contentType: "image/jpeg", size: 10, isCover: true } });
}

describe("Showroom — ownership", () => {
  it("a seller edits their own listing, not another seller's; the showroom manager and the admin can", async () => {
    const [s1, s2, manager, admin, reception] = await Promise.all([makeUser("SELLER"), makeUser("SELLER"), makeUser("SHOWROOM_MANAGER"), makeUser("ADMIN"), makeUser("RECEPTION")]);
    const l = await createListing(s1, input());
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: l.id } })).sellerId).toBe(s1.id);

    await expect(updateListing(s2, l.id, input({ price: "1" }))).rejects.toMatchObject({ code: "forbidden" });
    await expect(setListingStatus(s2, l.id, "ARCHIVED")).rejects.toMatchObject({ code: "forbidden" });
    await expect(createListing(reception, input({ plate: "999TU1" }))).rejects.toMatchObject({ code: "forbidden" });
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: l.id } })).price).toBe(30_000_000);

    await updateListing(s1, l.id, input({ price: "29000" }));
    await updateListing(manager, l.id, input({ price: "28500" }));
    await updateListing(admin, l.id, input({ price: "28000" }));
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: l.id } })).price).toBe(28_000_000);
  });

  it("a seller cannot give a listing to someone else; the manager can reassign it", async () => {
    const [s1, s2, manager] = await Promise.all([makeUser("SELLER"), makeUser("SELLER"), makeUser("SHOWROOM_MANAGER")]);
    const own = await createListing(s1, input({ sellerId: s2.id }));
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: own.id } })).sellerId).toBe(s1.id);
    await updateListing(manager, own.id, input({ sellerId: s2.id }));
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: own.id } })).sellerId).toBe(s2.id);
    const types = (await prisma.listingEvent.findMany({ where: { listingId: own.id } })).map((e) => e.type);
    expect(types).toContain("SELLER_CHANGED");
    // A mechanic cannot become the seller of a listing.
    const mech = await makeUser("MECHANIC");
    await expect(updateListing(manager, own.id, input({ sellerId: mech.id }))).rejects.toMatchObject({ code: "invalid" });
  });
});

describe("Showroom — history and statuses", () => {
  it("price and mileage changes are written with before and after, by whom", async () => {
    const s = await makeUser("SELLER");
    const l = await createListing(s, input());
    await updateListing(s, l.id, input({ price: "27500", mileage: "85000" }));
    const events = await prisma.listingEvent.findMany({ where: { listingId: l.id }, orderBy: { createdAt: "asc" } });
    expect(events.map((e) => e.type)).toEqual(["CREATED", "PRICE_CHANGED", "MILEAGE_CHANGED"]);
    expect(events[1]).toMatchObject({ before: { price: 30_000_000 }, after: { price: 27_500_000 }, actorId: s.id });
    expect(events[2]).toMatchObject({ before: { mileage: 84_000 }, after: { mileage: 85_000 } });
  });

  it("cannot publish without a photo; allowed moves only; sold sets the date", async () => {
    const s = await makeUser("SELLER");
    const l = await createListing(s, input());
    await expect(setListingStatus(s, l.id, "PUBLISHED")).rejects.toMatchObject({ code: "listingIncomplete", vars: { missing: "photo" } });
    await expect(setListingStatus(s, l.id, "SOLD")).rejects.toMatchObject({ code: "listingTransition" });
    await addPhoto(l.id);
    await setListingStatus(s, l.id, "PUBLISHED");
    await setListingStatus(s, l.id, "SOLD");
    const sold = await prisma.listing.findUniqueOrThrow({ where: { id: l.id } });
    expect(sold.status).toBe("SOLD");
    expect(sold.soldAt).not.toBeNull();
    expect(sold.publishedAt).not.toBeNull();
    // Sale cancelled: back on sale, the sold date is cleared.
    await setListingStatus(s, l.id, "PUBLISHED");
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: l.id } })).soldAt).toBeNull();
  });

  it("the same garage vehicle cannot have two active listings", async () => {
    const s = await makeUser("SELLER");
    const { vehicle } = await makeWorkOrder();
    const first = await createListing(s, input({ plate: vehicle.plate }));
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: first.id } })).vehicleId).toBe(vehicle.id);
    await expect(createListing(s, input({ plate: vehicle.plate }))).rejects.toMatchObject({ code: "listingDuplicate" });
    await setListingStatus(s, first.id, "ARCHIVED");
    await expect(createListing(s, input({ plate: vehicle.plate }))).resolves.toBeTruthy();
  });

  it("mileage is 'verified by the garage' when it equals the km read at check-in", async () => {
    const s = await makeUser("SELLER");
    const { vehicle, wo } = await makeWorkOrder();
    await prisma.workOrder.update({ where: { id: wo.id }, data: { mileageIn: 91_000 } });
    const verified = await createListing(s, input({ plate: vehicle.plate, mileage: "91000" }));
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: verified.id } })).facts).toMatchObject({ mileage: { source: "GARAGE" } });
    await updateListing(s, verified.id, input({ plate: vehicle.plate, mileage: "90000" }));
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: verified.id } })).facts).toMatchObject({ mileage: { source: "SELLER" } });
  });
});

describe("Showroom — public site", () => {
  it("a draft is never public, nor its photos; a published listing is, without internal fields", async () => {
    const s = await makeUser("SELLER");
    const l = await createListing(s, input({ plate: "123TU9876", vin: "VF3XXXXXXXXXXXXXX", historySummary: "Vidange 2025", make: "Zzdraft" }));
    const photo = await addPhoto(l.id);
    const { number } = await prisma.listing.findUniqueOrThrow({ where: { id: l.id } });

    expect(await getPublicListing(number)).toBeNull();
    expect((await listPublicListings({ make: "Zzdraft", sort: "recent", page: 1 })).total).toBe(0);
    expect(await listingMediaForViewer(photo.id, null)).toBeNull();
    expect(await listingMediaForViewer(photo.id, s)).not.toBeNull(); // staff sees it

    await setListingStatus(s, l.id, "PUBLISHED");
    const pub = await getPublicListing(number);
    expect(pub).not.toBeNull();
    const json = JSON.stringify(pub);
    expect(json).not.toContain("123TU9876");
    expect(json).not.toContain("VF3XXXXXXXXXXXXXX");
    expect(pub!.historySummary).toBeNull(); // not chosen for publication
    expect((await listPublicListings({ make: "Zzdraft", sort: "recent", page: 1 })).total).toBe(1);
    expect(await listingMediaForViewer(photo.id, null)).not.toBeNull();

    await setListingStatus(s, l.id, "UNAVAILABLE");
    expect(await getPublicListing(number)).toBeNull();
  });

  it("a sold listing stays 14 days then disappears", async () => {
    const s = await makeUser("SELLER");
    const l = await createListing(s, input({ make: "Zzsold" }));
    await addPhoto(l.id);
    await setListingStatus(s, l.id, "PUBLISHED");
    await setListingStatus(s, l.id, "SOLD");
    const { number, soldAt } = await prisma.listing.findUniqueOrThrow({ where: { id: l.id } });
    expect((await getPublicListing(number))?.status).toBe("SOLD");
    const later = new Date(soldAt!.getTime() + 15 * 86_400_000);
    expect(await getPublicListing(number, later)).toBeNull();
    expect((await listPublicListings({ make: "Zzsold", sort: "recent", page: 1 }, later)).total).toBe(0);
  });
});
