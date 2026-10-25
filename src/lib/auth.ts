import NextAuth, { CredentialsSignin, type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ipFromHeaders } from "@/lib/client-ip";
import { markAttemptsOk, reserveAttempt } from "@/server/rate-limit";

declare module "next-auth" {
  interface Session {
    /** sv = session version of the cookie (logout everywhere, see lib/session.ts getStaff). */
    user: { id: string; role: Role; sv: number } & DefaultSession["user"];
  }
  interface User {
    role: Role;
    sessionVersion?: number;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id: string;
    role: Role;
    /** User.sessionVersion when the cookie was issued (absent on older cookies = 0). */
    sv?: number;
  }
}

const credentialsSchema = z.object({
  email: z.string().trim().email().max(200).transform((v) => v.toLowerCase()),
  password: z.string().min(1).max(200),
});

/** Brute-force protection for staff login (same DB-backed limiter as the customer portal). */
export const LOGIN_MAX_FAILS_PER_EMAIL = 5;
export const LOGIN_MAX_FAILS_PER_IP = 30;
export const LOGIN_LOCK_MINUTES = 15;

/** Thrown when too many failed attempts: the login page shows a "try again later" message. */
class TooManyAttempts extends CredentialsSignin {
  code = "locked";
}

/** bcrypt hash of a random throw-away string, compared when the e-mail is unknown. */
const DUMMY_HASH = "$2b$12$eC5BuRcUIHN7N1lpACqZP.9WFQ2y0gipZqNiNHJQVbezd0eTcO/l6";

function requestIp(request: Request | undefined): string {
  return ipFromHeaders(request?.headers);
}

/**
 * E-mail + password check with an atomic lockout: the attempt is written as a
 * failure BEFORE the bcrypt check, under a lock (reserveAttempt), so parallel
 * wrong passwords cannot all pass the "5 per e-mail / 15 min" check; it is
 * flipped to a success only when the password is right.
 */
export async function authorizeStaff(raw: unknown, request: Request | undefined) {
  const parsed = credentialsSchema.safeParse(raw);
  if (!parsed.success) return null;

  const emailKey = `login:email:${parsed.data.email}`;
  const ipKey = `login:ip:${requestIp(request)}`;
  const attempt = await reserveAttempt(
    [
      { key: emailKey, max: LOGIN_MAX_FAILS_PER_EMAIL },
      { key: ipKey, max: LOGIN_MAX_FAILS_PER_IP },
    ],
    LOGIN_LOCK_MINUTES,
    true,
  );
  if (!attempt) throw new TooManyAttempts();

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  // Same work whether or not the account exists (no timing hint about valid e-mails).
  const valid = await bcrypt.compare(parsed.data.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !user.isActive || !valid) return null; // stays recorded as a failure

  await markAttemptsOk(attempt);
  await prisma.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date() } });
  return { id: user.id, email: user.email, name: user.name, role: user.role, sessionVersion: user.sessionVersion };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      authorize: (raw, request) => authorizeStaff(raw, request),
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) {
        token.id = user.id;
        token.role = user.role;
        token.sv = user.sessionVersion ?? 0;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.id;
      session.user.role = token.role;
      session.user.sv = token.sv ?? 0;
      return session;
    },
  },
});
