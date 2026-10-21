import "server-only";
import { getBaseUrl } from "@/lib/base-url";
import { fmt } from "@/lib/format";
import type { Dictionary } from "@/lib/i18n/fr";
import { prisma } from "@/lib/prisma";
import { emailConfigured, sendEmail } from "@/server/email";
import { notifyCustomerDetailed } from "@/server/notify";

/**
 * Optional e-mail / SMS around buyer messages, through the EXISTING channels (server/notify.ts,
 * server/email.ts). Nothing configured = nothing sent: the on-screen link and the menu badge
 * remain. Never throws (a failed e-mail must not lose a message). Called after the response.
 */

/** Buyer: the private link (only right after the request — the clear token is never stored). */
export async function sendBuyerLink(t: Dictionary, contact: { phone?: string | null; email?: string | null }, data: { garage: string; vehicle: string; token: string }) {
  try {
    const url = `${await getBaseUrl()}/messages/${data.token}`;
    const vars = { garage: data.garage, vehicle: data.vehicle, url };
    await notifyCustomerDetailed(contact, { subject: fmt(t.showroom.contact.notifySubject, vars), text: fmt(t.showroom.contact.notifyLink, vars), brand: data.garage });
  } catch (error) {
    console.error("[messages] buyer link not sent", error);
  }
}

/** Buyer: "the seller answered" (no link: the clear token is not kept). */
export async function sendBuyerReplyNotice(t: Dictionary, contact: { phone?: string | null; email?: string | null }, data: { garage: string; vehicle: string }) {
  try {
    const text = fmt(t.showroom.contact.notifyReply, data);
    await notifyCustomerDetailed(contact, { subject: text, text, brand: data.garage });
  } catch (error) {
    console.error("[messages] reply notice not sent", error);
  }
}

/** Seller: e-mail "new message from a buyer", only when e-mail is configured and the seller has an address. */
export async function sendStaffNotice(t: Dictionary, userId: string | null, data: { garage: string; buyerName: string; vehicle: string; conversationId: string }) {
  if (!userId || !emailConfigured()) return;
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, isActive: true } });
    if (!user?.isActive || !user.email) return;
    const url = `${await getBaseUrl()}/garage/messages/${data.conversationId}`;
    await sendEmail({
      to: user.email,
      subject: fmt(t.showroom.messages.emailNotice, { name: data.buyerName, vehicle: data.vehicle }),
      text: fmt(t.showroom.messages.emailBody, { vehicle: data.vehicle, url }),
      brand: data.garage,
    });
  } catch (error) {
    console.error("[messages] staff notice not sent", error);
  }
}
