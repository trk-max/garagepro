import "server-only";
import { z } from "zod";
import { AppError } from "@/lib/http";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import type { StaffUser } from "@/lib/session";
import { audit } from "@/server/audit";

/**
 * OBD-II readings (Prompt 3/5). The browser reads the car through the adapter;
 * the server only stores what was read, with strict validation and these rules:
 * - a simulated reading is stored as SIMULATED and never changes the vehicle;
 * - the car's VIN must match the vehicle file (wrong car connected → refused);
 * - mileage: only if the car provided it; lower than the last recorded value →
 *   flagged, never applied; higher → applied only when the user confirms.
 */
const dtc = z.object({ code: z.string().regex(/^[PCBU][0-3][0-9A-F]{3}$/), kind: z.enum(["stored", "pending", "permanent"]) });
const live = z.object({ pid: z.string().regex(/^[0-9A-F]{2}$/), name: z.string().max(80), value: z.number().finite().min(-100).max(100_000), unit: z.string().max(10) });

export const readingSchema = z.object({
  simulated: z.boolean(),
  adapter: z.string().max(80),
  protocol: z.string().max(120).nullable(),
  vin: z.string().regex(/^[A-HJ-NPR-Z0-9]{17}$/).nullable(),
  odometerKm: z.number().int().min(0).max(2_000_000).nullable(),
  dtcs: z.array(dtc).max(100),
  live: z.array(live).max(40),
  unsupported: z.array(z.string().max(120)).max(60),
  warnings: z.array(z.string().max(200)).max(60),
  readAt: z.string().max(40),
});
export type ReadingInput = z.infer<typeof readingSchema>;

export async function saveReading(actor: StaffUser, vehicleId: string, input: { result: ReadingInput; workOrderId?: string | null; applyOdometer?: boolean; note?: string | null }) {
  if (!can(actor.role, "obdDiagnose")) throw new AppError("forbidden", {}, 403);
  const r = readingSchema.parse(input.result);
  return prisma.$transaction(async (tx) => {
    const v = await tx.vehicle.findUnique({ where: { id: vehicleId }, select: { id: true, vin: true, mileage: true, plate: true } });
    if (!v) throw new AppError("notFound", {}, 404);
    if (input.workOrderId) {
      const wo = await tx.workOrder.findUnique({ where: { id: input.workOrderId }, select: { vehicleId: true } });
      if (!wo || wo.vehicleId !== vehicleId) throw new AppError("invalid", {}, 422);
    }
    if (!r.simulated && r.vin && v.vin && r.vin !== v.vin.toUpperCase()) throw new AppError("obdVinMismatch", { read: r.vin, file: v.vin }, 409);

    let odometerStatus: string;
    if (r.simulated) odometerStatus = "SIMULATED";
    else if (r.odometerKm === null) odometerStatus = "UNSUPPORTED";
    else if (v.mileage !== null && r.odometerKm < v.mileage) odometerStatus = "LOWER";
    else if (input.applyOdometer) odometerStatus = "APPLIED";
    else odometerStatus = "NOT_APPLIED";

    const reading = await tx.vehicleReading.create({
      data: {
        vehicleId,
        workOrderId: input.workOrderId || null,
        source: r.simulated ? "SIMULATED" : "ADAPTER",
        adapter: r.adapter,
        protocol: r.protocol,
        vin: r.vin,
        odometerKm: r.odometerKm,
        odometerStatus,
        dtcs: r.dtcs,
        live: r.live,
        unsupported: r.unsupported,
        warnings: r.warnings,
        note: input.note?.trim().slice(0, 300) || null,
        recordedById: actor.id,
      },
      select: { id: true },
    });
    if (odometerStatus === "APPLIED") {
      await tx.vehicle.update({ where: { id: vehicleId }, data: { mileage: r.odometerKm } });
      await audit(tx, actor, "vehicle.mileage", "Vehicle", vehicleId, { before: { mileage: v.mileage }, after: { mileage: r.odometerKm, source: "OBD" } });
    }
    await audit(tx, actor, "obd.reading", "VehicleReading", reading.id, {
      after: { vehicleId, source: r.simulated ? "SIMULATED" : "ADAPTER", dtcs: r.dtcs.map((d) => d.code), odometerKm: r.odometerKm, odometerStatus },
    });
    return { id: reading.id, odometerStatus };
  });
}

export async function listReadings(vehicleId: string, take = 30) {
  return prisma.vehicleReading.findMany({ where: { vehicleId }, orderBy: { recordedAt: "desc" }, take });
}
