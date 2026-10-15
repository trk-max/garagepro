/** Customer-site photos and videos found in public/site/ at build time (see next.config.ts). */
export type SiteMedia = {
  heroVideo: string | null;
  heroPhoto: string | null;
  bandVideo: string | null;
  bandPhoto: string | null;
  aboutVideo: string | null;
  aboutPhoto: string | null;
  gallery: string[];
};

const KEYS = ["heroVideo", "heroPhoto", "bandVideo", "bandPhoto", "aboutVideo", "aboutPhoto"] as const;

export function siteMedia(): SiteMedia {
  let raw: Record<string, unknown> = {};
  try {
    raw = JSON.parse(process.env.SITE_MEDIA ?? "{}") as Record<string, unknown>;
  } catch {
    /* keep empty */
  }
  const media = { gallery: Array.isArray(raw.gallery) ? raw.gallery.filter((g): g is string => typeof g === "string") : [] } as SiteMedia;
  for (const k of KEYS) media[k] = typeof raw[k] === "string" ? (raw[k] as string) : null;
  return media;
}
