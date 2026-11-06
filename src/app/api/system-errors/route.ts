import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { ipFromHeaders } from "@/lib/client-ip";
import { reserveAttempt } from "@/server/rate-limit";
import { recordSystemError } from "@/server/system-errors";

export const dynamic = "force-dynamic";

async function readJsonBounded(request: Request, maxBytes: number): Promise<{ oversized: true } | { oversized: false; value: unknown }> {
  const reader = request.body?.getReader();
  if (!reader) return { oversized: false, value: null };
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return { oversized: true };
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder().decode(bytes);
  return { oversized: false, value: JSON.parse(text) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > 2048) {
    return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  }

  let parsed: Awaited<ReturnType<typeof readJsonBounded>>;
  try {
    parsed = await readJsonBounded(request, 2048);
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  if (parsed.oversized) return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  const body = parsed.value;
  if (!isRecord(body)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const report = body;
  if (
    (report.source !== "route-boundary" && report.source !== "global-boundary") ||
    (typeof report.name !== "string" && report.name !== undefined) ||
    (typeof report.digest !== "string" && report.digest !== undefined)
  ) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const address = ipFromHeaders(request.headers).slice(0, 200);
  const addressHash = createHash("sha256").update(address).digest("hex").slice(0, 32);
  let attempts: string[] | null;
  try {
    attempts = await reserveAttempt([{ key: `system-error-report:${addressHash}`, max: 8 }], 10, false);
  } catch {
    return NextResponse.json({ error: "temporarily_unavailable" }, { status: 503 });
  }
  if (!attempts) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const name = typeof report.name === "string" && /^[A-Za-z][A-Za-z0-9]{0,79}$/.test(report.name) ? report.name : "Error";
  const digest = typeof report.digest === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(report.digest) ? report.digest : null;
  const recorded = await recordSystemError({
    source: "client",
    place: report.source,
    message: `Client render failure (${name}${digest ? `; ref ${digest}` : ""})`,
    requestId: digest,
  });
  if (!recorded) return NextResponse.json({ error: "temporarily_unavailable" }, { status: 503 });
  return new NextResponse(null, { status: 204 });
}
