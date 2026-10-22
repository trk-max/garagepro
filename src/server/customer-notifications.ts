import "server-only";
import { displayPlate, fmt } from "@/lib/format";
import { fr } from "@/lib/i18n/fr";
import { prisma } from "@/lib/prisma";
import { audit, type AuditActor } from "@/server/audit";
import { isCloudWithHub } from "@/server/hub";
import { deliverPending, queueItems, realSender, type Item, type Sender } from "@/server/reminders";
import { getSettings } from "@/server/settings";

/**
 * SMS / e-mail "your car is ready". V16 (audit n° 9): goes through the same queue as the reminders
 * (table Notification: status, error, retries, history page) instead of a direct send that was lost
 * without a trace when offline. One message per move to READY (dedupe on readyAt). The customer has no
 * language on file: the text is in French, like the other customer reminders. The queueing and its
 * journal line are written in one transaction; the send itself happens after (never blocks the desk more
 * than 4 s; what is not sent now is retried by the reminders task). With a hub, the online copy only
 * queues: the garage hub sends (no double SMS). Never throws.
 */
export async function notifyVehicleReady(workOrderId: string, actor: AuditActor = null, sender: Sender = realSender): Promise<{ queued: number; dedupeKey: string | null }> {
  try {
    const [wo, settings] = await Promise.all([
      prisma.workOrder.findUnique({
        where: { id: workOrderId },
        select: { id: true, readyAt: true, customer: { select: { id: true, phone: true, email: true } }, vehicle: { select: { id: true, plate: true } } },
      }),
      getSettings(),
    ]);
    if (!wo) return { queued: 0, dedupeKey: null };
    const text = fmt(fr.booking.smsReady, { garage: settings.garageName, plate: displayPlate(wo.vehicle.plate) });
    const dedupeKey = `ready:${wo.id}:${(wo.readyAt ?? new Date()).toISOString()}`;
    const item: Item = {
      kind: "READY",
      dedupeKey,
      phone: wo.customer.phone,
      email: wo.customer.email,
      customerId: wo.customer.id,
      vehicleId: wo.vehicle.id,
      workOrderId: wo.id,
      subject: text,
      body: text,
    };
    const queued = await prisma.$transaction(async (tx) => {
      const n = await queueItems([item], sender, tx);
      await audit(tx, actor, "notification.ready", "WorkOrder", wo.id, { after: { dedupeKey, queued: n, channels: sender.channels() } });
      return n;
    });
    if (queued > 0 && !isCloudWithHub()) {
      const send = deliverPending(new Date(), sender, 10, { kind: "READY", dedupeKey });
      await Promise.race([send, new Promise((r) => setTimeout(r, 4000))]);
    }
    return { queued, dedupeKey };
  } catch (error) {
    console.error("[notify] ready", error);
    return { queued: 0, dedupeKey: null };
  }
}
