import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { AppError } from "@/lib/http";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import type { StaffUser } from "@/lib/session";
import { isContactable, isPubliclyVisible, publicWhere } from "@/lib/showroom";
import type { BuyerContact } from "@/lib/showroom-validators";
import { isLimited, recordAttempt, reserveAttempt } from "@/server/rate-limit";

/**
 * Buyer messaging (V9, Prompt 5/5).
 * - A buyer has NO account: "Contacter le vendeur" opens a conversation and gives a private link
 *   /messages/<token>. The token (24 random bytes) is shown once; only its SHA-256 is stored, like a
 *   password. Whoever holds the link sees that ONE conversation, nothing else.
 * - Staff: ADMIN and SHOWROOM_MANAGER see every conversation; a SELLER only those of their own
 *   listings (or assigned to them). Everything is filtered here, in the database query.
 * - Public forms are rate-limited per IP (PortalAttempt), and each conversation per hour.
 */

export const START_PER_IP_PER_HOUR = 5;
export const REPLIES_PER_CONVERSATION_PER_HOUR = 30;
export const REPLIES_PER_IP_PER_HOUR = 60;
export const BAD_TOKENS_PER_IP_PER_HOUR = 30;

export const newBuyerToken = () => randomBytes(24).toString("base64url");
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
/** 24 bytes in base64url = 32 characters. Anything else is refused before touching the database. */
export const isTokenShape = (token: string) => /^[A-Za-z0-9_-]{32}$/.test(token);

/** Conversations this team member may see (and answer). */
export function conversationScope(actor: Pick<StaffUser, "id" | "role">): Prisma.ConversationWhereInput {
  if (can(actor.role, "readAllShowroomMessages")) return {};
  if (!can(actor.role, "useShowroomMessages")) return { id: "__none__" };
  return { OR: [{ listing: { sellerId: actor.id } }, { listingId: null, assignedToId: actor.id }] };
}

const vehicleLabel = (l: { make: string; model: string; year: number | null } | null) => (l ? [l.make, l.model, l.year].filter(Boolean).join(" ") : "");

// ── Buyer side (no account, private link) ───────────────────────────────────

/**
 * "Contacter le vendeur": opens a conversation on a listing still for sale. Returns the private
 * token ONCE (never stored in clear) and what is needed to notify people.
 */
export async function startConversation(listingNumber: number, input: BuyerContact, ctx: { ip: string }) {
  if (!(await reserveAttempt([{ key: `msg-start-ip:${ctx.ip}`, max: START_PER_IP_PER_HOUR }], 60, false))) throw new AppError("tooMany", {}, 429);
  const listing = await prisma.listing.findFirst({
    where: { AND: [{ number: listingNumber }, publicWhere()] },
    select: { id: true, number: true, make: true, model: true, year: true, status: true, soldAt: true, sellerId: true },
  });
  if (!listing || !isPubliclyVisible(listing)) throw new AppError("notFound", {}, 404);
  if (!isContactable(listing.status)) throw new AppError("listingNotContactable", {}, 409);

  const token = newBuyerToken();
  const conversation = await prisma.$transaction(async (tx) => {
    const c = await tx.conversation.create({
      data: {
        listingId: listing.id,
        buyerName: input.name,
        buyerPhone: input.phone ?? null,
        buyerEmail: input.email ?? null,
        buyerTokenHash: hashToken(token),
        assignedToId: listing.sellerId,
      },
      select: { id: true },
    });
    await tx.message.create({ data: { conversationId: c.id, authorKind: "BUYER", body: input.message } });
    return c;
  });
  return { token, conversationId: conversation.id, sellerId: listing.sellerId, vehicle: vehicleLabel(listing) };
}

