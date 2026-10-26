/**
 * Équipe sur téléphone — « Nouveau véhicule pour vous »: the mechanic gets an alert when an order is assigned to
 * him (assisted assignment / reassignment / new order), it leaves the previous mechanic, and opening the car ends it.
 */
import { afterAll, describe, expect, it } from "vitest";
import type { StaffUser } from "@/lib/session";

const helpers = await import("./helpers/db");
const { makeWorkOrder, prisma } = helpers;
const { assignMechanic } = await import("@/server/work-orders");
const { countNewAssignments, markAssignmentSeen, newAssignmentIds } = await import("@/server/assignment-alerts");
const { todoCounts } = await import("@/server/todo");

const created: string[] = [];
const makeUser = async (role: "ADMIN" | "MECHANIC") => {
  const u = await helpers.makeUser(role);
  created.push(u.id);
  return u;
};
afterAll(async () => {
  await prisma.user.updateMany({ where: { id: { in: created } }, data: { isActive: false } });
});

describe("assignment alert", () => {
  it("assign → alert for the mechanic; reassign → moves to the new one; open → done; audit kept", async () => {
    const admin = (await makeUser("ADMIN")) as StaffUser;
    const m1 = await makeUser("MECHANIC");
    const m2 = await makeUser("MECHANIC");
    const { wo } = await makeWorkOrder({ status: "DIAGNOSIS" });

    await assignMechanic(wo.id, m1.id, admin);
    expect(await newAssignmentIds(m1.id)).toEqual([wo.id]);
    expect((await todoCounts({ id: m1.id, role: "MECHANIC" })).newAssignments).toBe(1);

    await assignMechanic(wo.id, m2.id, admin);
    expect(await newAssignmentIds(m1.id)).toEqual([]);
    expect(await newAssignmentIds(m2.id)).toEqual([wo.id]);

    await markAssignmentSeen(wo.id, m2.id);
    expect(await countNewAssignments(m2.id)).toBe(0);

    // Unassigned: nothing left for anyone; the journal keeps every assignment.
    await assignMechanic(wo.id, m1.id, admin);
    await assignMechanic(wo.id, null, admin);
    expect(await countNewAssignments(m1.id)).toBe(0);
    expect(await prisma.auditLog.count({ where: { entityId: wo.id, action: "skills.assign" } })).toBe(4);
  });

  it("a finished order never alerts", async () => {
    const admin = (await makeUser("ADMIN")) as StaffUser;
    const m = await makeUser("MECHANIC");
    const { wo } = await makeWorkOrder({ status: "IN_PROGRESS" });
    await assignMechanic(wo.id, m.id, admin);
    await prisma.workOrder.update({ where: { id: wo.id }, data: { status: "DELIVERED" } });
    expect(await newAssignmentIds(m.id)).toEqual([]);
  });
});
