import { NextResponse } from "next/server";
import { toErrorResponse } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { isHubLocal } from "@/server/hub";

export const dynamic = "force-dynamic";

/** Sync status of the garage hub (garage PC only): online?, last sync, changes waiting. */
export async function GET() {
  if (!isHubLocal()) return NextResponse.json({ hub: false }, { status: 404 });
  try {
    await requireStaff();
    // The local change log is a queue: every line still in it waits to be sent online.
    const [status, pending] = await Promise.all([prisma.syncState.findUnique({ where: { key: "status" } }), prisma.syncLog.count()]);
    const s = (status?.value ?? {}) as { online?: boolean; lastSyncAt?: string | null; errors?: number; lastError?: string | null };
    return NextResponse.json(
      { hub: true, online: s.online ?? false, lastSyncAt: s.lastSyncAt ?? null, pending, errors: s.errors ?? 0, lastError: s.lastError ?? null },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
