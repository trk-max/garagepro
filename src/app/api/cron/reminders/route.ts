import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runReminders } from "@/server/reminders";

/**
 * Scheduled run of the customer reminders.
 * - Online: Vercel Cron (vercel.json) calls it daily with "Authorization: Bearer <CRON_SECRET>".
 * - Garage hub: the hub window calls it every hour with the same header.
 * Without CRON_SECRET in the environment the route refuses everything.
 */
export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;
  const got = Buffer.from(request.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const result = await runReminders();
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[cron] reminders", error);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
