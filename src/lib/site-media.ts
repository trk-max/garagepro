/** Customer-site photos and videos found in public/site/ at build time (see next.config.ts). */
const SLOTS = ["hero", "band", "about", "assistant", "suivi", "login"] as const;
export type MediaSlot = (typeof SLOTS)[number];

export type SiteMedia = { [K in `${MediaSlot}Video` | `${MediaSlot}Photo`]: string | null } & { gallery: string[] };

export function siteMedia(): SiteMedia {
  let raw: Record<string, unknown> = {};
  try {
    raw = JSON.parse(process.env.SITE_MEDIA ?? "{}") as Record<string, unknown>;
  } catch {
    /* keep empty */
  }
  const str = (k: string) => (typeof raw[k] === "string" ? (raw[k] as string) : null);
  const media = { gallery: Array.isArray(raw.gallery) ? raw.gallery.filter((g): g is string => typeof g === "string") : [] } as SiteMedia;
  for (const s of SLOTS) {
    media[`${s}Video`] = str(`${s}Video`);
    media[`${s}Photo`] = str(`${s}Photo`);
  }
  return media;
}

/** Video + photo of a slot, falling back to another slot when the slot has neither. */
export function slotMedia(media: SiteMedia, slot: MediaSlot, fallback?: MediaSlot) {
  const video = media[`${slot}Video`];
  const photo = media[`${slot}Photo`];
  if (video || photo || !fallback) return { video, photo };
  return { video: media[`${fallback}Video`], photo: media[`${fallback}Photo`] };
}
