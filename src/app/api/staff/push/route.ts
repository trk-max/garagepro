import { NextRequest } from "next/server";
import { getStaff } from "@/lib/session";
import { isSubscription, pushConfig, removeSubscription, saveSubscription } from "@/server/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

/** GET: the public VAPID key (null = notifications not set up on this server). */
export async function GET() {
  if (!(await getStaff())) return new Response("Unauthorized", { status: 401 });
  return Response.json({ publicKey: pushConfig()?.publicKey ?? null }, { headers: noStore });
}

/** POST { subscription }: this phone accepted the notifications for the signed-in person. */
export async function POST(request: NextRequest) {
  const staff = await getStaff();
  if (!staff) return new Response("Unauthorized", { status: 401 });
  if (!pushConfig()) return Response.json({ ok: false, error: "disabled" }, { status: 409, headers: noStore });
  const body = (await request.json().catch(() => null)) as { subscription?: unknown } | null;
  if (!isSubscription(body?.subscription)) return Response.json({ ok: false, error: "invalid" }, { status: 422, headers: noStore });
  await saveSubscription(staff.id, body.subscription, request.headers.get("user-agent"));
  return Response.json({ ok: true }, { headers: noStore });
}

/** DELETE { endpoint }: stop the notifications on this phone. */
export async function DELETE(request: NextRequest) {
  const staff = await getStaff();
  if (!staff) return new Response("Unauthorized", { status: 401 });
  const body = (await request.json().catch(() => null)) as { endpoint?: unknown } | null;
  if (typeof body?.endpoint === "string") await removeSubscription(staff.id, body.endpoint);
  return Response.json({ ok: true }, { headers: noStore });
}
