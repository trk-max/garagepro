import "server-only";
import { prisma } from "@/lib/prisma";
import { ACTIVE_STATUSES } from "@/server/workflow";

/**
 * Real-time updates without any extra service: each open page keeps one
 * Server-Sent Events connection; the server checks a cheap "version" every
 * POLL_MS and pushes `update` when it changes. The browser then re-renders.
 * One tiny indexed query every 2 s per open page — fine for a workshop.
 */
const POLL_MS = 2000;
const HEARTBEAT_MS = 15_000;
/** Connections are recycled; EventSource reconnects by itself. */
const MAX_LIFETIME_MS = 5 * 60_000;

export function sseResponse(request: Request, version: () => Promise<string | null>): Response {
  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (chunk: string) => {
        if (!closed) controller.enqueue(encoder.encode(chunk));
      };
      const close = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      request.signal.addEventListener("abort", close);

      send("retry: 3000\n\n");
      let last = await version().catch(() => null);
      if (last === null) {
        send("event: gone\ndata: {}\n\n");
        return close();
      }
      send(`event: ready\ndata: ${JSON.stringify({ version: last })}\n\n`);

      const started = Date.now();
      let lastBeat = Date.now();
      while (!closed && Date.now() - started < MAX_LIFETIME_MS) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        if (closed) break;
        try {
          const current = await version();
          if (current === null) {
            send("event: gone\ndata: {}\n\n");
            break;
          }
          if (current !== last) {
            last = current;
            send(`event: update\ndata: ${JSON.stringify({ version: current })}\n\n`);
          } else if (Date.now() - lastBeat > HEARTBEAT_MS) {
            lastBeat = Date.now();
            send(": ping\n\n");
          }
        } catch (error) {
          console.error("[sse] version check failed", error);
        }
      }
      close();
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function workOrderVersion(id: string): Promise<string | null> {
  const wo = await prisma.workOrder.findUnique({
    where: { id },
    select: { updatedAt: true, _count: { select: { events: true, media: true } } },
  });
  return wo ? `${wo.updatedAt.getTime()}:${wo._count.events}:${wo._count.media}` : null;
}

export async function appointmentsVersion(): Promise<string> {
  const agg = await prisma.appointment.aggregate({ _max: { updatedAt: true }, _count: { _all: true } });
  return `${agg._max.updatedAt?.getTime() ?? 0}:${agg._count._all}`;
}

export async function workshopVersion(): Promise<string> {
  const agg = await prisma.workOrder.aggregate({
    where: { status: { in: ACTIVE_STATUSES } },
    _max: { updatedAt: true },
    _count: { _all: true },
  });
  return `${agg._max.updatedAt?.getTime() ?? 0}:${agg._count._all}`;
}
