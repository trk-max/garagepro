import "server-only";
import { AppError } from "@/lib/http";

/**
 * Public URL of the site, for links sent to customers (SMS, WhatsApp, e-mail).
 *
 * Comes ONLY from the APP_URL setting, never from the request's Host /
 * X-Forwarded-Host headers: those are chosen by whoever sends the request, so a
 * forged header could make the garage send its customers a link to another site.
 * - APP_URL set           → that address (must be http:// or https://);
 * - production, no APP_URL → error "appUrlMissing" (set APP_URL in .env / on Vercel);
 * - development            → http://localhost:<PORT>.
 */
export function resolveBaseUrl(env: Record<string, string | undefined> = process.env): string {
  const raw = env.APP_URL?.trim();
  if (raw) {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new AppError("appUrlMissing", {}, 500);
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new AppError("appUrlMissing", {}, 500);
    return `${url.origin}${url.pathname}`.replace(/\/+$/, "");
  }
  if (env.NODE_ENV === "production") throw new AppError("appUrlMissing", {}, 500);
  return `http://localhost:${env.PORT || "3000"}`;
}

export async function getBaseUrl(): Promise<string> {
  return resolveBaseUrl();
}
