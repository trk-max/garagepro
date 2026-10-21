import { NextResponse } from "next/server";
import { utcToZoned } from "@/lib/booking";
import { toErrorResponse } from "@/lib/http";
import { requirePermission } from "@/lib/session";
import { contractPdf } from "@/server/contract-pdf";
import { contractDoc, getContract } from "@/server/contracts";
import { getSettings } from "@/server/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/contracts/:id/pdf — the contract as PDF (logo, legal footer, empty signature frames).
 * Page permission (viewContracts) THEN the contract's category (employment: administrator + HR),
 * both on the server. Never cached.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission("viewContracts");
    const { id } = await params;
    const c = await getContract(actor, id);
    if (!c) return NextResponse.json({ error: "notFound" }, { status: 404 });
    const settings = await getSettings();
    const pdf = await contractPdf(contractDoc(c), c.data.snapshot?.garage ?? null, { logo: settings.logoDataUrl, generatedDay: utcToZoned(new Date(), settings.timezone).date });
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${c.number}.pdf"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
