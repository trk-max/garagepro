import { manifestResponse } from "@/server/pwa";

export const dynamic = "force-dynamic";

/** Web app manifest (team app) — see src/lib/pwa-manifests.ts. */
export function GET() {
  return manifestResponse("team");
}
