import { NextResponse } from "next/server";
import { getI18n } from "@/lib/i18n/server";
import { AssistantUnavailable, aiConfigured, askAssistant, buildSystemPrompt, chatRequestSchema } from "@/server/assistant";
import { listBookableServices } from "@/server/booking";
import { clientIp } from "@/server/portal-session";
import { releaseAttempts, reserveAttempt } from "@/server/rate-limit";
import { getSettings } from "@/server/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Several AI providers may be tried one after the other. */
export const maxDuration = 60;

/** Per visitor (IP) and for the whole site, to stay inside the free AI quota. */
const MAX_PER_IP_PER_HOUR = 30;
const MAX_SITE_PER_DAY = 800;

/** POST /api/assistant { messages: [{ role, content }] } → { reply, booking } */
export async function POST(request: Request) {
  if (!aiConfigured()) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  const body = await request.json().catch(() => null);
  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });

  // Atomic reservations (count + record under a lock), BEFORE any provider call:
  // parallel requests cannot all slip under the caps. Visitor first, then the site;
  // if the site cap is reached, the visitor's slot is given back.
  const ipKey = `ai:ip:${await clientIp()}`;
  const ipSlot = await reserveAttempt([{ key: ipKey, max: MAX_PER_IP_PER_HOUR }], 60, false);
  if (!ipSlot) return NextResponse.json({ error: "tooMany" }, { status: 429 });
  const siteSlot = await reserveAttempt([{ key: "ai:site", max: MAX_SITE_PER_DAY }], 24 * 60, false);
  if (!siteSlot) {
    await releaseAttempts(ipSlot);
    return NextResponse.json({ error: "tooMany" }, { status: 429 });
  }

  const [{ t, lang }, settings, services] = await Promise.all([getI18n(), getSettings(), listBookableServices()]);
  const catalog = services.map((s) => ({
    id: s.id,
    name: lang === "ar" && s.nameAr ? s.nameAr : s.name,
    durationMin: s.durationMin,
    priceFrom: s.priceFrom,
  }));
  const bookable = settings.bookingEnabled ? catalog : [];

  try {
    const answer = await askAssistant({
      system: (mode) => buildSystemPrompt({ garageName: settings.garageName, phone: settings.phone, services: bookable, lang, mode }),
      messages: parsed.data.messages,
      services: bookable,
      fallbackReply: t.assistant.bookingFallback,
    });
    return NextResponse.json({ reply: answer.reply, booking: answer.booking });
  } catch (error) {
    if (error instanceof AssistantUnavailable) {
      return NextResponse.json({ error: error.reason === "quota" ? "tooMany" : "unavailable" }, { status: error.reason === "quota" ? 429 : 502 });
    }
    console.error("[assistant] unexpected error", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "unavailable" }, { status: 500 });
  }
}
