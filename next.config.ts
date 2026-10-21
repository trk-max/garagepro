import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

/**
 * Customer-site media, found at build time in public/site/ (Vercel's
 * functions cannot read public/ at runtime, so the list is baked in):
 *   hero.mp4|webm + hero.jpg    home hero (video, and its poster/fallback photo)
 *   band.mp4|webm + band.jpg    "protocol" band of the home page
 *   about.mp4|webm + about.jpg  hero of the "L'atelier" page
 *   assistant.* / suivi.* / login.*  banners of those pages (login falls back to hero)
 *   galerie/*.jpg|webp|png      gallery (6 photos fill the mosaic exactly)
 */
function scanSiteMedia() {
  const dir = path.join(process.cwd(), "public", "site");
  const pick = (base: string, exts: string[]) => {
    const ext = exts.find((e) => existsSync(path.join(dir, `${base}.${e}`)));
    return ext ? `/site/${base}.${ext}` : null;
  };
  const galleryDir = path.join(dir, "galerie");
  const gallery = existsSync(galleryDir)
    ? readdirSync(galleryDir)
        .filter((f) => /\.(jpe?g|png|webp|avif)$/i.test(f))
        .sort()
        .slice(0, 12)
        .map((f) => `/site/galerie/${encodeURIComponent(f)}`)
    : [];
  const legacyHero = existsSync(path.join(process.cwd(), "public", "hero.jpg")) ? "/hero.jpg" : null;
  const VIDEO = ["mp4", "webm"];
  const PHOTO = ["jpg", "jpeg", "webp", "png", "avif"];
  const slots: Record<string, string | null> = {};
  for (const slot of ["hero", "band", "about", "assistant", "suivi", "login"]) {
    slots[`${slot}Video`] = pick(slot, VIDEO);
    slots[`${slot}Photo`] = pick(slot, PHOTO);
  }
  slots.heroPhoto ??= legacyHero;
  return {
    ...slots,
    gallery,
  };
}

const nextConfig: NextConfig = {
  // scripts/serve.mjs builds into .next-new, then switches it in only if the build succeeded.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // The project folder is the root, even if a stray package-lock.json exists in a parent folder.
  turbopack: { root: process.cwd() },
  outputFileTracingRoot: process.cwd(),
  env: { SITE_MEDIA: JSON.stringify(scanSiteMedia()) },
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
  // The service worker must always be fetched fresh, or app updates would never arrive.
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
