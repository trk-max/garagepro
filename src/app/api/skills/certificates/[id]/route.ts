import { toErrorResponse } from "@/lib/http";
import { requireStaff } from "@/lib/session";
import { readCertificateFile } from "@/server/skills";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/skills/certificates/:id — the certificate file, after the access check (the person himself or viewSkills). */
export async function GET(_request: Request, { params }: Ctx) {
  try {
    const actor = await requireStaff();
    const { id } = await params;
    return await readCertificateFile(actor, id);
  } catch (error) {
    return toErrorResponse(error);
  }
}
