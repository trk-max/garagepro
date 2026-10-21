import { NextResponse } from "next/server";
import { addDays, zonedToUtc } from "@/lib/booking";
import { toErrorResponse } from "@/lib/http";
import { getI18n } from "@/lib/i18n/server";
import { isIsoDay } from "@/lib/periods";
import { requirePermission } from "@/lib/session";
import { buildXlsx, XLSX_MIME } from "@/lib/xlsx";
import { profitReport, type ProfitGroup } from "@/server/profit";
import { getSettings } from "@/server/settings";

const GROUPS: ProfitGroup[] = ["repair", "vehicle", "customer", "type", "month"];
const dt = (millimes: number) => Math.round(millimes) / 1000;

/** Profitability report as an Excel file (amounts in DT, as numbers). Administrator only. */
export async function GET(request: Request) {
  try {
    await requirePermission("viewProfit");
    const url = new URL(request.url);
    const fromDay = url.searchParams.get("from") ?? "";
    const toDay = url.searchParams.get("to") ?? "";
    const group = url.searchParams.get("group") ?? "repair";
    if (!isIsoDay(fromDay) || !isIsoDay(toDay) || toDay < fromDay || !(GROUPS as string[]).includes(group)) {
      return NextResponse.json({ error: "invalid" }, { status: 422 });
    }
    const [settings, { t }] = await Promise.all([getSettings(), getI18n()]);
    const tz = settings.timezone;
    const r = await profitReport(zonedToUtc(fromDay, "00:00", tz), zonedToUtc(addDays(toDay, 1), "00:00", tz), group as ProfitGroup, tz);
    const v = t.v7.profit;
    const header = [v.groups[group as ProfitGroup], v.repairs, v.revenue, v.partsCost, v.expenses, v.grossMargin, v.laborHoursCol, v.laborCost, v.overhead, v.profit, v.marginPct, v.collected, v.estimatedCol];
    const row = (label: string, p: (typeof r.lines)[number] | typeof r.total) => [
      label,
      p.count,
      dt(p.revenue),
      dt(p.partsCost),
      dt(p.expenses),
      dt(p.grossMargin),
      Math.round((p.laborMinutes / 60) * 100) / 100,
      dt(p.laborCost),
      dt(p.overhead),
      dt(p.profit),
      p.marginBp === null ? "" : p.marginBp / 100,
      dt(p.collected.total),
      p.flags.map((f) => v.flags[f]).join(" ; "),
    ];
    const body = buildXlsx([
      {
        name: v.reportTitle,
        widths: [40, 9, 14, 14, 12, 14, 12, 14, 12, 14, 9, 14, 60],
        boldRows: [0, 2, r.lines.length + 3],
        rows: [
          [`${v.reportTitle} — ${fromDay} → ${toDay}`],
          [],
          header,
          ...r.lines.map((l) => row(l.category ? t.reports.problemNames[l.category] : l.label, l)),
          row(v.total, r.total),
          [],
          [v.legend],
        ],
      },
    ]);
    return new NextResponse(Buffer.from(body), {
      headers: {
        "Content-Type": XLSX_MIME,
        "Content-Disposition": `attachment; filename="rentabilite-${group}-${fromDay}-${toDay}.xlsx"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
