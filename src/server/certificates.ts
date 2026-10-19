import "server-only";
import { buildCertificateSnapshot, missingCertificateFields, type CertificateSnapshot } from "@/lib/certificate";
import { AppError } from "@/lib/http";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import type { StaffUser } from "@/lib/session";
import { audit } from "@/server/audit";
import { assertCanNumberDocuments } from "@/server/hub";

/** Issues (and archives) a work certificate with the data really recorded. */
export async function issueCertificate(actor: StaffUser, userId: string, input: { purpose?: string | null; endDate?: Date | null }) {
  if (!can(actor.role, "issueCertificates")) throw new AppError("forbidden", {}, 403);
  return prisma.$transaction(async (tx) => {
    const [setting, employee] = await Promise.all([
      tx.setting.findUnique({ where: { id: "garage" } }),
      tx.user.findUnique({ where: { id: userId }, select: { name: true, nationalId: true, jobTitle: true, hireDate: true, isActive: true } }),
    ]);
    if (!employee) throw new AppError("notFound", {}, 404);
    const sources = { company: { ...setting }, employee, endDate: input.endDate ?? null };
    const missing = missingCertificateFields(sources);
    if (missing.length) throw new AppError("certificateMissing", { fields: missing.join(", ") }, 422);
    assertCanNumberDocuments();
    const now = new Date();
    const year = now.getFullYear();
    const seq = await tx.sequence.upsert({ where: { key: `certificate-${year}` }, create: { key: `certificate-${year}`, value: 1 }, update: { value: { increment: 1 } } });
    const number = `ATT-${year}-${String(seq.value).padStart(4, "0")}`;
    const snapshot = buildCertificateSnapshot(number, now, sources, input.purpose || null);
    const cert = await tx.workCertificate.create({ data: { number, userId, issuedById: actor.id, purpose: input.purpose || null, snapshot, issuedAt: now }, select: { id: true, number: true } });
    await audit(tx, actor, "certificate.issue", "WorkCertificate", cert.id, { after: { number, userId, purpose: input.purpose || null } });
    return cert;
  });
}

export async function listCertificates(userId: string) {
  return prisma.workCertificate.findMany({ where: { userId }, orderBy: { issuedAt: "desc" }, select: { id: true, number: true, issuedAt: true, purpose: true } });
}

export async function getCertificate(id: string): Promise<{ number: string; userId: string; snapshot: CertificateSnapshot } | null> {
  const c = await prisma.workCertificate.findUnique({ where: { id }, select: { number: true, userId: true, snapshot: true } });
  return c ? { number: c.number, userId: c.userId, snapshot: c.snapshot as unknown as CertificateSnapshot } : null;
}
