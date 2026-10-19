import "server-only";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import type { CompanyViewer } from "@/server/company-portal";
import { safeEqual, sign } from "@/server/portal-session";

/**
 * Company portal session: a signed cookie (separate from the staff session).
 * The signature includes the password hash: changing the password or
 * deactivating the account logs out every device at once.
 */
const COOKIE = "gp_company";
const TTL_SECONDS = 12 * 60 * 60;

export async function startCompanySession(user: { id: string; passwordHash: string }) {
  const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const value = `${user.id}.${exp}.${sign(`company.${user.id}.${exp}.${user.passwordHash}`)}`;
  (await cookies()).set(COOKIE, value, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: TTL_SECONDS });
}

export async function endCompanySession() {
  (await cookies()).delete(COOKIE);
}

export async function getCompanyViewer(): Promise<CompanyViewer | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const [id, expStr, signature] = raw.split(".");
  const exp = Number(expStr);
  if (!id || !signature || !Number.isFinite(exp) || exp * 1000 < Date.now()) return null;
  const user = await prisma.companyUser.findUnique({
    where: { id },
    select: { id: true, customerId: true, role: true, name: true, email: true, isActive: true, passwordHash: true, customer: { select: { isCompany: true } } },
  });
  if (!user || !user.isActive || !user.customer.isCompany) return null;
  if (!safeEqual(signature, sign(`company.${user.id}.${exp}.${user.passwordHash}`))) return null;
  return { id: user.id, customerId: user.customerId, role: user.role, name: user.name, email: user.email };
}
