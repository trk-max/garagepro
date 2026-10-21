import "server-only";
import { randomBytes } from "node:crypto";
import { AppError } from "@/lib/http";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import type { StaffUser } from "@/lib/session";
import { audit } from "@/server/audit";
import type { CompanyViewer } from "@/server/company-portal";
import { reserveAttempt } from "@/server/rate-limit";

/**
 * QR Code per vehicle. The label carries /v/<token>: 24 random bytes
 * (192 bits, base64url), unique, not derived from the plate or the id, so it
 * cannot be guessed. Holding the QR gives NO private data: an anonymous scan
 * only shows the plate and the model (both written on the car anyway) and the
 * garage's public actions; history, documents and amounts still need a staff
 * login, the company account of that vehicle, or the customer's tracking code.
 */
export const QR_TOKEN = /^[A-Za-z0-9_-]{32}$/;
const newToken = () => randomBytes(24).toString("base64url");

/** Creates the vehicle's QR, or renews it (the previous label stops working at once). */
export async function issueVehicleQr(actor: StaffUser, vehicleId: string) {
  if (!can(actor.role, "manageVehicleQr")) throw new AppError("forbidden", {}, 403);
  return prisma.$transaction(async (tx) => {
    const v = await tx.vehicle.findUnique({ where: { id: vehicleId }, select: { qrToken: true, plate: true } });
    if (!v) throw new AppError("notFound", {}, 404);
    const updated = await tx.vehicle.update({ where: { id: vehicleId }, data: { qrToken: newToken(), qrIssuedAt: new Date() }, select: { qrToken: true } });
    // The journal says what happened, never the secret itself.
    await audit(tx, actor, v.qrToken ? "vehicle.qrRenew" : "vehicle.qrIssue", "Vehicle", vehicleId, { before: { hadQr: !!v.qrToken }, after: { hasQr: true, plate: v.plate } });
    return updated.qrToken!;
  });
}

export async function revokeVehicleQr(actor: StaffUser, vehicleId: string) {
  if (!can(actor.role, "manageVehicleQr")) throw new AppError("forbidden", {}, 403);
  return prisma.$transaction(async (tx) => {
    const v = await tx.vehicle.findUnique({ where: { id: vehicleId }, select: { qrToken: true, plate: true } });
    if (!v) throw new AppError("notFound", {}, 404);
    if (!v.qrToken) return;
    await tx.vehicle.update({ where: { id: vehicleId }, data: { qrToken: null, qrIssuedAt: null } });
    await audit(tx, actor, "vehicle.qrRevoke", "Vehicle", vehicleId, { before: { hasQr: true, plate: v.plate }, after: { hasQr: false } });
  });
}

export type QrScan =
  | { kind: "invalid" }
  | { kind: "tooMany" }
  | { kind: "staff"; customerId: string; vehicleId: string }
  | { kind: "company"; vehicleId: string }
  | { kind: "public"; plate: string; make: string; model: string };

/**
 * What a scan may open, decided on the server from who is signed in:
 * staff allowed to see customers → the customer's file; the company account
 * that owns the vehicle → its portal; anyone else (or another company) → the
 * minimal public card. Wrong or revoked tokens are rate-limited per IP.
 */
export async function resolveVehicleQr(token: string, who: { staff: StaffUser | null; company: CompanyViewer | null; ip: string }): Promise<QrScan> {
  const vehicle = QR_TOKEN.test(token)
    ? await prisma.vehicle.findUnique({ where: { qrToken: token }, select: { id: true, plate: true, make: true, model: true, customerId: true } })
    : null;
  if (!vehicle) {
    const reserved = await reserveAttempt([{ key: `qr-ip:${who.ip}`, max: 30 }], 15, true);
    return reserved ? { kind: "invalid" } : { kind: "tooMany" };
  }
  if (who.staff && can(who.staff.role, "viewCustomers")) return { kind: "staff", customerId: vehicle.customerId, vehicleId: vehicle.id };
  if (who.company && who.company.customerId === vehicle.customerId) return { kind: "company", vehicleId: vehicle.id };
  return { kind: "public", plate: vehicle.plate, make: vehicle.make, model: vehicle.model };
}
