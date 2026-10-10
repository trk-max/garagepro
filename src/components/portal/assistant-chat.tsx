"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { AlertTriangle, Bot, CalendarCheck, CheckCircle2, Loader2, MessageCircle, Phone, RotateCcw, Send, Sparkles, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QUESTIONS, RESULTS, ROOT, type Urgency, matchService, tr } from "@/lib/guided-diagnosis";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

type Booking = { serviceId: string; serviceName: string; urgency: Urgency; summary: string };
export type ChatService = { id: string; name: string; nameAr: string | null };

/** What is shown in the conversation. */
type Item =
  | { kind: "bot"; text: string }
  | { kind: "user"; text: string }
  | { kind: "question"; id: string }
  | { kind: "result"; id: string; summary: string }
  | { kind: "ai"; text: string; booking: Booking | null };

/** What is sent to the AI (role + text only). */
type AiMessage = { role: "user" | "assistant"; content: string };

const MAX_CHARS = 1_500;
/** Buttons whose label can be long (service names): wrap instead of overflowing on phones. */
const WRAP = "h-auto min-h-11 whitespace-normal py-2 text-center";
const MAX_HISTORY = 20;

const URGENCY_STYLE: Record<Urgency, string> = {
  low: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-400 ring-emerald-200 dark:ring-emerald-500/30",
  medium: "bg-amber-50 dark:bg-amber-500/10 text-amber-900 dark:text-amber-300 ring-amber-200 dark:ring-amber-500/30",
  high: "bg-orange-50 dark:bg-orange-500/10 text-orange-900 dark:text-orange-300 ring-orange-300 dark:ring-orange-500/30",
  danger: "bg-red-50 dark:bg-red-500/10 text-red-800 dark:text-red-300 ring-red-300 dark:ring-red-500/30",
};

