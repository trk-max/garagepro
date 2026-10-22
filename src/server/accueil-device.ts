import "server-only";
import { cookies } from "next/headers";
import type { DeviceKind } from "@/lib/accueil";
import { DEVICE_COOKIE, resolveDevice, type QueueDeviceRef } from "@/server/accueil";

/**
 * V15 — the kiosk tablet / waiting-room TV of THIS request, from its device cookie
 * (set once by /accueil/activer?t=…). null = no token, revoked, or a token of the other kind.
 */
export async function currentDevice(kind: DeviceKind): Promise<QueueDeviceRef | null> {
  const token = (await cookies()).get(DEVICE_COOKIE)?.value;
  return resolveDevice(token, kind);
}

/** JSON 401 for the device API routes (no device, revoked device). */
export const deviceRefused = () => Response.json({ error: "device" }, { status: 401, headers: { "Cache-Control": "no-store" } });

/**
 * Address the tablet / TV should open for the activation link: the address the administrator uses,
 * or — on the garage PC (hub) opened as "localhost" — its Wi-Fi / network address, as the clock kiosk does.
 */
export async function deviceLinkBase(): Promise<string> {
  const { headers } = await import("next/headers");
  const os = await import("node:os");
  const { isHubLocal } = await import("@/server/hub");
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") === "https" ? "https" : "http";
  const [name, port] = host.split(":");
  if (isHubLocal() && (name === "localhost" || name === "127.0.0.1")) {
    const lan = Object.values(os.networkInterfaces())
      .flat()
      .find((a) => a && a.family === "IPv4" && !a.internal && !a.address.startsWith("192.168.56."));
    if (lan) return `http://${lan.address}${port ? `:${port}` : ""}`;
  }
  return `${proto}://${host}`;
}
