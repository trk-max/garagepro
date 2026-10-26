import "server-only";
import { getI18n } from "@/lib/i18n/server";
import { clientManifest, teamManifest } from "@/lib/pwa-manifests";
import { getSettings } from "@/server/settings";

/**
 * Web app manifests of the two installable apps (client « /app », team « /equipe »), in the visitor's
 * language; the client app takes the garage's name from the settings (« GaragePro » if unreadable).
 */
export async function manifestResponse(kind: "client" | "team"): Promise<Response> {
  const { t, lang, dir } = await getI18n();
  const labels = {
    ...t.app.manifest,
    track: t.app.client.track,
    book: t.app.client.book,
    showroom: t.app.client.showroom,
    teamSpace: t.app.team.title,
    workshop: t.app.team.tiles.workshop,
    newOrder: t.app.team.tiles.newOrder,
    appointments: t.app.team.tiles.appointments,
  };
  const body =
    kind === "client"
      ? clientManifest(await getSettings().then((s) => s.garageName).catch(() => "GaragePro"), lang, dir, labels)
      : teamManifest(lang, dir, labels);
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/manifest+json; charset=utf-8", "Cache-Control": "no-cache" },
  });
}
