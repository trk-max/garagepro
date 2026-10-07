import NextAuth, { CredentialsSignin, type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isLimited, recordAttempt } from "@/server/rate-limit";

declare module "next-auth" {
  interface Session {
    user: { id: string; role: Role } & DefaultSession["user"];
  }
  interface User {
    role: Role;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id: string;
    role: Role;
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
  const h = request?.headers;
  return h?.get("x-forwarded-for")?.split(",")[0]?.trim() || h?.get("x-real-ip") || "unknown";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw, request) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const emailKey = `login:email:${parsed.data.email}`;
        const ipKey = `login:ip:${requestIp(request)}`;
        if (
          (await isLimited(emailKey, LOGIN_MAX_FAILS_PER_EMAIL, LOGIN_LOCK_MINUTES)) ||
          (await isLimited(ipKey, LOGIN_MAX_FAILS_PER_IP, LOGIN_LOCK_MINUTES))
        ) {
          throw new TooManyAttempts();
        }

        const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
        // Same work whether or not the account exists (no timing hint about valid e-mails).
        const valid = await bcrypt.compare(parsed.data.password, user?.passwordHash ?? DUMMY_HASH);
        if (!user || !user.isActive || !valid) {
          await Promise.all([recordAttempt(emailKey, false), recordAttempt(ipKey, false)]);
          return null;
        }

        await prisma.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date() } });
        return { id: user.id, email: user.email, name: user.name, role: user.role };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.id;
      session.user.role = token.role;
      return session;
    },
  },
});
