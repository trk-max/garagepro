import "server-only";
import { after } from "next/server";
import webpush from "web-push";
import { displayPlate } from "@/lib/format";
import { fr } from "@/lib/i18n/fr";
import { prisma } from "@/lib/prisma";

/**
 * Web Push: « Nouveau véhicule pour vous » on the mechanic's phone even when the team app is closed.
 * Needs VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT (mailto:…) in the environment; without them push
 * is simply off (the in-app alert, bell and À traiter still work). A failed push never breaks anything:
 * 404 / 410 from the push service = dead subscription, deleted; no network (hub without internet) = skipped.
 */
export type PushConfig = { publicKey: string; privateKey: string; subject: string };

export function pushConfig(): PushConfig | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim();
  if (!publicKey || !privateKey || !subject || !/^(mailto:|https:)/.test(subject)) return null;
  return { publicKey, privateKey, subject };
}

export type BrowserSubscription = { endpoint: string; keys: { p256dh: string; auth: string } };

export function isSubscription(x: unknown): x is BrowserSubscription {
  const s = x as BrowserSubscription | null;
  return (
    !!s && typeof s.endpoint === "string" && /^https:\/\//.test(s.endpoint) && s.endpoint.length <= 2000 &&
    typeof s.keys?.p256dh === "string" && s.keys.p256dh.length <= 200 && typeof s.keys?.auth === "string" && s.keys.auth.length <= 100
  );
}

/** This phone / browser accepted the notifications for this person (an endpoint belongs to one person). */
export async function saveSubscription(userId: string, sub: BrowserSubscription, userAgent: string | null) {
  const data = { userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent: userAgent?.slice(0, 300) ?? null, failedAt: null };
  await prisma.pushSubscription.upsert({ where: { endpoint: sub.endpoint }, update: data, create: { endpoint: sub.endpoint, ...data } });
}

export async function removeSubscription(userId: string, endpoint: string) {
  await prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
}

export type PushPayload = { title: string; body: string; url: string; tag: string };

/** Sends to every phone of this person. Returns how many were delivered; never throws. */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<number> {
  const cfg = pushConfig();
  if (!cfg) return 0;
  const subs = await prisma.pushSubscription.findMany({ where: { userId } }).catch(() => []);
  let sent = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), {
        vapidDetails: cfg,
        TTL: 6 * 3600,
        timeout: 5000,
        urgency: "high",
        topic: payload.tag.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) || undefined,
      });
      sent++;
      await prisma.pushSubscription.update({ where: { id: s.id }, data: { lastSuccessAt: new Date(), failedAt: null } }).catch(() => {});
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
      else if (status) await prisma.pushSubscription.update({ where: { id: s.id }, data: { failedAt: new Date() } }).catch(() => {});
      // No status: no network (garage hub without internet) — skipped, the in-app alert still works.
    }
  }
  return sent;
}

/** « Nouveau véhicule pour vous » — after the assignment is saved; never to the person who made it. */
export async function pushAssignment(workOrderId: string, mechanicId: string, actorId: string | null): Promise<number> {
  if (!pushConfig() || mechanicId === actorId) return 0;
  try {
    const wo = await prisma.workOrder.findUnique({ where: { id: workOrderId }, select: { vehicle: { select: { plate: true, make: true, model: true } } } });
    if (!wo) return 0;
    const a = fr.staffMobile.assigned;
    return await sendPushToUser(mechanicId, {
      title: a.title,
      body: a.body.replace("{plate}", displayPlate(wo.vehicle.plate)).replace("{vehicle}", `${wo.vehicle.make} ${wo.vehicle.model}`.trim()),
      url: `/garage/app/ordre/${workOrderId}`,
      tag: `wo-${workOrderId}`,
    });
  } catch {
    return 0;
  }
}

/**
 * Runs the push after the response (Next.js after(): also finishes on Vercel); outside a request (tests,
 * scripts) it simply runs in the background. Never throws.
 */
export function schedulePushAssignment(workOrderId: string, mechanicId: string, actorId: string | null) {
  if (!pushConfig() || mechanicId === actorId) return;
  const run = () => pushAssignment(workOrderId, mechanicId, actorId).then(() => undefined);
  try {
    after(run);
  } catch {
    void run();
  }
}
