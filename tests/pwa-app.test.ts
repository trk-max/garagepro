import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Role } from "@prisma/client";
import { ar } from "@/lib/i18n/ar";
import { en } from "@/lib/i18n/en";
import { fr } from "@/lib/i18n/fr";
import { can } from "@/lib/permissions";
import { clientManifest, safeStaffNext, shortName, teamManifest } from "@/lib/pwa-manifests";
import { TEAM_FOCUS, TEAM_TILE_KEYS, TEAM_TILES, teamSections, teamTiles } from "@/lib/team-app";
import { workshopMoves } from "@/lib/workshop-moves";

const ROOT = path.resolve(import.meta.dirname, "..");
const labels = {
  ...fr.app.manifest,
  track: fr.app.client.track,
  book: fr.app.client.book,
  showroom: fr.app.client.showroom,
  teamSpace: fr.app.team.title,
  workshop: fr.app.team.tiles.workshop,
  newOrder: fr.app.team.tiles.newOrder,
  appointments: fr.app.team.tiles.appointments,
};

describe("PWA — manifests", () => {
  it("client app: /app, named after the garage, installable icons that exist", () => {
    const m = clientManifest("911 Garages", "fr", "ltr", labels);
    expect(m).toMatchObject({ id: "/app", start_url: "/app", scope: "/", display: "standalone", name: "911 Garages", short_name: "911 Garages" });
    const sizes = m.icons!.map((i) => `${i.sizes}:${i.purpose}`);
    expect(sizes).toEqual(["192x192:any", "512x512:any", "512x512:maskable"]);
    for (const i of m.icons!) expect(existsSync(path.join(ROOT, "public", i.src))).toBe(true);
    expect(m.shortcuts!.map((s) => s.url)).toEqual(["/app/suivi", "/app/rdv", "/app/showroom"]);
  });

  it("team app keeps the id of the staff app already installed, starts on /equipe", () => {
    const m = teamManifest("ar", "rtl", labels);
    expect(m).toMatchObject({ id: "/garage", start_url: "/equipe", dir: "rtl", lang: "ar" });
    for (const i of m.icons!) expect(existsSync(path.join(ROOT, "public", i.src))).toBe(true);
    expect(existsSync(path.join(ROOT, "public/icons/team-apple-180.png"))).toBe(true);
    expect(existsSync(path.join(ROOT, "public/icons/app-apple-180.png"))).toBe(true);
  });

  it("short name fits under the icon; empty name falls back to GaragePro", () => {
    expect(shortName("")).toBe("GaragePro");
    expect(shortName("Garage Ben Ali Automobiles")).toBe("Garage");
  });

  it("after sign-in: only a staff page of this site", () => {
    expect(safeStaffNext("/garage/app")).toBe("/garage/app");
    expect(safeStaffNext("/garage/app/ordre/abc_1")).toBe("/garage/app/ordre/abc_1");
    for (const bad of ["https://evil.example/garage", "//evil.example", "/garage//x", "/suivi", "/garagex", "/garage/app?x=1", null, 3])
      expect(safeStaffNext(bad)).toBe("/garage");
  });

  it("the service worker version changed (phones reinstall it) and pages stay network-first", () => {
    const sw = readFileSync(path.join(ROOT, "public/sw.js"), "utf8");
    expect(sw).not.toContain(`"gp-v6-1"`);
    expect(sw).toContain(`addEventListener("push"`);
    expect(sw).toContain(`addEventListener("notificationclick"`);
    expect(sw).toContain(`if (req.method !== "GET") return;`);
    expect(sw).toContain(`if (url.pathname.startsWith("/api/")) return;`);
    expect(sw).toMatch(/req\.mode === "navigate"[\s\S]*fetch\(req\)/);
  });
});

