/**
 * V9.0 — contracts on the real database: parties linked from the work order, access by category
 * (employment = administrator + HR), status machine with legal review and signed scan, expiry
 * alerts, history and audit journal. Real PostgreSQL. Run: npm run test:db
 */
import { inflateSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import { utcToZoned } from "@/lib/booking";
import { readContractData } from "@/lib/contract-document";
import { templateId } from "@/lib/contracts";
import { addDaysToDay } from "@/lib/warranty";
import { listAlerts, updateAlert } from "@/server/alerts";
import {
  contractExpiryAlerts,
  createContract,
  getContract,
  listContracts,
  moveContract,
  readSignedScan,
  renewContract,
  setTemplateReview,
  updateContract,
  uploadSignedScan,
} from "@/server/contracts";
import { addLine } from "@/server/work-orders";
import { makeUser, makeWorkOrder, prisma } from "./helpers/db";

const today = () => utcToZoned(new Date(), "Africa/Tunis").date;
const code = async (p: Promise<unknown>) => p.then(() => "NO ERROR", (e: { code?: string }) => e.code ?? String(e));
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");

// Signed scans: in-memory storage (nothing written on disk or sent to Supabase by the tests).
const files = vi.hoisted(() => new Map<string, { body: Buffer; type: string }>());
vi.mock("@/server/storage", () => ({
  putObject: async (key: string, body: Buffer, type: string) => void files.set(key, { body, type }),
  readObject: async (key: string, type: string) => {
    const f = files.get(key);
    return f ? new Response(new Uint8Array(f.body), { headers: { "Content-Type": type, "Cache-Control": "private, max-age=86400, immutable" } }) : new Response("Not found", { status: 404 });
  },
}));

// Session of the API route tests: the signed-in user (re-read from the real database by getStaff).
const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@/lib/auth", () => ({ auth: async () => (session.userId ? { user: { id: session.userId } } : null) }));

const REPAIR_TPL = templateId("REPAIR", 1);
const FLEET_TPL = templateId("FLEET", 1);
const BLANK_TPL = templateId("BLANK", 1);

describe("contrat de réparation depuis l'ordre", () => {
  it("is linked to the work order's customer and vehicle, numbered, prefilled, historised and audited", async () => {
    const reception = await makeUser("RECEPTION");
    const admin = await makeUser("ADMIN");
    const { wo, customer, vehicle } = await makeWorkOrder();
    await prisma.vehicle.update({ where: { id: vehicle.id }, data: { vin: "VF3ABCDEF12345678", mileage: 123_456 } });
    await addLine(wo.id, { type: "LABOR", description: "Remplacement plaquettes", quantityX100: 150, unitPrice: 40_000 }, admin);

    const c = await createContract(reception, { templateId: REPAIR_TPL, workOrderId: wo.id, startDay: today(), fields: { authorizationToStart: "YES" } });
    expect(c.number).toMatch(/^CTR-\d{4}-\d{4}$/);
    const row = await prisma.contract.findUniqueOrThrow({ where: { id: c.id }, include: { vehicles: true } });
    expect(row.customerId).toBe(customer.id);
    expect(row.workOrderId).toBe(wo.id);
    expect(row.vehicles.map((v) => v.vehicleId)).toEqual([vehicle.id]);
    expect(row.endDate).toBeNull();
    expect(row.status).toBe("DRAFT");
    expect(row.flags).toEqual(["TEMPLATE_NOT_REVIEWED"]);
    const data = readContractData(row.data);
    expect(data.snapshot?.vehicles[0]).toMatchObject({ plate: vehicle.plate, vin: "VF3ABCDEF12345678", mileage: 123_456 });
    expect(data.snapshot?.repair?.complaint).toBe("Freins");
    // 1.5 h × 40 DT HT = 60 DT HT → 71,400 DT TTC (19 %)
    expect(data.snapshot?.repair?.lines[0]).toMatchObject({ totalTtc: 71_400 });
    expect(data.fields.extraWorkProcedure).toMatch(/accord préalable/);
    expect(await prisma.contractEvent.count({ where: { contractId: c.id, type: "CREATED" } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { entity: "Contract", entityId: c.id, action: "contract.create", actorId: reception.id } })).toBe(1);

    // Mechanics see no contract at all.
    const mechanic = await makeUser("MECHANIC");
    expect(await code(getContract(mechanic, c.id))).toBe("forbidden");
    expect(await code(listContracts(mechanic))).toBe("forbidden");
  });

  it("goes through validation → legal review → approval → signature (scan) → active, with history", async () => {
    const manager = await makeUser("MANAGER");
    const reception = await makeUser("RECEPTION");
    const { wo } = await makeWorkOrder();
    const c = await createContract(reception, { templateId: REPAIR_TPL, workOrderId: wo.id, startDay: today(), fields: {} });
    // Required fields first (authorization to start, warranty terms).
    expect(await code(moveContract(reception, c.id, "VALIDATION"))).toBe("contractMissingFields");
    const d = readContractData((await prisma.contract.findUniqueOrThrow({ where: { id: c.id } })).data);
    await updateContract(reception, c.id, { startDay: today(), fields: { ...d.fields, authorizationToStart: "YES", warrantyTerms: "Réparation garantie 3 mois." } });
    await moveContract(reception, c.id, "VALIDATION");
    // Template not reviewed by a lawyer: no direct approval, and reception cannot approve.
    expect(await code(moveContract(manager, c.id, "APPROVED"))).toBe("contractLegalReview");
    await moveContract(reception, c.id, "LEGAL_REVIEW");
    expect(await code(moveContract(reception, c.id, "APPROVED"))).toBe("forbidden");
    await moveContract(manager, c.id, "APPROVED");
    await moveContract(reception, c.id, "PENDING_SIGNATURE");
    // No "signed" without the hand-signed scan; a fake file is refused.
    expect(await code(moveContract(reception, c.id, "SIGNED"))).toBe("contractScanMissing");
    expect(await code(uploadSignedScan(reception, c.id, Buffer.from("<html>not a scan</html>")))).toBe("contractScanType");
    expect(await uploadSignedScan(reception, c.id, PDF)).toEqual({ status: "SIGNED" });
    await moveContract(reception, c.id, "ACTIVE");
    // Editing is over once it left the draft.
    expect(await code(updateContract(reception, c.id, { startDay: today(), fields: {} }))).toBe("contractNotDraft");

    const events = await prisma.contractEvent.findMany({ where: { contractId: c.id }, orderBy: { createdAt: "asc" } });
    expect(events.map((e) => e.toStatus ?? e.type)).toEqual(["DRAFT", "UPDATED", "VALIDATION", "LEGAL_REVIEW", "APPROVED", "PENDING_SIGNATURE", "SIGNED", "ACTIVE"]);
    expect(events.find((e) => e.toStatus === "APPROVED")?.note).toMatch(/Revue juridique/);
    // History lines are append-only (database trigger).
    await expect(prisma.contractEvent.update({ where: { id: events[0]!.id }, data: { note: "x" } })).rejects.toThrow();
    expect(await prisma.auditLog.count({ where: { entity: "Contract", entityId: c.id, action: "contract.status" } })).toBe(5); // + SIGNED, recorded by contract.scan
    expect(await prisma.auditLog.count({ where: { entity: "Contract", entityId: c.id, action: "contract.scan" } })).toBe(1);

    // The scan is streamed only after the access check.
    const res = await readSignedScan(reception, c.id);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(Buffer.from(await res.arrayBuffer()).subarray(0, 5).toString()).toBe("%PDF-");
    const storekeeper = await makeUser("STOREKEEPER");
    expect(await code(readSignedScan(storekeeper, c.id))).toBe("forbidden");
  });

  it("reviewed template: direct approval allowed; review recorded by an administrator only (audited)", async () => {
    const admin = await makeUser("ADMIN");
    const manager = await makeUser("MANAGER");
    await createContract(manager, { templateId: BLANK_TPL, startDay: today(), fields: { object: "Test", body: "Texte" } }); // makes sure the templates exist
    expect(await code(setTemplateReview(manager, BLANK_TPL, true, null))).toBe("forbidden");
    await setTemplateReview(admin, BLANK_TPL, true, "Relu par Me X, avocat");
    try {
      const c = await createContract(manager, { templateId: BLANK_TPL, startDay: today(), fields: { object: "Prêt d'outillage", body: "Le garage prête…" } });
      expect((await prisma.contract.findUniqueOrThrow({ where: { id: c.id } })).flags).toEqual([]);
      await moveContract(manager, c.id, "VALIDATION");
      expect(await code(moveContract(manager, c.id, "APPROVED"))).toBe("forbidden"); // blank: approval = administrator
      await moveContract(admin, c.id, "APPROVED");
      expect(await prisma.auditLog.count({ where: { entity: "ContractTemplate", entityId: BLANK_TPL, action: "contractTemplate.review", actorId: admin.id } })).toBe(1);
    } finally {
      await setTemplateReview(admin, BLANK_TPL, false, null);
    }
  });
});

describe("routes protégées : PDF et scan", () => {
  it("PDF: 401 signed out, 403 without the page permission, 404-like 403 on another category, PDF for allowed roles", async () => {
    const { GET: pdf } = await import("@/app/api/contracts/[id]/pdf/route");
    const { GET: scan } = await import("@/app/api/contracts/[id]/scan/route");
    type Handler = (r: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
    const call = (h: Handler, id: string) => h(new Request(`http://localhost/api/contracts/${id}/pdf`), { params: Promise.resolve({ id }) });
    const reception = await makeUser("RECEPTION");
    const hr = await makeUser("HR");
    const mechanic = await makeUser("MECHANIC");
    const { wo } = await makeWorkOrder();
    const c = await createContract(reception, { templateId: REPAIR_TPL, workOrderId: wo.id, startDay: today(), fields: { authorizationToStart: "YES" } });

    session.userId = null;
    expect((await call(pdf, c.id)).status).toBe(401);
    session.userId = mechanic.id;
    expect((await call(pdf, c.id)).status).toBe(403);
    session.userId = hr.id; // HR may open the contracts page, but not repair contracts
    expect((await call(pdf, c.id)).status).toBe(403);
    expect((await call(scan, c.id)).status).toBe(403);
    session.userId = reception.id;
    const res = await call(pdf, c.id);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    const bytes = Buffer.from(await res.arrayBuffer());
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
    // The "to be validated by a lawyer" line is printed (standard fonts: WinAnsi text written in hex).
    const hex = (s: string) => Buffer.from(s, "latin1").toString("hex").toUpperCase();
    const raw = bytes.toString("latin1");
    const pages = [...raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)]
      .map((m) => {
        try {
          return inflateSync(Buffer.from(m[1]!, "latin1")).toString("latin1");
        } catch {
          return "";
        }
      })
      .join("\n");
    expect(pages).toContain(hex("Modèle à valider par un juriste — références".replace("—", "\x97")));
    expect((await call(scan, c.id)).status).toBe(404); // no scan yet
    expect((await call(pdf, "doesnotexist0000000000000")).status).toBe(404);
    session.userId = null;
  });
});

describe("contrat de flotte", () => {
  it("only for a business customer, with ITS vehicles", async () => {
    const manager = await makeUser("MANAGER");
    const { customer, vehicle } = await makeWorkOrder();
    expect(await code(createContract(manager, { templateId: FLEET_TPL, customerId: customer.id, vehicleIds: [vehicle.id], startDay: today(), durationMonths: 12 }))).toBe("contractFleetCompany");
    await prisma.customer.update({ where: { id: customer.id }, data: { isCompany: true } });
    const other = await makeWorkOrder();
    expect(await code(createContract(manager, { templateId: FLEET_TPL, customerId: customer.id, vehicleIds: [vehicle.id, other.vehicle.id], startDay: today(), durationMonths: 12 }))).toBe("contractFleetCompany");
    const c = await createContract(manager, { templateId: FLEET_TPL, customerId: customer.id, vehicleIds: [vehicle.id], startDay: "2026-10-21", durationMonths: 12 });
    const row = await prisma.contract.findUniqueOrThrow({ where: { id: c.id } });
    expect(row.endDate?.toISOString().slice(0, 10)).toBe("2027-10-20");
    expect((await listContracts(manager, { vehicleId: vehicle.id })).map((x) => x.id)).toContain(c.id);
  });
});

describe("échéances : alerte avant la date de fin, jamais de renouvellement automatique", () => {
  it("alert for the roles of the category only; renewal = new linked contract with its basis", async () => {
    const admin = await makeUser("ADMIN");
    const { customer, vehicle } = await makeWorkOrder();
    await prisma.customer.update({ where: { id: customer.id }, data: { isCompany: true } });
    const start = addDaysToDay(today(), -340);
    const c = await createContract(admin, { templateId: FLEET_TPL, customerId: customer.id, vehicleIds: [vehicle.id], startDay: start, durationMonths: 12 });
    // Straight to ACTIVE in the database (the full path is tested above).
    await prisma.contract.update({ where: { id: c.id }, data: { status: "ACTIVE", signedScanKey: "contracts/x/y.pdf", signedScanType: "application/pdf" } });

    const forAdmin = (await contractExpiryAlerts("ADMIN")).find((a) => a.id === c.id);
    expect(forAdmin?.expiry.state).toBe("SOON");
    expect((await contractExpiryAlerts("RECEPTION")).some((a) => a.id === c.id)).toBe(true);
    expect((await contractExpiryAlerts("MECHANIC")).some((a) => a.id === c.id)).toBe(false);
    expect((await contractExpiryAlerts("HR")).some((a) => a.id === c.id)).toBe(false);

    const alert = (await listAlerts(new Date(), "MANAGER")).open.find((a) => a.type === "contractExpiry" && a.contract?.id === c.id)!;
    expect(alert.key).toMatch(/^contractExpiry:/);
    expect((await listAlerts()).open.some((a) => a.type === "contractExpiry")).toBe(false);
    const mechanic = await makeUser("MECHANIC");
    expect(await code(updateAlert(mechanic, alert.key, { handled: true }))).toBe("forbidden");
    await updateAlert(admin, alert.key, { handled: true });

    // Nothing happened automatically: still ACTIVE, no new contract.
    expect((await prisma.contract.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("ACTIVE");
    expect(await prisma.contract.count({ where: { previousContractId: c.id } })).toBe(0);
    expect(await code(renewContract(admin, c.id, { startDay: today(), durationMonths: 12, basis: " " }))).toBe("contractRenewBasis");
    const r = await renewContract(admin, c.id, { startDay: addDaysToDay(today(), 30), durationMonths: 12, basis: "Accord écrit du client du 15/10" });
    const renewed = await prisma.contract.findUniqueOrThrow({ where: { id: r.id } });
    expect(renewed).toMatchObject({ previousContractId: c.id, status: "DRAFT", renewalBasis: "Accord écrit du client du 15/10" });
    expect(renewed.flags).toContain("RENEWAL");
    expect(await prisma.contractEvent.count({ where: { contractId: c.id, type: "RENEWED" } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { entity: "Contract", entityId: c.id, action: "contract.renew" } })).toBe(1);
  });
});
