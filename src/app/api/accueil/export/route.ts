import { NextRequest } from "next/server";
import { ticketLabel, ticketsCsv } from "@/lib/accueil";
import { toErrorResponse } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { reportStats } from "@/server/accueil";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** GET /api/accueil/export?from=AAAA-MM-JJ&to=AAAA-MM-JJ — tickets of the period as CSV (no phone, no name). */
export async function GET(request: NextRequest) {
  try {
    await requirePermission("viewReceptionReports");
    const from = request.nextUrl.searchParams.get("from") ?? "";
    const to = request.nextUrl.searchParams.get("to") ?? "";
    if (!DAY.test(from) || !DAY.test(to)) return Response.json({ error: "invalid" }, { status: 422 });
    const [{ rows, tz }, reasons, counters] = await Promise.all([reportStats(from, to), prisma.queueReason.findMany({ select: { id: true, nameFr: true } }), prisma.queueCounter.findMany({ select: { id: true, name: true } })]);
    const rName = new Map(reasons.map((r) => [r.id, r.nameFr]));
    const cName = new Map(counters.map((c) => [c.id, c.name]));
    const csv = ticketsCsv(
      rows.map((t) => ({ day: t.day, label: ticketLabel(t.prefix, t.number), reason: rName.get(t.reasonId) ?? "", status: t.status, takenAt: t.takenAt, calledAt: t.calledAt, doneAt: t.doneAt, callCount: t.callCount, counter: t.counterId ? cName.get(t.counterId) ?? null : null })),
      tz,
    );
    return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="accueil-${from}-${to}.csv"`, "Cache-Control": "private, no-store" } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