/** The conversation behind a private link, or null. Wrong tokens are counted per IP (then refused). */
export async function conversationForToken(token: string, ctx: { ip: string }) {
  const key = `msg-token-ip:${ctx.ip}`;
  if (await isLimited(key, BAD_TOKENS_PER_IP_PER_HOUR, 60)) return null;
  const found = isTokenShape(token)
    ? await prisma.conversation.findUnique({
        where: { buyerTokenHash: hashToken(token) },
        select: {
          id: true, buyerName: true, status: true, createdAt: true,
          listing: { select: { number: true, make: true, model: true, version: true, year: true, price: true, status: true, soldAt: true, media: { where: { kind: "PHOTO", isPublic: true }, orderBy: [{ isCover: "desc" }, { position: "asc" }], take: 1, select: { id: true } } } },
          // The buyer sees the staff member's name as written when sending, never internal ids.
          messages: { orderBy: { createdAt: "asc" }, take: 500, select: { id: true, authorKind: true, authorName: true, body: true, createdAt: true, readByBuyerAt: true } },
        },
      })
    : null;
  if (!found) {
    await recordAttempt(key, false);
    return null;
  }
  const { listing, ...rest } = found;
  const visible = listing && isPubliclyVisible(listing);
  return {
    ...rest,
    listing: listing ? { number: listing.number, make: listing.make, model: listing.model, version: listing.version, year: listing.year, price: visible ? listing.price : null, status: listing.status, public: visible, coverId: visible ? (listing.media[0]?.id ?? null) : null } : null,
  };
}

/** Id of the conversation behind a token (live updates), without counting it as an attempt. */
export async function conversationIdForToken(token: string): Promise<string | null> {
  if (!isTokenShape(token)) return null;
  const c = await prisma.conversation.findUnique({ where: { buyerTokenHash: hashToken(token) }, select: { id: true } });
  return c?.id ?? null;
}

/** The buyer opened the page: the team's messages are now read. */
export async function markReadByBuyer(conversationId: string) {
  await prisma.message.updateMany({ where: { conversationId, authorKind: "STAFF", readByBuyerAt: null }, data: { readByBuyerAt: new Date() } });
}

/** Buyer answers from the private page. Returns whether the seller should be told (first unread message). */
export async function buyerReply(token: string, body: string, ctx: { ip: string }) {
  const id = await conversationIdForToken(token);
  if (!id) throw new AppError("notFound", {}, 404);
  const ok = await reserveAttempt(
    [
      { key: `msg-reply-conv:${id}`, max: REPLIES_PER_CONVERSATION_PER_HOUR },
      { key: `msg-reply-ip:${ctx.ip}`, max: REPLIES_PER_IP_PER_HOUR },
    ],
    60,
    false,
  );
  if (!ok) throw new AppError("tooMany", {}, 429);
  return prisma.$transaction(async (tx) => {
    const c = await tx.conversation.findUnique({
      where: { id },
      select: { status: true, assignedToId: true, buyerName: true, listing: { select: { sellerId: true, make: true, model: true, year: true } } },
    });
    if (!c) throw new AppError("notFound", {}, 404);
    if (c.status !== "OPEN") throw new AppError("conversationClosed", {}, 409);
    const unreadBefore = await tx.message.count({ where: { conversationId: id, authorKind: "BUYER", readByStaffAt: null } });
    await tx.message.create({ data: { conversationId: id, authorKind: "BUYER", body } });
    await tx.conversation.update({ where: { id }, data: { lastMessageAt: new Date() } });
    return { conversationId: id, notifyStaffId: unreadBefore === 0 ? (c.listing?.sellerId ?? c.assignedToId) : null, buyerName: c.buyerName, vehicle: vehicleLabel(c.listing) };
  });
}

// ── Staff side ──────────────────────────────────────────────────────────────

export type InboxFilter = { listingId?: string; unread?: boolean };

