import "server-only";
import { AppError } from "@/lib/http";

/**
 * Garage hub mode (offline): the garage PC has its own database, synchronised
 * with the online one (scripts/hub). Set on each side:
 * - garage PC:   GARAGE_HUB_LOCAL=1  (shows the sync status in the menu)
 * - online site: GARAGE_HUB=1        (on Vercel)
 */
export const isHubLocal = () => process.env.GARAGE_HUB_LOCAL === "1";
export const isCloudWithHub = () => process.env.GARAGE_HUB === "1" && !isHubLocal();

/**
 * Invoice / purchase-order / receipt numbers must follow each other with no gap
 * and no duplicate. With a hub, they are issued ONLY by the garage PC: two
 * places counting at once (one offline) would give the same number twice.
 */
export function assertCanNumberDocuments(): void {
  if (isCloudWithHub()) throw new AppError("hubOnly", {}, 409);
}
