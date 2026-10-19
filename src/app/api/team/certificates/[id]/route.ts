import { NextResponse } from "next/server";
import { toErrorResponse } from "@/lib/http";
import { requirePermission } from "@/lib/session";
import { certificatePdf } from "@/server/certificate-pdf";
import { getCertificate } from "@/server/certificates";

/** Archived work certificate as PDF (rebuilt identically from its stored snapshot). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission("issueCertificates");
    const { id } = await params;
    const cert = await getCertificate(id);
    if (!cert) return NextResponse.json({ error: "notFound" }, { status: 404 });
    const pdf = await certificatePdf(cert.snapshot);
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${cert.number}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
