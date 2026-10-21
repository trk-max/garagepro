import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buyerContactSchema, listingSchema } from "@/lib/showroom-validators";
import {
  buyerReply,
  canSeeConversation,
  conversationForToken,
  conversationIdForToken,
  getConversation,
  inboxVersion,
  listConversations,
  markReadByBuyer,
  markReadByStaff,
  setConversationStatus,
  staffReply,
  startConversation,
  unreadForStaff,
} from "@/server/messaging";
import { createListing, setListingStatus } from "@/server/showroom";
import { makeUser, prisma } from "./helpers/db";

let n = 0;
const ip = () => `10.9.${Date.now() % 250}.${n++}`;
const contact = (name = "Sami") => buyerContactSchema.parse({ name, phone: "20 111 222", message: "Toujours disponible ?" });

async function publishedListing(seller: Awaited<ReturnType<typeof makeUser>>) {
  const l = await createListing(seller, listingSchema.parse({ make: "Kia", model: "Rio", price: "30000" }));
  await prisma.listingMedia.create({ data: { listingId: l.id, kind: "PHOTO", storageKey: `listings/${l.id}/${Math.random().toString(36).slice(2)}.jpg`, contentType: "image/jpeg", size: 1, isCover: true } });
  await setListingStatus(seller, l.id, "PUBLISHED");
  return l;
}

describe("Messaging — buyer private link", () => {
  it("the token is stored hashed and opens only its own conversation", async () => {
    const seller = await makeUser("SELLER");
    const l = await publishedListing(seller);
    const a = await startConversation(l.number, contact("Acheteur A"), { ip: ip() });
    const b = await startConversation(l.number, contact("Acheteur B"), { ip: ip() });

    const row = await prisma.conversation.findUniqueOrThrow({ where: { id: a.conversationId } });
    expect(row.buyerTokenHash).toBe(createHash("sha256").update(a.token).digest("hex"));
    expect(JSON.stringify(row)).not.toContain(a.token);

    const seenA = await conversationForToken(a.token, { ip: ip() });
    expect(seenA?.id).toBe(a.conversationId);
    expect(seenA?.buyerName).toBe("Acheteur A");
    expect(JSON.stringify(seenA)).not.toContain("Acheteur B");
    expect((await conversationForToken(b.token, { ip: ip() }))?.id).toBe(b.conversationId);

    // Guessed / malformed tokens: nothing.
    expect(await conversationForToken("x".repeat(32), { ip: ip() })).toBeNull();
    expect(await conversationForToken("../../etc", { ip: ip() })).toBeNull();
    expect(await conversationIdForToken(a.token.slice(0, -1) + (a.token.endsWith("A") ? "B" : "A"))).toBeNull();
  });

  it("wrong tokens are blocked after 30 tries from the same address", async () => {
    const from = ip();
    for (let i = 0; i < 30; i++) expect(await conversationForToken(`bad${i}`.padEnd(32, "z"), { ip: from })).toBeNull();
    const seller = await makeUser("SELLER");
    const l = await publishedListing(seller);
    const ok = await startConversation(l.number, contact(), { ip: ip() });
    expect(await conversationForToken(ok.token, { ip: from })).toBeNull(); // blocked address
    expect(await conversationForToken(ok.token, { ip: ip() })).not.toBeNull();
  });

  it("only cars still for sale can be contacted; 5 new conversations per address and hour", async () => {
    const seller = await makeUser("SELLER");
    const draft = await createListing(seller, listingSchema.parse({ make: "Kia", model: "Ceed", price: "1" }));
    const { number: draftNumber } = await prisma.listing.findUniqueOrThrow({ where: { id: draft.id } });
    await expect(startConversation(draftNumber, contact(), { ip: ip() })).rejects.toMatchObject({ code: "notFound" });

    const sold = await publishedListing(seller);
    await setListingStatus(seller, sold.id, "SOLD");
    await expect(startConversation(sold.number, contact(), { ip: ip() })).rejects.toMatchObject({ code: "listingNotContactable" });

    const l = await publishedListing(seller);
    const from = ip();
    for (let i = 0; i < 5; i++) await startConversation(l.number, contact(), { ip: from });
    await expect(startConversation(l.number, contact(), { ip: from })).rejects.toMatchObject({ code: "tooMany" });
  });
});

