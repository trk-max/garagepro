import { NextResponse } from "next/server";
import { displayPlate } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { buildXlsx, XLSX_MIME, type Row } from "@/lib/xlsx";
import { companyAgenda } from "@/server/agenda";
import { getCompanyViewer } from "@/server/company-session";

export const dynamic = "force-dynamic";

/**
 * V12 — company portal: fleet maintenance plan as Excel or CSV. Only the signed-in company's own
 * vehicles (customerId from the session); the price column exists only for roles that see amounts.
 */
export async function GET(request: Request) {
  const viewer = await getCompanyViewer();
  if (!viewer) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const format = new URL(request.url).searchParams.get("format") === "csv" ? "csv" : "xlsx";
  const [{ t, lang }, plan] = await Promise.all([getI18n(), companyAgenda(viewer)]);
  const c = t.v12.company.cols;
  const name = (i: { nameFr: string; nameAr: string | null; nameEn: string | null }) => (lang === "ar" ? i.nameAr : lang === "en" ? i.nameEn : null) || i.nameFr;
  const header: Row = [c.month, c.plate, c.vehicle, c.item, c.dueDate, c.dueKm, c.confidence, c.method, c.cases, ...(plan.money ? [c.price] : [])];
  const rows: Row[] = plan.rows.map((r) => [
    r.dueDate ? r.dueDate.toISOString().slice(0, 7) : "",
    displayPlate(r.vehicle.plate),
    `${r.vehicle.make} ${r.vehicle.model}`,
    name(r.item),
    r.dueDate ? r.dueDate.toISOString().slice(0, 10) : "",
    r.dueKm ?? "",
    r.confidence ? t.v12.confidence[r.confidence as keyof typeof t.v12.confidence] : "",
    t.v12.method[r.method as keyof typeof t.v12.method] ?? r.method,
    r.cases,
    ...(plan.money ? [r.priceTtc === null ? "" : Math.round(r.priceTtc) / 1000] : []),
  ]);
  const file = `planning-entretien-${new Date().toISOString().slice(0, 10)}`;
  if (format === "csv") {
    const cell = (v: Row[number]) => {
      const s = v === null || v === undefined ? "" : String(v);
      return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    // BOM + ";" so that Excel (French settings) opens it directly.
    const body = "﻿" + [header, ...rows].map((r) => r.map(cell).join(";")).join("\r\n");
    return new NextResponse(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${file}.csv"`, "Cache-Control": "no-store" } });
  }
  const body = buildXlsx([{ name: t.v12.company.title.slice(0, 31), boldRows: [0], widths: [10, 14, 22, 28, 14, 12, 12, 30, 8, 16], rows: [header, ...rows] }]);
  return new NextResponse(Buffer.from(body), { headers: { "Content-Type": XLSX_MIME, "Content-Disposition": `attachment; filename="${file}.xlsx"`, "Cache-Control": "no-store" } });
}