export function AssistantChat({
  aiEnabled,
  services,
  phone,
  whatsapp,
}: {
  aiEnabled: boolean;
  services: ChatService[];
  phone: string | null;
  whatsapp: string | null;
}) {
  const { t, lang } = useI18n();
  const a = t.assistant;
  const [items, setItems] = useState<Item[]>([{ kind: "question", id: ROOT }]);
  const [path, setPath] = useState<string[]>([]);
  const [aiHistory, setAiHistory] = useState<AiMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [items, pending]);

  const last = items[items.length - 1];

  /** Guided mode: the customer clicked an answer. */
  function choose(label: string, option: { next?: string; result?: string; ai?: true }) {
    const nextPath = [...path, label];
    setPath(nextPath);
    const added: Item[] = [{ kind: "user", text: label }];
    if (option.next) added.push({ kind: "question", id: option.next });
    else if (option.result) added.push({ kind: "result", id: option.result, summary: nextPath.join(" > ") });
    else added.push({ kind: "bot", text: aiEnabled ? a.aiHandoff : a.noAi });
    setItems((it) => [...it, ...added]);
    if (option.ai && aiEnabled) setTimeout(() => inputRef.current?.focus(), 50);
  }

  function handOffToAi() {
    setItems((it) => [...it, { kind: "user", text: a.notThis }, { kind: "bot", text: a.aiHandoff }]);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  /** Free text always goes to the AI, with the guide answers as context. */
  async function sendToAi(text: string) {
    const content = text.trim();
    if (!content || pending || !aiEnabled) return;
    if (content.length > MAX_CHARS) return setError(a.tooLong);

    const withContext = aiHistory.length === 0 && path.length ? `(${a.guideContext} : ${path.join(" > ")})\n${content}` : content;
    const history: AiMessage[] = [...aiHistory, { role: "user", content: withContext }];
    setAiHistory(history);
    setItems((it) => [...it, { kind: "user", text: content }]);
    setDraft("");
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history.slice(-MAX_HISTORY) }),
      });
      const data = (await res.json().catch(() => ({}))) as { reply?: string; booking?: Booking | null; error?: string };
      if (!res.ok || !data.reply) {
        setError(data.error === "tooMany" ? a.tooMany : a.unavailable);
        setAiHistory(history.slice(0, -1)); // the question can be sent again
        return;
      }
      setAiHistory([...history, { role: "assistant", content: data.reply }]);
      setItems((it) => [...it, { kind: "ai", text: data.reply!, booking: data.booking ?? null }]);
    } catch {
      setError(a.unavailable);
      setAiHistory(history.slice(0, -1));
    } finally {
      setPending(false);
      inputRef.current?.focus();
    }
  }

  function restart() {
    setItems([{ kind: "question", id: ROOT }]);
    setPath([]);
    setAiHistory([]);
    setError(null);
    setDraft("");
  }

  return (
    <div className="flex min-h-[70dvh] flex-col overflow-hidden rounded-lg bg-card shadow-sm ring-1 ring-border">
      <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6" aria-live="polite" aria-busy={pending}>
        <Bubble mine={false} label={a.bot}>
          {aiEnabled ? a.guideIntro : a.guideIntroNoAi}
        </Bubble>

        {items.map((item, i) => {
          const isLast = item === last;
          switch (item.kind) {
            case "user":
              return (
                <Bubble key={i} mine label={a.you}>
                  {item.text}
                </Bubble>
              );
            case "bot":
              return (
                <div key={i} className="space-y-2">
                  <Bubble mine={false} label={a.bot}>
                    {item.text}
                  </Bubble>
                  {!aiEnabled && <ContactButtons phone={phone} whatsapp={whatsapp} className="ms-11" />}
                </div>
              );
            case "question": {
              const q = QUESTIONS[item.id];
              if (!q) return null;
              return (
                <div key={i} className="space-y-2">
                  <Bubble mine={false} label={a.bot}>
                    {tr(q.text, lang)}
                  </Bubble>
                  {isLast && (
                    <div className="flex flex-wrap gap-2 ps-11">
                      {q.options.map((o) => (
                        <Chip key={o.label.fr} onClick={() => choose(tr(o.label, lang), o)} highlight={!!o.ai}>
                          {tr(o.label, lang)}
                        </Chip>
                      ))}
                    </div>
                  )}
                </div>
              );
            }
            case "result":
              return (
                <ResultCard
                  key={i}
                  id={item.id}
                  summary={item.summary}
                  services={services}
                  active={isLast}
                  aiEnabled={aiEnabled}
                  onAskAi={handOffToAi}
                  phone={phone}
                  whatsapp={whatsapp}
                />
              );
            case "ai":
              return (
                <div key={i} className="space-y-2">
                  <Bubble mine={false} label={a.bot} ai>
                    {item.text}
                  </Bubble>
                  {item.booking && <BookingCard booking={item.booking} />}
                </div>
              );
          }
        })}

        {pending && (
          <p className="flex items-center gap-2 ps-11 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden /> {a.thinking}
          </p>
        )}

        {error && (
          <div role="alert" className="ms-11 rounded-md bg-red-50 dark:bg-red-500/10 p-3 text-sm text-red-800 dark:text-red-300 ring-1 ring-red-200 dark:ring-red-500/30">
            {error}
            <ContactButtons phone={phone} whatsapp={whatsapp} />
            <button
              type="button"
              onClick={restart}
              className="mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-red-900 dark:text-red-300 underline-offset-2 hover:underline"
            >
              <RotateCcw className="size-4" aria-hidden /> {a.useGuide}
            </button>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="border-t bg-muted p-3 sm:p-4">
        {aiEnabled && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendToAi(draft);
            }}
          >
            <label htmlFor="assistant-input" className="sr-only">
              {a.placeholder}
            </label>
            <div className="flex items-end gap-2">
              <textarea
                id="assistant-input"
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendToAi(draft);
                  }
                }}
                rows={2}
                maxLength={MAX_CHARS}
                placeholder={a.placeholder}
                className="min-h-11 flex-1 resize-none rounded-md border border-border bg-card px-3 py-2.5 text-base outline-none focus-visible:border-brand-400 focus-visible:ring-[3px] focus-visible:ring-brand-400/40"
              />
              <Button type="submit" disabled={pending || !draft.trim()} className="h-11 bg-brand-500 px-4 hover:bg-brand-600" aria-label={a.send}>
                {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Send className="rtl:-scale-x-100" aria-hidden />}
                <span className="max-sm:sr-only">{a.send}</span>
              </Button>
            </div>
          </form>
        )}
        <div className={cn("flex items-start gap-3", aiEnabled && "mt-2")}>
          <p className="flex-1 text-xs text-muted-foreground">{a.disclaimer}</p>
          {items.length > 1 && (
            <button type="button" onClick={restart} className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-medium text-foreground hover:bg-accent">
              <RotateCcw className="size-3.5" aria-hidden /> {a.restart}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Chip({ children, onClick, highlight }: { children: ReactNode; onClick: () => void; highlight?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "min-h-11 rounded-md px-4 text-start text-sm transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-500/50",
        highlight
          ? "border border-dashed border-muted-foreground/50 bg-transparent text-muted-foreground hover:bg-accent"
          : "bg-card font-medium text-foreground ring-1 ring-border hover:text-brand-700 hover:ring-brand-500",
      )}
    >
      {children}
    </button>
  );
}

function Bubble({ mine, label, ai, children }: { mine: boolean; label: string; ai?: boolean; children: ReactNode }) {
  return (
    <div className={cn("flex items-start gap-3", mine && "flex-row-reverse")}>
      <span className={cn("grid size-8 shrink-0 place-items-center rounded-full text-white", mine ? "bg-foreground text-background" : "bg-brand-500")} aria-hidden>
        {mine ? <User className="size-4" /> : ai ? <Sparkles className="size-4" /> : <Bot className="size-4" />}
      </span>
      <div className={cn("max-w-[85%] rounded-lg px-4 py-3 text-[15px] leading-relaxed", mine ? "bg-foreground text-background" : "bg-muted text-foreground")}>
        <span className="sr-only">{label} : </span>
        {/* Plain text only: React escapes it, the model cannot inject HTML. */}
        <p className="whitespace-pre-wrap break-words">{children}</p>
      </div>
    </div>
  );
}

