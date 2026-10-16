import "server-only";
import { ipFromHeaders } from "@/lib/client-ip";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/prisma";

/**
 * Customer tracking session: no account, just a signed cookie bound to one
 * work order. The signature includes the current PIN, so issuing a new PIN
 * from the workshop instantly logs out every device that used the old one.
 */
const COOKIE = "gp_track";
const TTL_SECONDS = 12 * 60 * 60;
/** Customers can still open the tracker this long after pick-up. */
const AFTER_DELIVERY_MS = 7 * 24 * 60 * 60 * 1000;

function secret(): string {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error("AUTH_SECRET is not set");
  return value;
}

export function sign(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export const generatePin = () => String(randomInt(0, 10_000)).padStart(4, "0");

export async function startPortalSession(workOrderId: string, pin: string): Promise<void> {
  const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const value = `${workOrderId}.${exp}.${sign(`${workOrderId}.${exp}.${pin}`)}`;
  (await cookies()).set(COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TTL_SECONDS,
  });
}

export async function endPortalSession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

/** Work order the visitor may track, or null (expired, tampered, PIN changed, order closed). */
export async function getPortalWorkOrderId(): Promise<string | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const [workOrderId, expStr, signature] = raw.split(".");
  const exp = Number(expStr);
  if (!workOrderId || !signature || !Number.isFinite(exp) || exp * 1000 < Date.now()) return null;

  const wo = await prisma.workOrder.findUnique({
    where: { id: workOrderId },
    select: { trackingPin: true, status: true, deliveredAt: true },
  });
  if (!wo?.trackingPin || !isTrackable(wo)) return null;
  return safeEqual(signature, sign(`${workOrderId}.${exp}.${wo.trackingPin}`)) ? workOrderId : null;
}

export function isTrackable(wo: { status: string; deliveredAt: Date | null }): boolean {
  if (wo.status === "CANCELLED") return false;
  if (wo.status === "DELIVERED") return !!wo.deliveredAt && Date.now() - wo.deliveredAt.getTime() < AFTER_DELIVERY_MS;
  return true;
}

/** Rate-limit key of the visitor: platform IP on Vercel, trusted proxy hop elsewhere (see lib/client-ip.ts). */
export async function clientIp(): Promise<string> {
  return ipFromHeaders(await headers());
}
