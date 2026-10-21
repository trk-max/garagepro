import { Check, CheckCheck } from "lucide-react";
import { fmt, formatDateTime, type Lang } from "@/lib/format";
import type { Dictionary } from "@/lib/i18n/fr";
import { cn } from "@/lib/utils";

export type ThreadMessage = { id: string; authorKind: string; authorName: string | null; body: string; createdAt: Date; readByBuyerAt?: Date | null };

/**
 * Messages of a conversation. `side` = who is reading: their own messages are on the end side.
 * The body is plain text rendered by React (escaped): no HTML, no links made from it.
 */
export function Thread({ messages, side, buyerName, t, lang }: { messages: ThreadMessage[]; side: "STAFF" | "BUYER"; buyerName: string; t: Dictionary; lang: Lang }) {
  const m = t.showroom.messages;
  return (
    <ol className="space-y-3" aria-live="polite">
      {messages.map((msg) => {
        const mine = msg.authorKind === side;
        const author = msg.authorKind === "STAFF" ? (side === "BUYER" ? (msg.authorName ?? m.garageTeam) : fmt(m.staffAuthor, { name: msg.authorName ?? "—" })) : buyerName;
        return (
          <li key={msg.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
            <div className={cn("max-w-[85%] border px-3 py-2", mine ? "border-foreground/20 bg-accent" : "border-border bg-background")}>
              <p className="f-label text-[0.625rem] text-muted-foreground">{mine ? m.you : author}</p>
              <p className="mt-1 text-sm break-words whitespace-pre-wrap">{msg.body}</p>
              <p className="mt-1 flex items-center justify-end gap-1 text-[0.6875rem] text-muted-foreground">
                <time dateTime={msg.createdAt.toISOString()}>{formatDateTime(msg.createdAt, lang)}</time>
                {side === "STAFF" && msg.authorKind === "STAFF" &&
                  (msg.readByBuyerAt ? (
                    <CheckCheck className="size-3.5 text-emerald-600" aria-label={m.seenByBuyer} />
                  ) : (
                    <Check className="size-3.5" aria-label={m.notSeen} />
                  ))}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
