/**
 * Client IP used as the key of the per-visitor rate limits (booking, complaints,
 * reviews, AI assistant, portal PIN, staff login).
 *
 * The left-most X-Forwarded-For value is written by the CLIENT, so it is never
 * used as is:
 * - on Vercel (VERCEL=1) the platform sets x-vercel-forwarded-for / x-real-ip
 *   itself (a client cannot forge them), so those are used;
 * - elsewhere, TRUSTED_PROXY_HOPS tells how many proxies we trust in front of the
 *   app (default 1): the client IP is the entry written by the outermost trusted
 *   proxy, i.e. the LAST hop with 1 proxy. With 0 (app reached directly, e.g. the
 *   garage PC on the LAN), forwarding headers are ignored and every request shares
 *   one bucket — nobody can get a fresh limit by inventing a header.
 */
type HeaderBag = { get(name: string): string | null };

export function ipFromHeaders(h: HeaderBag | undefined, env: Record<string, string | undefined> = process.env): string {
  if (!h) return "unknown";
  const first = (v: string | null) => v?.split(",")[0]?.trim() || null;

  if (env.VERCEL) {
    return first(h.get("x-vercel-forwarded-for")) || first(h.get("x-real-ip")) || first(h.get("x-forwarded-for")) || "unknown";
  }

  const hops = Number.parseInt(env.TRUSTED_PROXY_HOPS ?? "1", 10);
  if (!Number.isFinite(hops) || hops <= 0) return "direct";
  const chain = (h.get("x-forwarded-for") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (chain.length === 0) return first(h.get("x-real-ip")) || "unknown";
  return chain[Math.max(0, chain.length - hops)]!;
}