describe("PWA — Espace équipe tiles", () => {
  const roles = Object.keys(TEAM_FOCUS) as Role[];

  it("never shows a page the person may not open (every role)", () => {
    for (const role of roles) {
      const { main, more } = teamTiles({ role });
      for (const k of [...main, ...more]) expect(TEAM_TILES[k].visible(role), `${role} ${k}`).toBe(true);
      expect(new Set([...main, ...more]).size).toBe(main.length + more.length);
    }
  });

  it("role focus: mechanic → workshop first; reception → queue desk; storekeeper → missing parts; manager → À traiter", () => {
    expect(teamTiles({ role: "MECHANIC" }).main[0]).toBe("workshop");
    expect(teamTiles({ role: "RECEPTION" }).main.slice(0, 3)).toEqual(["queue", "appointments", "newOrder"]);
    expect(teamTiles({ role: "STOREKEEPER" }).main.slice(0, 3)).toEqual(["missingParts", "receipts", "lowStock"]);
    expect(teamTiles({ role: "MANAGER" }).main[0]).toBe("todo");
    expect(teamTiles({ role: "MECHANIC" }).main).not.toContain("invoices");
    expect([...teamTiles({ role: "MECHANIC" }).main, ...teamTiles({ role: "MECHANIC" }).more]).not.toContain("board");
  });

  it("per-user access: a denied permission removes the tile, a granted one adds it", () => {
    const denied = teamTiles({ role: "RECEPTION", perms: { grant: [], deny: ["useReception"] } });
    expect([...denied.main, ...denied.more]).not.toContain("queue");
    const granted = teamTiles({ role: "MECHANIC", perms: { grant: ["useReception"], deny: [] } });
    expect(granted.more).toContain("queue");
    expect(teamSections({ role: "MECHANIC", perms: { grant: ["useReception"], deny: [] } }).queue).toBe(true);
  });

  it("sections: the mechanic's cars, today's appointments for the desk only", () => {
    expect(teamSections({ role: "MECHANIC" })).toMatchObject({ myOrders: true, appointments: false, queue: false });
    expect(teamSections({ role: "RECEPTION" })).toMatchObject({ appointments: true, queue: true });
    expect(teamSections({ role: "STOREKEEPER" })).toMatchObject({ myOrders: false, appointments: false });
  });

  it("every tile has a label in fr / ar / en", () => {
    for (const k of TEAM_TILE_KEYS) for (const d of [fr, ar, en]) expect(d.app.team.tiles[k]).toBeTruthy();
  });
});

describe("PWA — phone status moves (shared with /garage/atelier)", () => {
  const settings = { allowWorkWithoutQuote: false };
  it("a mechanic never gets delivery nor cancelling", () => {
    const { next, alternatives } = workshopMoves({ status: "READY", workflowV16: true, quoteApprovedAt: new Date() }, "MECHANIC", settings);
    expect(next).not.toBe("DELIVERED");
    expect(alternatives.map((o) => o.to)).not.toContain("DELIVERED");
    expect(alternatives.map((o) => o.to)).not.toContain("CANCELLED");
  });

  it("only moves allowed by the per-move permissions, next step first", () => {
    const r = workshopMoves({ status: "IN_PROGRESS", workflowV16: true, quoteApprovedAt: new Date() }, "MECHANIC", settings);
    expect(r.next).toBe("QUALITY_CONTROL");
    for (const o of r.alternatives) expect(o.to).not.toBe("DELIVERED");
  });

  it("the team home and order screen need the workshop access (a denied override closes them)", () => {
    expect(can({ role: "MECHANIC", perms: { grant: [], deny: ["useWorkshop"] } }, "useWorkshop")).toBe(false);
    expect(teamSections({ role: "MECHANIC", perms: { grant: [], deny: ["useWorkshop"] } }).myOrders).toBe(false);
  });
});

describe("PWA — workshop / board tiles", () => {
  it("one of the two only: « my cars » for a mechanic, the board for the others", () => {
    const m = teamTiles({ role: "MECHANIC" });
    expect([...m.main, ...m.more]).toContain("workshop");
    expect([...m.main, ...m.more]).not.toContain("board");
    const r = teamTiles({ role: "RECEPTION" });
    expect([...r.main, ...r.more]).toContain("board");
    expect([...r.main, ...r.more]).not.toContain("workshop");
  });
});

describe("PWA — app pages (v2)", () => {
  it("back arrow: none on the home, the showroom list from a vehicle, the app home otherwise", async () => {
    const { appBackHref } = await import("@/lib/app-base");
    expect(appBackHref("/app")).toBeNull();
    expect(appBackHref("/app/showroom/peugeot-208-12")).toBe("/app/showroom");
    expect(appBackHref("/app/suivi/vehicule")).toBe("/app");
    expect(appBackHref("/app/rdv/confirmation/RDV-1")).toBe("/app");
  });

  it("every tab bar link and home entry stays inside the app", () => {
    const bar = readFileSync(path.join(ROOT, "src/components/pwa/app-tab-bar.tsx"), "utf8");
    const home = readFileSync(path.join(ROOT, "src/app/app/page.tsx"), "utf8");
    for (const src of [bar, home]) expect(src).not.toMatch(/href[:=] ?["`{]*"?\/(suivi|rdv|showroom|assistant)\b/);
    for (const p of ["suivi/page.tsx", "suivi/vehicule/page.tsx", "rdv/page.tsx", "rdv/confirmation/[reference]/page.tsx", "showroom/page.tsx", "showroom/[slug]/page.tsx", "assistant/page.tsx"])
      expect(existsSync(path.join(ROOT, "src/app/app", p)), p).toBe(true);
  });
});
