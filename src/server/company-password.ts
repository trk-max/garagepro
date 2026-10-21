import "server-only";
import bcrypt from "bcryptjs";
import { AppError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { audit } from "@/server/audit";
import { reserveAttempt } from "@/server/rate-limit";
import { safeEqual, sign } from "@/server/portal-session";

/**
 * "Mot de passe oublié" for company portal accounts, without a token table:
 * the link carries   id . expiry . HMAC(AUTH_SECRET, id, expiry, current password hash).
 * - valid 1 hour;
 * - single use: once the password changes, the hash changes and the link dies;
 * - works on the garage PC and online alike (same AUTH_SECRET, nothing to sync).
 */
export const RESET_TTL_MS = 60 * 60 * 1000;

const payload = (id: string, exp: number, passwordHash: string) => `company-reset.${id}.${exp}.${passwordHash}`;

export function companyResetToken(user: { id: string; passwordHash: string }, now = Date.now()): string {
  const exp = Math.floor((now + RESET_TTL_MS) / 1000);
  return `${user.id}.${exp}.${sign(payload(user.id, exp, user.passwordHash))}`;
}

/** The account the link belongs to, or null (wrong, expired, already used, account disabled). */
export async function verifyCompanyResetToken(token: string, now = Date.now()) {
  const [id, expStr, signature, extra] = token.split(".");
  const exp = Number(expStr);
  if (!id || !signature || extra !== undefined || !Number.isInteger(exp) || exp * 1000 < now) return null;
  const user = await prisma.companyUser.findUnique({
    where: { id },
    select: { id: true, email: true, name: true, passwordHash: true, isActive: true, customer: { select: { isCompany: true } } },
  });
  if (!user || !user.isActive || !user.customer.isCompany) return null;
  return safeEqual(signature, sign(payload(user.id, exp, user.passwordHash))) ? user : null;
}

/**
 * Step 1 (public form): returns the link token when the e-mail belongs to an
 * active company account, null otherwise. The caller answers the SAME message
 * in both cases (no way to learn which e-mails have an account).
 * Rate-limited per IP and per e-mail; every call counts (not only failures).
 */
export async function prepareCompanyPasswordReset(email: string, ip: string) {
  const normalized = email.trim().toLowerCase();
  const reserved = await reserveAttempt(
    [
      { key: `company-reset-ip:${ip}`, max: 10 },
      { key: `company-reset:${normalized}`, max: 3 },
    ],
    60,
    false,
  );
  if (!reserved) throw new AppError("tooMany", {}, 429);
  const user = await prisma.companyUser.findUnique({
    where: { email: normalized },
    select: { id: true, email: true, name: true, passwordHash: true, isActive: true, customer: { select: { isCompany: true, name: true } } },
  });
  if (!user || !user.isActive || !user.customer.isCompany) return null;
  await audit(prisma, null, "companyUser.resetRequest", "CompanyUser", user.id, { after: { email: user.email }, ip });
  return { email: user.email, name: user.name, companyName: user.customer.name, token: companyResetToken(user) };
}

/** Step 2 (link in the e-mail): sets the new password; the link and all open sessions stop working. */
export async function resetCompanyPassword(token: string, password: string, ip: string) {
  const user = await verifyCompanyResetToken(token);
  if (!user) throw new AppError("resetLinkInvalid", {}, 400);
  const passwordHash = await bcrypt.hash(password, 12);
  return prisma.$transaction(async (tx) => {
    // Conditional write: two clicks on the same link cannot both succeed.
    const { count } = await tx.companyUser.updateMany({ where: { id: user.id, passwordHash: user.passwordHash }, data: { passwordHash } });
    if (count === 0) throw new AppError("resetLinkInvalid", {}, 400);
    await audit(tx, null, "companyUser.passwordReset", "CompanyUser", user.id, { after: { email: user.email, by: "lien e-mail" }, ip });
    return { id: user.id, passwordHash };
  });
}
