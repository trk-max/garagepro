import type { Metadata } from "next";
import Link from "next/link";
import { CarFront, LockKeyhole } from "lucide-react";
import { buyerReplyAction } from "@/actions/messaging";
import { LiveRefresh } from "@/components/live-refresh";
import { CopyLinkButton } from "@/components/showroom/copy-link";
import { ReplyForm } from "@/components/showroom/reply-form";
import { Thread } from "@/components/showroom/thread";
import { getI18n } from "@/lib/i18n/server";
import { formatPriceDt, listingSlug } from "@/lib/showroom";
import { conversationForToken, markReadByBuyer } from "@/server/messaging";
import { clientIp } from "@/server/portal-session";

type PageProps = { params: Promise<{ token: string }> };

/** Private page: never indexed, and the address (which holds the token) is never sent as a referrer. */
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.showroom.messages.privateTitle, robots: { index: false, follow: false }, referrer: "no-referrer" };
}

/** Buyer's conversation, reached only through the private link (no account). */
export default async function BuyerConversationPage({ params }: PageProps) {
  const { token } = await params;
  const [{ t, lang }, c] = await Promise.all([getI18n(), conversationForToken(token, { ip: await clientIp() })]);
  const m = t.showroom.messages;

  if (!c) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center">
        <LockKeyhole className="mx-auto size-8 text-muted-foreground" strokeWidth={1.25} aria-hidden />
        <h1 className="f-display mt-4 text-2xl">{m.linkInvalid}</h1>
        <Link href="/showroom" className="f-label mt-6 inline-flex min-h-11 items-center border border-border px-4 hover:border-foreground">
          {t.showroom.public.back}
        </Link>
      </div>
    );
  }
  await markReadByBuyer(c.id);
  const l = c.listing;

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="f-display text-2xl">{m.privateTitle}</h1>
          <LiveRefresh url={`/api/messages/${token}/live`} liveLabel={t.portal.live} reconnectingLabel={t.portal.reconnecting} className="ms-auto" />
        </div>
        <p className="flex gap-2 border-s-2 border-amber-500 ps-2 text-sm text-muted-foreground">{m.privateIntro}</p>
        <CopyLinkButton />
      </header>

      {l && (
        <section className="flex items-center gap-4 border border-border p-3">
          {l.coverId ? (
            // eslint-disable-next-line @next/next/no-img-element -- files are streamed by /api/showroom/media after a check
            <img src={`/api/showroom/media/${l.coverId}`} alt="" className="h-16 w-24 shrink-0 object-cover" />
          ) : (
            <span className="grid h-16 w-24 shrink-0 place-items-center bg-muted text-muted-foreground">
              <CarFront className="size-6" strokeWidth={1} aria-hidden />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="font-semibold">
              {l.make} {l.model} {l.version ?? ""} {l.year ?? ""}
            </p>
            {l.public ? (
              <p className="text-sm text-muted-foreground">
                {l.price ? formatPriceDt(l.price, lang) : t.showroom.public.priceOnRequest}
                {" · "}
                <Link href={`/showroom/${listingSlug(l)}`} className="underline-offset-4 hover:underline">
                  {m.openListing}
                </Link>
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">{m.listingGone}</p>
            )}
          </div>
        </section>
      )}

      <section className="space-y-4 border border-border p-4">
        <Thread messages={c.messages} side="BUYER" buyerName={c.buyerName} t={t} lang={lang} />
        {c.status === "OPEN" ? (
          <ReplyForm action={buyerReplyAction.bind(null, token)} placeholder={m.buyerPlaceholder} />
        ) : (
          <p className="border border-dashed p-3 text-center text-sm text-muted-foreground">{m.closed}</p>
        )}
      </section>
    </div>
  );
}
