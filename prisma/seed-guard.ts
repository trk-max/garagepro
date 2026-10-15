/**
 * The demo seed creates staff accounts with the public password "password123"
 * (admin@garage.tn …). It must never land in a real database by accident.
 * Refused when:
 *  - NODE_ENV is "production", or
 *  - DATABASE_URL points to Supabase (supabase.com / supabase.co): the hosted,
 *    real database — whatever NODE_ENV the shell running the seed has.
 * ALLOW_DEMO_SEED=true overrides both, on purpose only.
 */
export function demoSeedRefusal(env: Record<string, string | undefined>): string | null {
  if (env.ALLOW_DEMO_SEED === "true") return null;
  if (env.NODE_ENV === "production") {
    return "Refusing to seed demo accounts in production (set ALLOW_DEMO_SEED=true to override).";
  }
  if (isSupabaseUrl(env.DATABASE_URL)) {
    return "Refusing to seed demo accounts (password123) into a Supabase database. Set ALLOW_DEMO_SEED=true only if this database is a throw-away test.";
  }
  return null;
}

function isSupabaseUrl(raw: string | undefined): boolean {
  if (!raw) return false;
  let host: string;
  try {
    host = new URL(raw).hostname.toLowerCase();
  } catch {
    // Unparsable URL: be safe and look at the raw text.
    return /supabase\.(com|co)\b/i.test(raw);
  }
  return /(^|\.)supabase\.(com|co)$/.test(host);
}