describe("Messaging — isolation between sellers", () => {
  it("another seller cannot list, read, answer, close or watch the conversation; the manager and the admin can", async () => {
    const [s1, s2, manager, admin, reception] = await Promise.all([makeUser("SELLER"), makeUser("SELLER"), makeUser("SHOWROOM_MANAGER"), makeUser("ADMIN"), makeUser("RECEPTION")]);
    const l = await publishedListing(s1);
    const c = await startConversation(l.number, contact(), { ip: ip() });

    expect(await getConversation(s2, c.conversationId)).toBeNull();
    expect((await listConversations(s2)).map((x) => x.id)).not.toContain(c.conversationId);
    expect(await canSeeConversation(s2, c.conversationId)).toBe(false);
    await expect(staffReply(s2, c.conversationId, "Je prends")).rejects.toMatchObject({ code: "notFound" });
    await expect(setConversationStatus(s2, c.conversationId, "CLOSED")).rejects.toMatchObject({ code: "notFound" });
    await markReadByStaff(s2, c.conversationId); // no effect outside the scope
    expect(await unreadForStaff(s1)).toBe(1);
    await expect(staffReply(reception, c.conversationId, "x")).rejects.toMatchObject({ code: "forbidden" });
    expect(await getConversation(reception, c.conversationId)).toBeNull();

    expect((await getConversation(s1, c.conversationId))?.id).toBe(c.conversationId);
    expect((await listConversations(manager)).map((x) => x.id)).toContain(c.conversationId);
    expect(await canSeeConversation(admin, c.conversationId)).toBe(true);
  });

  it("when a listing is given to another seller, its conversations follow it", async () => {
    const [s1, s2, manager] = await Promise.all([makeUser("SELLER"), makeUser("SELLER"), makeUser("SHOWROOM_MANAGER")]);
    const l = await publishedListing(s1);
    const c = await startConversation(l.number, contact(), { ip: ip() });
    await prisma.listing.update({ where: { id: l.id }, data: { sellerId: s2.id } });
    expect(await getConversation(s1, c.conversationId)).toBeNull();
    expect(await getConversation(s2, c.conversationId)).not.toBeNull();
    expect(await canSeeConversation(manager, c.conversationId)).toBe(true);
  });
});

describe("Messaging — unread counts and read marks", () => {
  it("buyer messages count as unread for their seller until opened; staff messages until the buyer opens the link", async () => {
    const [s1, s2] = await Promise.all([makeUser("SELLER"), makeUser("SELLER")]);
    const l = await publishedListing(s1);
    const c = await startConversation(l.number, contact(), { ip: ip() });
    expect(await unreadForStaff(s1)).toBe(1);
    expect(await unreadForStaff(s2)).toBe(0);

    const first = await buyerReply(c.token, "Et le prix est négociable ?", { ip: ip() });
    expect(first.notifyStaffId).toBeNull(); // the seller was already told about the first unread message
    expect(await unreadForStaff(s1)).toBe(2);
    expect((await listConversations(s1, { unread: true })).find((x) => x.id === c.conversationId)?.unread).toBe(2);

    const before = await inboxVersion(s1);
    await markReadByStaff(s1, c.conversationId);
    expect(await unreadForStaff(s1)).toBe(0);
    expect(await inboxVersion(s1)).not.toBe(before);

    const r = await staffReply(s1, c.conversationId, "Oui, passez quand vous voulez.");
    expect(r.notifyBuyer).toMatchObject({ phone: "20 111 222" });
    const again = await staffReply(s1, c.conversationId, "Samedi matin ?");
    expect(again.notifyBuyer).toBeNull(); // the first answer is not read yet: no second SMS / e-mail
    const staffMsgs = () => prisma.message.findMany({ where: { conversationId: c.conversationId, authorKind: "STAFF" } });
    expect((await staffMsgs()).every((m) => m.readByBuyerAt === null)).toBe(true);
    await markReadByBuyer(c.conversationId);
    expect((await staffMsgs()).every((m) => m.readByBuyerAt !== null)).toBe(true);

    const next = await buyerReply(c.token, "Parfait", { ip: ip() });
    expect(next.notifyStaffId).toBe(s1.id); // nothing unread before: the seller is told
  });

  it("a closed conversation refuses new messages from both sides", async () => {
    const s1 = await makeUser("SELLER");
    const l = await publishedListing(s1);
    const c = await startConversation(l.number, contact(), { ip: ip() });
    await setConversationStatus(s1, c.conversationId, "CLOSED");
    await expect(buyerReply(c.token, "Allo ?", { ip: ip() })).rejects.toMatchObject({ code: "conversationClosed" });
    await expect(staffReply(s1, c.conversationId, "Bonjour")).rejects.toMatchObject({ code: "conversationClosed" });
  });
});
