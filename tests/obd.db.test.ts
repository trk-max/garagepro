/**
 * Prompt 3/5 — OBD-II readings: what is stored, and what may change the vehicle file.
 * Real PostgreSQL test database. Run: npm run test:db
 */
import { describe, expect, it } from "vitest";
import { runDiagnostic, simulatedTransport } from "@/lib/obd/session";
import { saveReading, type ReadingInput } from "@/server/obd";
import { makeUser, makeWorkOrder, prisma } from "./helpers/db";

const VIN = "VF3ABCDEFGH123456";
const read = (over: Partial<ReadingInput> = {}): ReadingInput => ({
  simulated: false,
  adapter: "ELM327 v1.5",
  protocol: "ISO 15765-4 (CAN 11/500)",
  vin: VIN,
  odometerKm: 120_000,
  dtcs: [{ code: "P0133", kind: "stored" }],
  live: [{ pid: "0C", name: "Régime moteur", value: 780, unit: "tr/min" }],
  unsupported: [],
  warnings: [],
  readAt: new Date().toISOString(),
  ...over,
});

async function vehicleWith(data: { vin?: string | null; mileage?: number | null }) {
  const { vehicle, wo: workOrder } = await makeWorkOrder();
  await prisma.vehicle.update({ where: { id: vehicle.id }, data });
  return { vehicle, workOrder };
}

describe("Relevés OBD-II", () => {
  it("a higher odometer is applied only when confirmed, and journaled", async () => {
    const mech = await makeUser("MECHANIC");
    const { vehicle, workOrder } = await vehicleWith({ vin: VIN, mileage: 100_000 });
    expect((await saveReading(mech, vehicle.id, { result: read(), workOrderId: workOrder.id })).odometerStatus).toBe("NOT_APPLIED");
    expect((await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicle.id } })).mileage).toBe(100_000);
    expect((await saveReading(mech, vehicle.id, { result: read(), applyOdometer: true })).odometerStatus).toBe("APPLIED");
    expect((await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicle.id } })).mileage).toBe(120_000);
    const actions = (await prisma.auditLog.findMany({ where: { OR: [{ entityId: vehicle.id }, { entity: "VehicleReading" }], actorId: mech.id }, orderBy: { createdAt: "asc" } })).map((l) => l.action);
    expect(actions).toEqual(["obd.reading", "vehicle.mileage", "obd.reading"]);
    const rows = await prisma.vehicleReading.findMany({ where: { vehicleId: vehicle.id }, orderBy: { recordedAt: "asc" } });
    expect(rows.map((r) => [r.source, r.odometerStatus, r.workOrderId])).toEqual([
      ["ADAPTER", "NOT_APPLIED", workOrder.id],
      ["ADAPTER", "APPLIED", null],
    ]);
    expect(rows[0]?.dtcs).toEqual([{ code: "P0133", kind: "stored" }]);
  });

  it("a LOWER odometer is flagged and never applied, even if confirmation is sent", async () => {
    const mech = await makeUser("MECHANIC");
    const { vehicle } = await vehicleWith({ vin: VIN, mileage: 150_000 });
    expect((await saveReading(mech, vehicle.id, { result: read(), applyOdometer: true })).odometerStatus).toBe("LOWER");
    expect((await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicle.id } })).mileage).toBe(150_000);
  });

  it("wrong car connected (VIN differs from the file): refused, nothing stored", async () => {
    const mech = await makeUser("MECHANIC");
    const { vehicle } = await vehicleWith({ vin: "WVWZZZ1KZAW000001", mileage: 100_000 });
    await expect(saveReading(mech, vehicle.id, { result: read(), applyOdometer: true })).rejects.toMatchObject({ code: "obdVinMismatch" });
    expect(await prisma.vehicleReading.count({ where: { vehicleId: vehicle.id } })).toBe(0);
    expect((await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicle.id } })).mileage).toBe(100_000);
  });

  it("the simulator is stored as SIMULATED and never changes the vehicle", async () => {
    const mech = await makeUser("MECHANIC");
    const { vehicle } = await vehicleWith({ vin: "WVWZZZ1KZAW000001", mileage: 50_000 });
    const result = await runDiagnostic(simulatedTransport());
    const saved = await saveReading(mech, vehicle.id, { result: { ...result, odometerKm: 90_000 }, applyOdometer: true });
    expect(saved.odometerStatus).toBe("SIMULATED");
    const row = await prisma.vehicleReading.findUniqueOrThrow({ where: { id: saved.id } });
    expect(row.source).toBe("SIMULATED");
    expect((await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicle.id } })).mileage).toBe(50_000);
  });

  it("no odometer from the car → UNSUPPORTED; a storekeeper cannot save; another vehicle's order is refused", async () => {
    const mech = await makeUser("MECHANIC");
    const { vehicle } = await vehicleWith({ vin: null, mileage: null });
    expect((await saveReading(mech, vehicle.id, { result: read({ odometerKm: null }), applyOdometer: true })).odometerStatus).toBe("UNSUPPORTED");
    expect((await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicle.id } })).mileage).toBeNull();
    const store = await makeUser("STOREKEEPER");
    await expect(saveReading(store, vehicle.id, { result: read() })).rejects.toMatchObject({ code: "forbidden" });
    const { wo: other } = await makeWorkOrder();
    await expect(saveReading(mech, vehicle.id, { result: read(), workOrderId: other.id })).rejects.toMatchObject({ code: "invalid" });
  });

  it("rejects malformed data (a fake code, an absurd value)", async () => {
    const mech = await makeUser("MECHANIC");
    const { vehicle } = await vehicleWith({});
    await expect(saveReading(mech, vehicle.id, { result: read({ dtcs: [{ code: "X9999", kind: "stored" }] }) })).rejects.toThrow();
    await expect(saveReading(mech, vehicle.id, { result: read({ odometerKm: 5_000_000 }) })).rejects.toThrow();
  });
});
