import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { conversationStatusAction, staffReplyAction } from "@/actions/messaging";
import { ActionButton } from "@/components/action-form";
import { LiveRefresh } from "@/components/live-refresh";
import { ListingStatusBadge } from "@/components/showroom/badges";
import { ReplyForm } from "@/components/showroom/reply-form";
import { Thread } from "@/components/showroom/thread";
import { Card, CardTitle, PageHeader } from "@/components/ui/field";
import { formatDateTime } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { requirePageAccess } from "@/lib/session";
import { formatPriceDt, isPubliclyVisible, listingNumber, listingSlug } from "@/lib/showroom";
import { getConversation, markReadByStaff } from "@/server/messaging";

type PageProps = { params: Promise<{ id: string }> };

/** One buyer conversation: thread, answer, buyer's contact, link to the vehicle. Live updates. */
export default async function ConversationPage({ params }: PageProps) {
  const staff = await requirePageAccess("useShowroomMessages");
  const { id } = await params;
  if (!/^[a-z0-9]{20,40}$/.test(id)) notFound();
  const c = await getConversation(staff, id);
  // Not in this person's scope = does not exist for them.
  if (!c) notFound();
  await markReadByStaff(staff, id);
  const { t, lang } = await getI18n();
  const m = t.showroom.messages;
  const l = c.listing;

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <PageHeader title={c.buyerName}>
        <LiveRefresh url={`/api/staff/live?topic=conv:${c.id}`} liveLabel={t.portal.live} reconnectingLabel={t.portal.reconnecting} onGone="/garage/messages" />
        <Link href="/garage/messages" className="text-sm underline-offset-4 hover:underline">
          {m.title}
        </Link>
      </PageHeader>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Card className="space-y-4">
          <Thread messages={c.messages} side="STAFF" buyerName={c.buyerName} t={t} lang={lang} />
          {c.status === "OPEN" ? (
            <ReplyForm action={staffReplyAction.bind(null, c.id)} placeholder={m.replyPlaceholder} />
          ) : (
            <p className="border border-dashed p-3 text-center text-sm text-muted-foreground">{m.closed}</p>
          )}
        </Card>
        <div className="space-y-4">
          {l && (
            <Card>
              <CardTitle>{m.vehicle}</CardTitle>
              <p className="font-medium">
                {l.make} {l.model} {l.version ?? ""} {l.year ?? ""}
              </p>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span className="font-mono">{listingNumber(l.number)}</span>
                <ListingStatusBadge status={l.status} t={t} />
                {l.price != null && <span>{formatPriceDt(l.price, lang)}</span>}
              </p>
              <div className="mt-3 flex flex-col gap-1 text-sm">
                <Link href={`/garage/showroom/${l.id}`} className="underline-offset-4 hover:underline">
                  {m.openListing}
                </Link>
                {isPubliclyVisible(l) && (
                  <Link href={`/showroom/${listingSlug(l)}`} target="_blank" className="inline-flex items-center gap-1 underline-offset-4 hover:underline">
                    {t.showroom.staff.viewPublic} <ExternalLink className="size-3.5" aria-hidden />
                  </Link>
                )}
              </div>
            </Card>
          )}
          <Card>
            <CardTitle>{m.contactInfo}</CardTitle>
            <dl className="space-y-1 text-sm">
              <div>
                <dt className="sr-only">{t.showroom.contact.name}</dt>
                <dd className="font-medium">{c.buyerName}</dd>
              </div>
              {c.buyerPhone && (
                <div>
                  <dt className="sr-only">{t.showroom.contact.phone}</dt>
                  <dd>
                    <a href={`tel:${c.buyerPhone.replace(/\s/g, "")}`} dir="ltr" className="underline-offset-4 hover:underline">
                      {c.buyerPhone}
                    </a>
                  </dd>
                </div>
              )}
              {c.buyerEmail && (
                <div>
                  <dt className="sr-only">{t.showroom.contact.email}</dt>
                  <dd>
                    <a href={`mailto:${c.buyerEmail}`} dir="ltr" className="break-all underline-offset-4 hover:underline">
                      {c.buyerEmail}
                    </a>
                  </dd>
                </div>
              )}
              <div className="pt-2 text-xs text-muted-foreground">{formatDateTime(c.createdAt, lang)}</div>
            </dl>
            <div className="mt-3">
              <ActionButton size="sm" variant="outline" action={conversationStatusAction.bind(null, c.id, c.status === "OPEN" ? "CLOSED" : "OPEN")}>
                {c.status === "OPEN" ? m.close : m.reopen}
              </ActionButton>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
