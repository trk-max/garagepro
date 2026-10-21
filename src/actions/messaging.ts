"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { AppError, toActionError, type ActionResult } from "@/lib/http";
import { getI18n } from "@/lib/i18n/server";
import { requirePermission } from "@/lib/session";
import { buyerContactSchema, messageSchema } from "@/lib/showroom-validators";
import { formToObject, id } from "@/lib/validators";
import { buyerReply, setConversationStatus, staffReply, startConversation } from "@/server/messaging";
import { sendBuyerLink, sendBuyerReplyNotice, sendStaffNotice } from "@/server/messaging-notify";
import { clientIp } from "@/server/portal-session";
import { getSettings } from "@/server/settings";

type Result = ActionResult<{ redirectTo?: string; message?: string }>;

// ── Buyer (public site, no account) ─────────────────────────────────────────

export async function startConversationAction(listingNumber: number, form: FormData): Promise<Result> {
  try {
    const { t } = await getI18n();
    const parsed = buyerContactSchema.safeParse(formToObject(form));
    if (!parsed.success) {
      const missingContact = parsed.error.issues.some((i) => i.message === "contactRequired");
      return { ok: false, error: missingContact ? t.showroom.contact.oneOf : t.errors.invalid };
    }
    if (!Number.isSafeInteger(listingNumber) || listingNumber <= 0) throw new AppError("notFound", {}, 404);
    const started = await startConversation(listingNumber, parsed.data, { ip: await clientIp() });
    const settings = await getSettings();
    after(async () => {
      await sendBuyerLink(t, { phone: parsed.data.phone, email: parsed.data.email }, { garage: settings.garageName, vehicle: started.vehicle, token: started.token });
      await sendStaffNotice(t, started.sellerId, { garage: settings.garageName, buyerName: parsed.data.name, vehicle: started.vehicle, conversationId: started.conversationId });
    });
    revalidatePath("/garage/messages");
    return { ok: true, data: { redirectTo: `/messages/${started.token}`, message: t.showroom.contact.sent } };
  } catch (error) {
    return toActionError(error);
  }
}

export async function buyerReplyAction(token: string, form: FormData): Promise<Result> {
  try {
    const { body } = messageSchema.parse(formToObject(form));
    const r = await buyerReply(String(token), body, { ip: await clientIp() });
    if (r.notifyStaffId) {
      const [{ t }, settings] = await Promise.all([getI18n(), getSettings()]);
      after(() => sendStaffNotice(t, r.notifyStaffId, { garage: settings.garageName, buyerName: r.buyerName, vehicle: r.vehicle, conversationId: r.conversationId }));
    }
    revalidatePath(`/messages/${token}`);
    return { ok: true, data: {} };
  } catch (error) {
    return toActionError(error);
  }
}

// ── Staff ───────────────────────────────────────────────────────────────────

export async function staffReplyAction(conversationId: string, form: FormData): Promise<Result> {
  try {
    const actor = await requirePermission("useShowroomMessages");
    const { body } = messageSchema.parse(formToObject(form));
    const r = await staffReply(actor, id.parse(conversationId), body);
    if (r.notifyBuyer) {
      const [{ t }, settings] = await Promise.all([getI18n(), getSettings()]);
      const contact = r.notifyBuyer;
      after(() => sendBuyerReplyNotice(t, contact, { garage: settings.garageName, vehicle: r.vehicle }));
    }
    revalidatePath(`/garage/messages/${conversationId}`);
    revalidatePath("/garage/messages");
    return { ok: true, data: {} };
  } catch (error) {
    return toActionError(error);
  }
}

export async function conversationStatusAction(conversationId: string, status: string): Promise<ActionResult> {
  try {
    const actor = await requirePermission("useShowroomMessages");
    if (status !== "OPEN" && status !== "CLOSED") throw new AppError("invalid", {}, 422);
    await setConversationStatus(actor, id.parse(conversationId), status);
    revalidatePath(`/garage/messages/${conversationId}`);
    revalidatePath("/garage/messages");
    return { ok: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}
