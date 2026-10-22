import { getStaff } from "@/lib/session";
import { can } from "@/lib/permissions";
import { readSignatureFile } from "@/server/signatures";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; which: string }> };

/**
 * GET /api/signatures/:id/image | /document — V16 Lot 4: the customer's signature (PNG) or the frozen signed
 * document (HTML: intake, handover). Team only (viewWorkOrders or viewClientInvoices); never public. The document is
 * served sandboxed (no script, no form, no same-origin access).
 */
export async function GET(request: Request, { params }: Ctx) {
  const staff = await getStaff();
  if (!staff || !(can(staff, "viewWorkOrders") || can(staff, "viewClientInvoices"))) return new Response("Not found", { status: 404 });
  const { id, which } = await params;
  if (which !== "image" && which !== "document") return new Response("Not found", { status: 404 });
  const res = await readSignatureFile(id, which, request.headers.get("range"));
  if (!res) return new Response("Not found", { status: 404 });
  const headers = new Headers(res.headers);
  if (which === "document") headers.set("Content-Security-Policy", "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:");
  return new Response(res.body, { status: res.status, headers });
}
