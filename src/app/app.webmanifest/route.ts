import { manifestResponse } from "@/server/pwa";

export const dynamic = "force-dynamic";

/** Web app manifest (client app) — see src/lib/pwa-manifests.ts. */
export function GET() {
  return manifestResponse("client");
}
