import type { NextRequest } from "next/server";
import { getI18n } from "@/lib/i18n/server";
import { buildIcs, getAppointmentByReference, isValidManageToken } from "@/server/booking";
import { getSettings } from "@/server/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ reference: string }> };

/** GET /api/booking/ics/:reference?t=token — "Ajouter à mon agenda". */
export async function GET(request: NextRequest, { params }: Ctx) {
  const { reference } = await params;
  const token = request.nextUrl.searchParams.get("t") ?? "";
  if (!isValidManageToken(reference, token)) return new Response("Not found", { status: 404 });

  const [appt, settings, { lang }] = await Promise.all([getAppointmentByReference(reference), getSettings(), getI18n()]);
  if (!appt) return new Response("Not found", { status: 404 });

  const serviceName = lang === "ar" && appt.service.nameAr ? appt.service.nameAr : appt.service.name;
  return new Response(buildIcs(appt, settings, serviceName), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${reference}.ics"`,
    },
  });
}
