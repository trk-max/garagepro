import type { MetadataRoute } from "next";

/** Installable app (PC and phone): opens the staff space in its own window. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/garage",
    name: "GaragePro",
    short_name: "GaragePro",
    description: "Gestion d'atelier mécanique — GaragePro",
    start_url: "/garage",
    scope: "/",
    display: "standalone",
    display_override: ["window-controls-overlay", "standalone"],
    orientation: "any",
    background_color: "#000000",
    theme_color: "#000000",
    lang: "fr",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Nouvel ordre", url: "/garage/work-orders/new", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Atelier (mobile)", url: "/garage/atelier", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Rendez-vous", url: "/garage/appointments", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
