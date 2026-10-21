/**
 * Prompt 2/5, step C — vehicle QR Code: who sees what after a scan.
 * Real PostgreSQL test database. Run: npm run test:db
 */
import { describe, expect, it } from "vitest";
import type { CompanyViewer } from "@/server/company-portal";
import { QR_TOKEN, issueVehicleQr, resolveVehicleQr, revokeVehicleQr } from "@/server/vehicle-qr";
import { makeUser, makeWorkOrder, prisma } from "./helpers/db";

const anon = (ip = "198.51.100.1") => ({ staff: null, company: null, ip });
const companyOf = (customerId: string): CompanyViewer => ({ id: "cu1", customerId, role: "FLEET_ADMIN", name: "Flotte", email: "f@test.tn" });

describe("QR Code du véhicule", () => {
  it("anonymous scan: only plate, make and model — nothing private or financial", async () => {
    const admin = await makeUser("ADMIN");
    const { vehicle } = await makeWorkOrder();
    const token = await issueVehicleQr(admin, vehicle.id);
    expect(token).toMatch(QR_TOKEN);
    const scan = await resolveVehicleQr(token, anon());
    expect(scan).toEqual({ kind: "public", plate: vehicle.plate, make: "Peugeot", model: "208" });
  });

  it("staff allowed to see customers are sent to the file; a storekeeper is not", async () => {
    const admin = await makeUser("ADMIN");
    const { vehicle, customer } = await makeWorkOrder();
    const token = await issueVehicleQr(admin, vehicle.id);
    const mech = await makeUser("MECHANIC");
    expect(await resolveVehicleQr(token, { ...anon(), staff: mech })).toEqual({ kind: "staff", customerId: customer.id, vehicleId: vehicle.id });
    const store = await makeUser("STOREKEEPER");
    expect((await resolveVehicleQr(token, { ...anon(), staff: store })).kind).toBe("public");
  });

  it("company accounts: the owner opens its portal, ANOTHER company only gets the public card", async () => {
    const admin = await makeUser("ADMIN");
    const { vehicle, customer } = await makeWorkOrder();
    const { customer: other } = await makeWorkOrder();
    const token = await issueVehicleQr(admin, vehicle.id);
    expect(await resolveVehicleQr(token, { ...anon(), company: companyOf(customer.id) })).toEqual({ kind: "company", vehicleId: vehicle.id });
    expect((await resolveVehicleQr(token, { ...anon(), company: companyOf(other.id) })).kind).toBe("public");
  });

  it("renewing kills the old label; revoking kills the current one", async () => {
    const admin = await makeUser("ADMIN");
    const { vehicle } = await makeWorkOrder();
    const first = await issueVehicleQr(admin, vehicle.id);
    const second = await issueVehicleQr(admin, vehicle.id);
    expect(second).not.toBe(first);
    expect((await resolveVehicleQr(first, anon("198.51.100.2"))).kind).toBe("invalid");
    expect((await resolveVehicleQr(second, anon("198.51.100.2"))).kind).toBe("public");
    await revokeVehicleQr(admin, vehicle.id);
    expect((await resolveVehicleQr(second, anon("198.51.100.2"))).kind).toBe("invalid");
    const actions = (await prisma.auditLog.findMany({ where: { entityId: vehicle.id }, orderBy: { createdAt: "asc" } })).map((l) => l.action);
    expect(actions).toEqual(["vehicle.qrIssue", "vehicle.qrRenew", "vehicle.qrRevoke"]);
    const journal = JSON.stringify(await prisma.auditLog.findMany({ where: { entityId: vehicle.id } }));
    expect(journal).not.toContain(first);
    expect(journal).not.toContain(second);
  });

  it("tokens are random and unique; a mechanic cannot create one", async () => {
    const admin = await makeUser("ADMIN");
    const tokens = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const { vehicle } = await makeWorkOrder();
      tokens.add(await issueVehicleQr(admin, vehicle.id));
    }
    expect(tokens.size).toBe(20);
    const { vehicle } = await makeWorkOrder();
    const mech = await makeUser("MECHANIC");
    await expect(issueVehicleQr(mech, vehicle.id)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("malformed or guessed tokens: invalid, then blocked after 30 tries from the same address", async () => {
    expect((await resolveVehicleQr("../../etc/passwd", anon("203.0.113.9"))).kind).toBe("invalid");
    expect((await resolveVehicleQr(prisma.$queryRaw.name, anon("203.0.113.9"))).kind).toBe("invalid");
    for (let i = 0; i < 28; i++) await resolveVehicleQr("A".repeat(31) + String.fromCharCode(65 + (i % 26)), anon("203.0.113.9"));
    expect((await resolveVehicleQr("Z".repeat(32), anon("203.0.113.9"))).kind).toBe("tooMany");
    expect((await resolveVehicleQr("Z".repeat(32), anon("203.0.113.10"))).kind).toBe("invalid"); // another address is not blocked
  });
});
