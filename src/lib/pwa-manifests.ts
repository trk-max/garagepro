import type { Metadata, MetadataRoute } from "next";

/**
 * The two installable apps (same site, same data, no store):
 * - CLIENT app « /app »: track my repair, book, showroom, assistant — named after the garage (settings);
 * - TEAM app « /equipe » (→ /garage/app after sign-in): the role-focused « Espace équipe ».
 * Served by app/app.webmanifest, app/equipe.webmanifest and app/manifest.webmanifest (old URL, team app:
 * the staff app already installed keeps its id "/garage" and is simply renamed / moved to the team space).
 * Pure functions (unit-tested in tests/pwa-app.test.ts).
 */
export const CLIENT_MANIFEST_URL = "/app.webmanifest";
export const TEAM_MANIFEST_URL = "/equipe.webmanifest";
export const APP_BG = "#0b0b0c";

type Labels = { track: string; book: string; showroom: string; teamSpace: string; workshop: string; newOrder: string; appointments: string; clientDescription: string; teamDescription: string; teamName: string };

const icons = (kind: "app" | "team"): MetadataRoute.Manifest["icons"] => [
  { src: `/icons/${kind}-192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
  { src: `/icons/${kind}-512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
  { src: `/icons/${kind}-maskable-512.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
];

const shortcut = (kind: "app" | "team", name: string, url: string) => ({ name, short_name: name, url, icons: [{ src: `/icons/${kind}-192.png`, sizes: "192x192", type: "image/png" }] });

/** Short name on the home screen: at most ~12 characters are shown under the icon. */
export function shortName(name: string): string {
  const n = name.trim() || "GaragePro";
  return n.length <= 12 ? n : n.split(/\s+/)[0]!.slice(0, 12);
}

export function clientManifest(garageName: string, lang: string, dir: "ltr" | "rtl", l: Labels): MetadataRoute.Manifest {
  const name = garageName.trim() || "GaragePro";
  return {
    id: "/app",
    name,
    short_name: shortName(name),
    description: l.clientDescription,
    start_url: "/app",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: APP_BG,
    theme_color: APP_BG,
    lang,
    dir,
    categories: ["auto", "lifestyle"],
    icons: icons("app"),
    shortcuts: [shortcut("app", l.track, "/suivi"), shortcut("app", l.book, "/rdv"), shortcut("app", l.showroom, "/showroom")],
  };
}

export function teamManifest(lang: string, dir: "ltr" | "rtl", l: Labels): MetadataRoute.Manifest {
  return {
    // Same id as the staff app installed before (V6): the installed icon becomes the team app.
    id: "/garage",
    name: l.teamName,
    short_name: "GP Équipe",
    description: l.teamDescription,
    start_url: "/equipe",
    scope: "/",
    display: "standalone",
    display_override: ["window-controls-overlay", "standalone"],
    orientation: "any",
    background_color: APP_BG,
    theme_color: APP_BG,
    lang,
    dir,
    categories: ["business", "productivity"],
    icons: icons("team"),
    shortcuts: [
      shortcut("team", l.teamSpace, "/garage/app"),
      shortcut("team", l.workshop, "/garage/atelier"),
      shortcut("team", l.newOrder, "/garage/work-orders/new"),
      shortcut("team", l.appointments, "/garage/appointments"),
    ],
  };
}

/** Where to go after signing in: only a staff page of this site (never another host, never "//"). */
export function safeStaffNext(raw: unknown): string {
  const s = typeof raw === "string" ? raw : "";
  return /^\/garage(\/[A-Za-z0-9_\-/]*)?$/.test(s) && !s.includes("//") ? s : "/garage";
}

/** Page metadata of the staff pages and /login: they install the TEAM app (icon with the orange badge). */
export const TEAM_APP_METADATA: Metadata = {
  manifest: TEAM_MANIFEST_URL,
  appleWebApp: { capable: true, title: "GP Équipe", statusBarStyle: "black-translucent" },
  icons: { apple: "/icons/team-apple-180.png" },
};
