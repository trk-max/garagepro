import Link from "next/link";
import { LiveRefresh } from "@/components/live-refresh";
import { Card, PageHeader } from "@/components/ui/field";
import { fmt, formatDateTime } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { requirePageAccess } from "@/lib/session";
import { listingNumber } from "@/lib/showroom";
import { cn } from "@/lib/utils";
import { listConversations } from "@/server/messaging";

type PageProps = { searchParams: Promise<{ listing?: string; f?: string }> };

/** Buyer messages (V9). A seller only gets the conversations of their own listings (filtered in the query). */
export default async function MessagesPage({ searchParams }: PageProps) {
  const staff = await requirePageAccess("useShowroomMessages");
  const sp = await searchParams;
  const listingId = sp.listing && /^[a-z0-9]{20,40}$/.test(sp.listing) ? sp.listing : undefined;
  const unread = sp.f === "unread";
  const [{ t, lang }, rows] = await Promise.all([getI18n(), listConversations(staff, { listingId, unread })]);
  const m = t.showroom.messages;
  const qs = (u: boolean) => `/garage/messages?${new URLSearchParams({ ...(listingId ? { listing: listingId } : {}), ...(u ? { f: "unread" } : {}) })}`;
  const forListing = listingId ? rows[0]?.listing : null;

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <PageHeader title={forListing ? `${m.title} · ${fmt(m.forListing, { number: listingNumber(forListing.number) })}` : m.title}>
        <LiveRefresh url="/api/staff/live?topic=inbox" liveLabel={t.portal.live} reconnectingLabel={t.portal.reconnecting} />
      </PageHeader>
      <p className="text-sm text-muted-foreground">{m.intro}</p>
      <nav className="flex flex-wrap items-center gap-1">
        {[false, true].map((u) => (
          <Link
            key={String(u)}
            href={qs(u)}
            aria-current={u === unread ? "page" : undefined}
            className={cn("f-label border px-3 py-2", u === unread ? "border-foreground text-foreground" : "border-border text-muted-foreground hover:text-foreground")}
          >
            {u ? m.unread : m.all}
          </Link>
        ))}
        {listingId && (
          <Link href="/garage/messages" className="ms-2 text-sm underline-offset-4 hover:underline">
            {m.showAll}
          </Link>
        )}
      </nav>

      {rows.length === 0 ? (
        <p className="border border-dashed p-10 text-center text-sm text-muted-foreground">{m.none}</p>
      ) : (
        <Card className="p-0 sm:p-0">
          <ul className="divide-y">
            {rows.map((c) => (
              <li key={c.id}>
                <Link href={`/garage/messages/${c.id}`} className="flex gap-3 p-4 hover:bg-accent/30">
                  <span className={cn("mt-1.5 size-2 shrink-0", c.unread > 0 ? "bg-brand-500" : "bg-transparent")} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline gap-x-2">
                      <span className={cn(c.unread > 0 && "font-semibold")}>{c.buyerName}</span>
                      {c.listing && (
                        <span className="text-xs text-muted-foreground">
                          {listingNumber(c.listing.number)} · {c.listing.make} {c.listing.model} {c.listing.year ?? ""}
                        </span>
                      )}
                      {c.status === "CLOSED" && <span className="f-label border px-1.5 text-[0.625rem] text-muted-foreground">{m.closed}</span>}
                      <time className="ms-auto text-xs text-muted-foreground" dateTime={c.lastMessageAt.toISOString()}>
                        {formatDateTime(c.lastMessageAt, lang)}
                      </time>
                    </span>
                    {c.last && (
                      <span className="mt-1 block truncate text-sm text-muted-foreground">
                        {c.last.authorKind === "STAFF" ? `${m.you} : ` : ""}
                        {c.last.body}
                      </span>
                    )}
                  </span>
                  {c.unread > 0 && <span className="h-fit min-w-5 bg-brand-500 px-1.5 text-center text-[0.6875rem] font-semibold text-white">{c.unread}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
