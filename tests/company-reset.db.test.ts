/**
 * "Mot de passe oublié" of the company portal — real database tests.
 * Run: npm run test:db   (see vitest.db.config.ts)
 */
import bcrypt from "bcryptjs";
import { describe, expect, it } from "vitest";
import { authenticateCompanyUser } from "@/server/company-portal";
import { RESET_TTL_MS, companyResetToken, prepareCompanyPasswordReset, resetCompanyPassword, verifyCompanyResetToken } from "@/server/company-password";
import { prisma } from "./helpers/db";

let n = 0;
async function makeCompanyUser(extra: { isActive?: boolean; isCompany?: boolean } = {}) {
  const customer = await prisma.customer.create({ data: { name: `Flotte ${Date.now()}${n}`, phone: "71000000", isCompany: extra.isCompany ?? true } });
  return prisma.companyUser.create({
    data: { customerId: customer.id, email: `flotte${Date.now()}${n++}@test.tn`, name: "Responsable", role: "FLEET_ADMIN", passwordHash: await bcrypt.hash("ancien-mot-de-passe", 4), isActive: extra.isActive ?? true },
  });
}
const code = async (p: Promise<unknown>) => p.then(() => "NO ERROR", (e: { code?: string }) => e.code);

describe("mot de passe oublié (portail entreprise)", () => {
  it("full flow: link → new password works, old one no longer, link single use, journal lines", async () => {
    const u = await makeCompanyUser();
    const reset = await prepareCompanyPasswordReset(u.email.toUpperCase(), "10.0.0.1");
    expect(reset?.email).toBe(u.email);

    expect((await verifyCompanyResetToken(reset!.token))?.id).toBe(u.id);
    await resetCompanyPassword(reset!.token, "nouveau-mot-de-passe", "10.0.0.1");

    expect((await authenticateCompanyUser(u.email, "nouveau-mot-de-passe", "10.0.0.2")).id).toBe(u.id);
    expect(await code(authenticateCompanyUser(u.email, "ancien-mot-de-passe", "10.0.0.2"))).toBe("companyLogin");
    // Same link a second time: refused (the password hash it was signed with has changed).
    expect(await verifyCompanyResetToken(reset!.token)).toBeNull();
    expect(await code(resetCompanyPassword(reset!.token, "encore-un-autre", "10.0.0.1"))).toBe("resetLinkInvalid");

    const actions = (await prisma.auditLog.findMany({ where: { entityId: u.id }, orderBy: { createdAt: "asc" } })).map((l) => l.action);
    expect(actions).toEqual(["companyUser.resetRequest", "companyUser.passwordReset"]);
    const line = await prisma.auditLog.findFirstOrThrow({ where: { entityId: u.id, action: "companyUser.passwordReset" } });
    expect(JSON.stringify(line.after)).not.toContain("nouveau-mot-de-passe");
  });

  it("unknown, disabled or non-company account: nothing to send, same answer", async () => {
    expect(await prepareCompanyPasswordReset("personne@nulle-part.tn", "10.0.1.1")).toBeNull();
    const off = await makeCompanyUser({ isActive: false });
    expect(await prepareCompanyPasswordReset(off.email, "10.0.1.1")).toBeNull();
    const notCompany = await makeCompanyUser({ isCompany: false });
    expect(await prepareCompanyPasswordReset(notCompany.email, "10.0.1.1")).toBeNull();
  });

  it("expired, tampered or disabled-account links are refused", async () => {
    const u = await makeCompanyUser();
    const old = companyResetToken(u, Date.now() - RESET_TTL_MS - 1000);
    expect(await verifyCompanyResetToken(old)).toBeNull();

    const good = companyResetToken(u);
    const [id, exp, sig] = good.split(".");
    expect(await verifyCompanyResetToken(`${id}.${Number(exp) + 3600}.${sig}`)).toBeNull(); // longer validity = bad signature
    expect(await verifyCompanyResetToken(`${id}.${exp}.${sig}x`)).toBeNull();
    expect(await verifyCompanyResetToken(`${good}.extra`)).toBeNull();

    await prisma.companyUser.update({ where: { id: u.id }, data: { isActive: false } });
    expect(await verifyCompanyResetToken(good)).toBeNull();
  });

  it("at most 3 requests per e-mail per hour", async () => {
    const u = await makeCompanyUser();
    for (let i = 0; i < 3; i++) expect(await prepareCompanyPasswordReset(u.email, `10.0.2.${i}`)).not.toBeNull();
    expect(await code(prepareCompanyPasswordReset(u.email, "10.0.2.9"))).toBe("tooMany");
  });
});
