import { NextResponse } from "next/server";
import { addDays, zonedToUtc } from "@/lib/booking";
import { toErrorResponse } from "@/lib/http";
import { isIsoDay } from "@/lib/periods";
import { requirePermission } from "@/lib/session";
import { getSettings } from "@/server/settings";
import { employeeReport, employeeReportCsv } from "@/server/team-reports";

/** Employee report as CSV (opens in Excel). Managers only. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission("manageTeam");
    const { id } = await params;
    const url = new URL(request.url);
    const fromDay = url.searchParams.get("from") ?? "";
    const toDay = url.searchParams.get("to") ?? "";
    if (!isIsoDay(fromDay) || !isIsoDay(toDay) || toDay < fromDay) return NextResponse.json({ error: "invalid" }, { status: 422 });
    const tz = (await getSettings()).timezone;
    const report = await employeeReport(id, zonedToUtc(fromDay, "00:00", tz), zonedToUtc(addDays(toDay, 1), "00:00", tz));
    if (!report) return NextResponse.json({ error: "notFound" }, { status: 404 });
    const name = report.user.name.normalize("NFD").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "") || "employe";
    return new NextResponse(employeeReportCsv(report), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="rapport-${name}-${fromDay}-${toDay}.csv"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