function UrgencyBadge({ urgency }: { urgency: Urgency }) {
  const { t } = useI18n();
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ring-1", URGENCY_STYLE[urgency])}>
      {urgency === "danger" && <AlertTriangle className="size-3.5" aria-hidden />}
      {t.assistant.urgency[urgency]}
    </span>
  );
}

function ResultCard(props: {
  id: string;
  summary: string;
  services: ChatService[];
  active: boolean;
  aiEnabled: boolean;
  onAskAi: () => void;
  phone: string | null;
  whatsapp: string | null;
}) {
  const { t, lang } = useI18n();
  const a = t.assistant;
  const result = RESULTS[props.id];
  if (!result) return null;
  const service = matchService(result.service, props.services);
  const serviceName = service ? (lang === "ar" && service.nameAr ? service.nameAr : service.name) : "";

  return (
    <div className={cn("ms-11 max-w-[85%] space-y-3 rounded-lg bg-card p-4 shadow-sm ring-1", result.urgency === "danger" ? "ring-red-300 dark:ring-red-500/30" : "ring-border")}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">{tr(result.title, lang)}</h3>
        <UrgencyBadge urgency={result.urgency} />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">{a.causes}</p>
        <ul className="mt-1 list-disc space-y-0.5 ps-5 text-sm">
          {result.causes.map((c) => (
            <li key={c.fr}>{tr(c, lang)}</li>
          ))}
        </ul>
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">{a.checks}</p>
        <ul className="mt-1 space-y-1 text-sm">
          {result.checks.map((c) => (
            <li key={c.fr} className="flex gap-2">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden /> {tr(c, lang)}
            </li>
          ))}
        </ul>
      </div>

      {result.service === "none" ? (
        <p className="text-sm text-emerald-700 dark:text-emerald-400">{a.noService}</p>
      ) : service ? (
        <Button asChild className={WRAP + " w-full bg-brand-500 hover:bg-brand-600"}>
          <Link href={bookingHref(service.id, `${tr(result.title, lang)} — ${props.summary}`)}>
            <CalendarCheck aria-hidden /> {a.bookingCta} : {serviceName}
          </Link>
        </Button>
      ) : (
        <ContactButtons phone={props.phone} whatsapp={props.whatsapp} />
      )}
      {/* Danger: calling the garage (towing) comes first. */}
      {result.urgency === "danger" && service && <ContactButtons phone={props.phone} whatsapp={props.whatsapp} />}

      {props.active && props.aiEnabled && (
        <Button type="button" variant="outline" className={WRAP + " w-full"} onClick={props.onAskAi}>
          <Sparkles aria-hidden /> {a.notThis}
        </Button>
      )}
    </div>
  );
}

const bookingHref = (serviceId: string, notes: string) =>
  `/rdv?service=${encodeURIComponent(serviceId)}${notes ? `&notes=${encodeURIComponent(notes.slice(0, 300))}` : ""}`;

function BookingCard({ booking }: { booking: Booking }) {
  const { t } = useI18n();
  const a = t.assistant;
  return (
    <div className="ms-11 max-w-[85%] rounded-lg bg-card p-4 shadow-sm ring-1 ring-brand-200">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <CalendarCheck className="size-4 text-brand-600" aria-hidden /> {a.bookingTitle}
      </p>
      <p className="mt-1 font-medium">{booking.serviceName}</p>
      <div className="mt-2">
        <UrgencyBadge urgency={booking.urgency} />
      </div>
      {booking.summary && <p className="mt-2 text-sm text-muted-foreground">{booking.summary}</p>}
      <Button asChild className={WRAP + " mt-3 w-full bg-brand-500 hover:bg-brand-600"}>
        <Link href={bookingHref(booking.serviceId, booking.summary)}>{a.bookingCta}</Link>
      </Button>
    </div>
  );
}

function ContactButtons({ phone, whatsapp, className }: { phone: string | null; whatsapp: string | null; className?: string }) {
  const { t } = useI18n();
  if (!phone) return null;
  return (
    <div className={cn("mt-3 flex flex-wrap gap-2", className)}>
      <a href={`tel:${phone}`} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-anthracite px-4 text-sm font-medium text-white hover:bg-black">
        <Phone className="size-4" aria-hidden /> {t.portal.call}
      </a>
      {whatsapp && (
        <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700">
          <MessageCircle className="size-4" aria-hidden /> {t.portal.whatsapp}
        </a>
      )}
    </div>
  );
}
