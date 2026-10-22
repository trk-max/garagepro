import { toErrorResponse } from "@/lib/http";
import { getI18n } from "@/lib/i18n/server";
import { requirePermission } from "@/lib/session";
import { toCsv } from "@/lib/skills";
import { matrixRows, skillMatrix } from "@/server/skills";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/skills/matrix — CSV export of the team skills matrix (viewSkills). */
export async function GET() {
  try {
    const actor = await requirePermission("viewSkills");
    const [{ t, lang }, m] = await Promise.all([getI18n(), skillMatrix(actor)]);
    const v = t.v14;
    const csv = toCsv(
      matrixRows(m, { name: v.matrix.employee, roleHeader: v.matrix.role, role: (r) => t.roles[r], level: (l) => v.levels[l as keyof typeof v.levels] ?? l, toVerify: v.toVerify }, lang),
    );
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="competences-${new Date().toISOString().slice(0, 10)}.csv"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