export async function listConversations(actor: StaffUser, filter: InboxFilter = {}) {
  const where: Prisma.ConversationWhereInput = {
    AND: [
      conversationScope(actor),
      ...(filter.listingId ? [{ listingId: filter.listingId }] : []),
      ...(filter.unread ? [{ messages: { some: { authorKind: "BUYER", readByStaffAt: null } } }] : []),
    ],
  };
  const rows = await prisma.conversation.findMany({
    where,
    orderBy: { lastMessageAt: "desc" },
    take: 200,
    select: {
      id: true, buyerName: true, status: true, lastMessageAt: true, assignedToId: true,
      listing: { select: { id: true, number: true, make: true, model: true, year: true, sellerId: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1, select: { body: true, authorKind: true } },
      _count: { select: { messages: { where: { authorKind: "BUYER", readByStaffAt: null } } } },
    },
  });
  return rows.map(({ messages, _count, ...r }) => ({ ...r, last: messages[0] ?? null, unread: _count.messages }));
}

/** One conversation if this team member may see it, else null (same answer as "does not exist"). */
export async function getConversation(actor: StaffUser, id: string) {
  return prisma.conversation.findFirst({
    where: { AND: [{ id }, conversationScope(actor)] },
    select: {
      id: true, buyerName: true, buyerPhone: true, buyerEmail: true, status: true, createdAt: true, assignedToId: true,
      listing: { select: { id: true, number: true, make: true, model: true, version: true, year: true, price: true, status: true, soldAt: true, sellerId: true } },
      messages: { orderBy: { createdAt: "asc" }, take: 500, select: { id: true, authorKind: true, authorName: true, authorUserId: true, body: true, createdAt: true, readByStaffAt: true, readByBuyerAt: true } },
    },
  });
}

export async function markReadByStaff(actor: StaffUser, id: string) {
  // The scope check is part of the update: nothing happens on a conversation the actor cannot see.
  await prisma.message.updateMany({ where: { conversationId: id, authorKind: "BUYER", readByStaffAt: null, conversation: conversationScope(actor) }, data: { readByStaffAt: new Date() } });
}

/** Team answer. Returns the buyer's contact when they should be told (all earlier answers were read). */
export async function staffReply(actor: StaffUser, id: string, body: string) {
  if (!can(actor.role, "useShowroomMessages")) throw new AppError("forbidden", {}, 403);
  return prisma.$transaction(async (tx) => {
    const c = await tx.conversation.findFirst({
      where: { AND: [{ id }, conversationScope(actor)] },
      select: { id: true, status: true, buyerPhone: true, buyerEmail: true, listing: { select: { make: true, model: true, year: true } } },
    });
    if (!c) throw new AppError("notFound", {}, 404);
    if (c.status !== "OPEN") throw new AppError("conversationClosed", {}, 409);
    const unseenBefore = await tx.message.count({ where: { conversationId: id, authorKind: "STAFF", readByBuyerAt: null } });
    await tx.message.create({ data: { conversationId: id, authorKind: "STAFF", authorUserId: actor.id, authorName: actor.name, body } });
    // Answering means the buyer's messages were read.
    await tx.message.updateMany({ where: { conversationId: id, authorKind: "BUYER", readByStaffAt: null }, data: { readByStaffAt: new Date() } });
    await tx.conversation.update({ where: { id }, data: { lastMessageAt: new Date() } });
    return { notifyBuyer: unseenBefore === 0 ? { phone: c.buyerPhone, email: c.buyerEmail } : null, vehicle: vehicleLabel(c.listing) };
  });
}

export async function setConversationStatus(actor: StaffUser, id: string, status: "OPEN" | "CLOSED") {
  if (!can(actor.role, "useShowroomMessages")) throw new AppError("forbidden", {}, 403);
  const r = await prisma.conversation.updateMany({ where: { AND: [{ id }, conversationScope(actor)] }, data: { status } });
  if (r.count !== 1) throw new AppError("notFound", {}, 404);
}

/** Unread buyer messages for the menu badge. */
export async function unreadForStaff(actor: Pick<StaffUser, "id" | "role">): Promise<number> {
  if (!can(actor.role, "useShowroomMessages")) return 0;
  return prisma.message.count({ where: { authorKind: "BUYER", readByStaffAt: null, conversation: conversationScope(actor) } });
}

// ── Live updates (versions for the short-poll LiveRefresh) ─────────────────

export async function inboxVersion(actor: Pick<StaffUser, "id" | "role">): Promise<string> {
  const scope = conversationScope(actor);
  const [agg, unread] = await Promise.all([
    prisma.conversation.aggregate({ where: scope, _max: { updatedAt: true }, _count: { _all: true } }),
    prisma.message.count({ where: { authorKind: "BUYER", readByStaffAt: null, conversation: scope } }),
  ]);
  return `${agg._max.updatedAt?.getTime() ?? 0}:${agg._count._all}:${unread}`;
}

export async function conversationVersion(id: string): Promise<string | null> {
  const [c, agg] = await Promise.all([
    prisma.conversation.findUnique({ where: { id }, select: { updatedAt: true } }),
    prisma.message.aggregate({ where: { conversationId: id }, _count: { _all: true }, _max: { readByBuyerAt: true, readByStaffAt: true } }),
  ]);
  if (!c) return null;
  return `${c.updatedAt.getTime()}:${agg._count._all}:${agg._max.readByBuyerAt?.getTime() ?? 0}:${agg._max.readByStaffAt?.getTime() ?? 0}`;
}

/** Can this team member watch this conversation live? (checked before any version is computed) */
export async function canSeeConversation(actor: StaffUser, id: string): Promise<boolean> {
  return (await prisma.conversation.count({ where: { AND: [{ id }, conversationScope(actor)] } })) === 1;
}
