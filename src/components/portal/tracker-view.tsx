import { redirect } from "next/navigation";
import { CalendarClock, CheckCircle2, FileText, Gauge, LogOut, MessageCircle, Phone, PartyPopper, UserRound } from "lucide-react";
import { approveQuoteAction, customerMessageAction, decideQuoteAction } from "@/actions/portal";
import { PortalLogoutForm } from "@/components/portal/portal-logout-form";
import { PortalQuoteDecision } from "@/components/portal/quote-decision";
import { ActionButton, ActionForm } from "@/components/action-form";
import { PlateChip } from "@/components/garage/badges";
import { LiveRefresh } from "@/components/live-refresh";
import { MediaGallery } from "@/components/portal/media-gallery";
import { RepairStepper } from "@/components/portal/repair-stepper";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { displayPlate, fmt, formatDate, formatDateTime, formatKm, formatMoney, formatQty, woNumber } from "@/lib/format";
import type { Dictionary } from "@/lib/i18n/fr";
import { getI18n, getLang } from "@/lib/i18n/server";
import { ClaimForm } from "@/components/portal/claim-form";
import { FeedbackForm } from "@/components/portal/feedback-form";
import { hasFeedback } from "@/server/claims";
import { getTrackingView, type TrackingView } from "@/server/portal";
import { ClientForecasts } from "@/components/agenda/client-forecasts";
import { trackingForecasts } from "@/server/agenda";
import { getPortalWorkOrderId } from "@/server/portal-session";
import { portalInspections } from "@/server/inspections";

function eventLabel(e: TrackingView["events"][number], t: Dictionary): string {
  if (e.type === "STATUS_CHANGED") {
    const to = (e.data as { to?: keyof Dictionary["status"] } | null)?.to;
    return to ? t.status[to] : "";
  }
  // V16 Lot 2: a decision on a quote (accepted, partly, refused).
  const decision = e.type === "QUOTE_APPROVED" ? (e.data as { decision?: keyof Dictionary["v16"]["quote"]["decision"] } | null)?.decision : undefined;
  if (decision && decision in t.v16.quote.decision) return t.v16.quote.decision[decision];
  return t.portal.timeline[e.type as keyof Dictionary["portal"]["timeline"]] ?? "";
}

/**
 * The live repair tracking (progress, quote decided line by line, supplements, photos, messages, rating, claim).
 * Shown on the website (/suivi/vehicule) and inside the PWA client app (/app/suivi/vehicule, `base="/app"`):
 * same data, same actions; only the links and redirects stay on the side the customer started from.
 */
export async function TrackerView({ base = "" }: { base?: "" | "/app" }) {
  const workOrderId = await getPortalWorkOrderId();
  if (!workOrderId) redirect(`${base}/suivi`);

  // V12: upcoming maintenance of THIS order's vehicle only (the session is bound to one work order).
  const [view, { t, lang }, rated, upcoming, inspections] = await Promise.all([
    getLang().then((l) => getTrackingView(workOrderId, l)),
    getI18n(),
    hasFeedback(workOrderId),
    trackingForecasts(workOrderId).catch(() => []),
    // V16 Lot 5 — red / orange / green inspection (checked points only, photo only when visible to the customer).
    portalInspections(workOrderId).catch(() => []),
  ]);
  if (!view) redirect(`${base}/suivi`);

  const ready = view.status === "READY";
  const delivered = view.status === "DELIVERED" || view.status === "CLOSED";
  const phone = view.garage.phone?.replace(/\s/g, "");
  const waNumber = phone?.replace(/\D/g, "").replace(/^00/, "");
  const waText = encodeURIComponent(`${woNumber(view.number)} – ${displayPlate(view.vehicle.plate)} : `);

  return (
    // V10: the tracking content uses the staff app's cards and chips (.gp-scope), the site header / footer stay as they are.
    // PWA app: always dark, in the look of the owner's phone mock-ups (.gp-phone: graphite cards, orange pill).
    <div className="dark gp-phone">
    <div className="gp-scope gp-stagger mx-auto max-w-3xl space-y-4 px-4 py-6">
      {!base && (
      <p className="flex items-center gap-2.5 px-1">
        <span className="phone-dot" aria-hidden />
        <span className="phone-kicker !text-white">{view.garage.name}</span>
      </p>
      )}
      {/* ── Vehicle header ── */}
      <section className="rounded-[28px] bg-[#0b0b0c] p-5 text-white ring-1 ring-white/10 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-wide text-slate-300">{woNumber(view.number)}</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
              {view.vehicle.make} {view.vehicle.model}
              {view.vehicle.year && <span className="ms-2 text-base font-normal text-slate-300">{view.vehicle.year}</span>}
            </h1>
            <div className="mt-2">
              <PlateChip plate={view.vehicle.plate} />
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <LiveRefresh url="/api/portal/live" liveLabel={t.portal.live} reconnectingLabel={t.portal.reconnecting} onGone={`${base}/suivi`} tone="dark" />
            <PortalLogoutForm>
              <button type="submit" className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-sm text-slate-200 hover:bg-white/10 hover:text-white">
                <LogOut className="size-4 rtl:rotate-180" aria-hidden /> {t.portal.logout}
              </button>
            </PortalLogoutForm>
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          <div className="rounded-[16px] bg-white/[0.07] p-3">
            <dt className="flex items-center gap-1.5 text-xs text-slate-300">
              <UserRound className="size-3.5" aria-hidden /> {t.portal.technician}
            </dt>
            <dd className="mt-1 font-medium">{view.mechanicName ?? (view.mechanicAssigned ? t.v14.client.team : t.portal.notAssigned)}</dd>
          </div>
          <div className="rounded-[16px] bg-white/[0.07] p-3">
            <dt className="flex items-center gap-1.5 text-xs text-slate-300">
              <CalendarClock className="size-3.5" aria-hidden /> {t.portal.eta}
            </dt>
            <dd className="mt-1 font-medium">{view.promisedAt ? formatDateTime(view.promisedAt, lang) : t.portal.etaUnknown}</dd>
          </div>
          {view.mileageIn != null && (
            <div className="col-span-2 rounded-[16px] bg-white/[0.07] p-3 sm:col-span-1">
              <dt className="flex items-center gap-1.5 text-xs text-slate-300">
                <Gauge className="size-3.5" aria-hidden /> {t.customers.mileage}
              </dt>
              <dd className="mt-1 font-medium" dir="ltr">{formatKm(view.mileageIn, lang)}</dd>
            </div>
          )}
        </dl>
        {/* V16 Lot 3: new delivery date with a customer-safe reason; parts still expected with their date. */}
        {view.promiseChange && (
          <p className="mt-3 rounded-[14px] bg-white/[0.07] px-3 py-2 text-sm" data-testid="portal-new-date">
            {fmt(t.v16.lot3.portal.newDate, { date: formatDateTime(view.promiseChange.date, lang), reason: t.v16.lot3.customerReasons[view.promiseChange.reason] })}
          </p>
        )}
        {view.partsExpected.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm" data-testid="portal-parts">
            {view.partsExpected.map((p) => (
              <li key={p.id} className="rounded-[14px] bg-white/[0.07] px-3 py-2">
                {p.expectedAt ? fmt(t.v16.lot3.portal.partExpected, { date: formatDate(p.expectedAt, lang), part: p.part }) : fmt(t.v16.lot3.portal.partWaiting, { part: p.part })}
              </li>
            ))}
          </ul>
        )}
        {/* V14: public label chosen by the garage only — never a name nor a level. */}
        {view.skillLabels.length > 0 && <p className="mt-3 text-sm text-slate-200">{fmt(t.v14.client.certified, { labels: view.skillLabels.join(", ") })}</p>}
      </section>

      {/* ── Banners ── */}
      {ready && (
        <p className="flex items-center gap-3 rounded-[20px] bg-gp-success-bg p-4 font-semibold text-gp-success-ink">
          <CheckCircle2 className="size-6 shrink-0" aria-hidden /> {t.portal.readyBanner}
        </p>
      )}
      {delivered && (
        <p className="flex items-center gap-3 rounded-[20px] bg-gp-panel p-4 font-semibold text-gp-ink">
          <PartyPopper className="size-6 shrink-0" aria-hidden /> {t.portal.delivered}
        </p>
      )}

      <RepairStepper steps={view.stepper.steps} progress={view.stepper.progress} ready={ready || delivered} t={t} plate={view.vehicle.plate} />

      {/* ── Quote to approve ── */}
      {view.quote && (
        <section className="rounded-[24px] bg-gp-card p-5 text-gp-ink ring-2 ring-gp-accent">
          <h2 className="font-semibold text-foreground">{t.portal.quoteTitle}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t.portal.quoteIntro}</p>
          <ul className="mt-4 divide-y text-sm">
            {view.quote.lines.map((l, i) => (
              <li key={i} className="flex items-start justify-between gap-3 py-2">
                <span>
                  {l.description}
                  <span className="ms-1 text-xs text-muted-foreground">× {formatQty(l.quantityX100, lang)}</span>
                </span>
                <span className="shrink-0 tabular-nums" dir="ltr">{formatMoney(l.totalHt, lang)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-2 space-y-1 border-t pt-3 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <dt>{t.invoices.totalHt}</dt>
              <dd dir="ltr">{formatMoney(view.quote.totals.totalHt, lang)}</dd>
            </div>
            {view.quote.totals.taxByRate.map((r) => (
              <div key={r.rateBp} className="flex justify-between text-muted-foreground">
                <dt>{fmt(t.invoices.vat, { rate: r.rateBp / 100 })}</dt>
                <dd dir="ltr">{formatMoney(r.tax, lang)}</dd>
              </div>
            ))}
            <div className="flex justify-between text-base font-bold">
              <dt>{t.invoices.totalTtc}</dt>
              <dd dir="ltr">{formatMoney(view.quote.totals.totalTtc, lang)}</dd>
            </div>
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            <ActionButton
              action={approveQuoteAction}
              confirm={fmt(t.portal.approveConfirm, { amount: formatMoney(view.quote.totals.totalTtc, lang) })}
              successMessage={t.portal.quoteApproved}
              className="phone-pill h-12 flex-1 text-base"
            >
              <CheckCircle2 className="size-5" aria-hidden /> {t.portal.approveQuote}
            </ActionButton>
            {phone && (
              <Button asChild variant="outline" className="h-11">
                <a href={`tel:${phone}`}>
                  <Phone className="size-4" aria-hidden /> {t.portal.call}
                </a>
              </Button>
            )}
          </div>
        </section>
      )}

      {/* ── V16 Lot 2: versioned quote, the customer decides line by line ── */}
      {view.quoteV16 && (
        <section className="rounded-[24px] bg-gp-card p-5 text-gp-ink ring-2 ring-gp-accent" data-testid="portal-quote">
          <h2 className="font-semibold text-foreground">
            {view.quoteV16.kind === "SUPPLEMENT" ? t.v16.portalQuote.supplementTitle : t.v16.portalQuote.title}
            <span className="ms-2 font-mono text-xs font-normal text-muted-foreground" dir="ltr">
              {view.quoteV16.number} · v{view.quoteV16.version}
            </span>
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{t.v16.portalQuote.intro}</p>
          {view.quoteV16.validUntil && <p className="mt-1 text-xs text-muted-foreground">{fmt(t.v16.portalQuote.validUntil, { date: formatDate(view.quoteV16.validUntil, lang) })}</p>}
          {view.quoteV16.announcedTtc ? (
            <p className="mt-2 text-sm">
              {fmt(t.v16.lot3.portal.announced, { amount: formatMoney(view.quoteV16.announcedTtc, lang) })}
            </p>
          ) : null}
          {view.quoteV16.previousTtc !== null && (
            <p className="mt-2 text-sm">
              {t.v16.quote.previous} : <span className="tabular-nums" dir="ltr">{formatMoney(view.quoteV16.previousTtc, lang)}</span>
            </p>
          )}
          {view.quoteV16.expired ? (
            <p className="mt-4 rounded-[16px] bg-gp-panel p-3 text-sm">{t.v16.portalQuote.expired}</p>
          ) : (
            <PortalQuoteDecision action={decideQuoteAction} quoteId={view.quoteV16.id} lines={view.quoteV16.lines} stampDuty={view.quoteV16.stampDuty} defaultName={view.customer.name} />
          )}
          {phone && (
            <Button asChild variant="outline" className="mt-3 h-11 w-full">
              <a href={`tel:${phone}`}>
                <Phone className="size-4" aria-hidden /> {t.portal.call}
              </a>
            </Button>
          )}
        </section>
      )}
      {!view.quoteV16 && view.workflowV16 && view.lastDecision && !delivered && (
        <p className="flex items-center gap-3 rounded-[20px] bg-gp-panel p-4 text-sm text-gp-ink" data-testid="portal-last-decision">
          <CheckCircle2 className="size-5 shrink-0" aria-hidden />
          {fmt(t.v16.portalQuote.last, { date: formatDateTime(view.lastDecision.createdAt, lang), decision: t.v16.quote.decision[view.lastDecision.decision], amount: formatMoney(view.lastDecision.amountApprovedTtc, lang) })}
        </p>
      )}

      {/* ── V16 Lot 5: inspection (red / orange / green), what was proposed in the quote ── */}
      {inspections.length > 0 && (
        <section className="rounded-[24px] border border-gp-line bg-gp-card p-5 text-gp-ink shadow-gp" data-testid="portal-inspection">
          <h2 className="font-semibold">{t.v16.lot5.inspection.portalTitle}</h2>
          <p className="mb-3 text-xs text-muted-foreground">{t.v16.lot5.inspection.portalIntro}</p>
          {inspections.map((insp) => (
            <ul key={insp.id} className="divide-y divide-gp-line text-sm">
              {insp.results.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2 py-2" data-color={r.color}>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${r.color === "RED" ? "bg-gp-danger-bg text-gp-danger-ink" : r.color === "ORANGE" ? "bg-amber-500/15 text-amber-800 dark:text-amber-300" : "bg-gp-success-bg text-gp-success-ink"}`}
                  >
                    {t.v16.lot5.inspection.colors[r.color]}
                  </span>
                  <span className="min-w-0 flex-1">
                    {r.label}
                    {r.note && <span className="block text-xs text-muted-foreground">{r.note}</span>}
                    {r.quoted && <span className="block text-xs font-medium text-gp-accent-ink">{t.v16.lot5.inspection.portalQuoted}</span>}
                  </span>
                  {r.mediaId && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <a href={`/api/media/${r.mediaId}`} target="_blank" rel="noopener"><img src={`/api/media/${r.mediaId}`} alt={r.label} className="size-14 rounded-md object-cover" /></a>
                  )}
                </li>
              ))}
            </ul>
          ))}
        </section>
      )}

      {/* ── Invoice ── */}
      {view.invoice && (
        <section className="flex items-center gap-3 rounded-[24px] border border-gp-line bg-gp-card p-4 text-gp-ink shadow-gp">
          <FileText className="size-5 text-muted-foreground" aria-hidden />
          <div className="flex-1 text-sm">
            <p className="font-medium">
              {t.portal.invoiceTitle} {view.invoice.number}
            </p>
            <p className="text-muted-foreground" dir="ltr">
              {formatMoney(view.invoice.totalTtc, lang)}
            </p>
          </div>
          {view.invoice.totalTtc > view.invoice.paidAmount && (
            <div className="text-end text-sm">
              <p className="text-muted-foreground">{t.portal.amountDue}</p>
              <p className="font-semibold text-foreground" dir="ltr">{formatMoney(view.invoice.totalTtc - view.invoice.paidAmount, lang)}</p>
            </div>
          )}
        </section>
      )}

      {/* ── Photos & videos ── */}
      <section className="rounded-[24px] border border-gp-line bg-gp-card p-5 text-gp-ink shadow-gp">
        <h2 className="phone-kicker mb-3">{t.app.track.photos}</h2>
        <MediaGallery
          emptyLabel={t.portal.galleryEmpty}
          items={view.media.map((m) => ({ id: m.id, kind: m.kind, caption: m.caption, createdAt: m.createdAt.toISOString() }))}
        />
      </section>

      {/* ── V12: upcoming maintenance (estimates) + booking ── */}
      <ClientForecasts rows={upcoming} t={t} lang={lang} base={base} />

      {/* ── Contact ── */}
      <section className="rounded-[24px] border border-gp-line bg-gp-card p-5 text-gp-ink shadow-gp">
        <h2 className="font-semibold">{t.portal.contactTitle}</h2>
        {phone && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button asChild className="h-11 rounded-full bg-gp-primary text-gp-primary-ink hover:opacity-90">
              <a href={`tel:${phone}`}>
                <Phone className="size-4" aria-hidden /> {t.portal.call}
              </a>
            </Button>
            {waNumber && (
              <Button asChild className="h-11 rounded-full bg-[#1f7a44] text-white hover:bg-[#19663a]">
                <a href={`https://wa.me/${waNumber}?text=${waText}`} target="_blank" rel="noopener">
                  <MessageCircle className="size-4" aria-hidden /> {t.portal.whatsapp}
                </a>
              </Button>
            )}
          </div>
        )}
        <ActionForm action={customerMessageAction} successMessage={t.portal.messageSent} className="mt-3 space-y-2">
          <Textarea name="body" required maxLength={1000} rows={3} placeholder={t.portal.messagePlaceholder} className="bg-card" />
          <Button type="submit" variant="outline" className="w-full">
            {t.portal.send}
          </Button>
        </ActionForm>
      </section>

      {/* ── Rating once the car is ready / delivered ── */}
      {(ready || delivered) && (
        <section className="rounded-[24px] border border-gp-line bg-gp-card p-5 text-gp-ink shadow-gp">
          <h2 className="mb-3 font-semibold">{t.feedback.trackerTitle}</h2>
          {rated ? <p className="text-sm text-muted-foreground">{t.feedback.already}</p> : <FeedbackForm fromTracker />}
        </section>
      )}

      {/* ── Complaint about this repair ── */}
      <details className="group rounded-[24px] border border-gp-line bg-gp-card p-5 text-gp-ink shadow-gp">
        <summary className="cursor-pointer font-semibold marker:text-muted-foreground">{t.claims.fromTracker}</summary>
        <div className="mt-4">
          <ClaimForm fromTracker defaults={{ name: view.customer.name, plate: displayPlate(view.vehicle.plate) }} />
        </div>
      </details>

      {/* ── History ── */}
      <section className="rounded-[24px] border border-gp-line bg-gp-card p-5 text-gp-ink shadow-gp">
        <h2 className="mb-3 font-semibold">{t.portal.history}</h2>
        {view.events.length === 0 && <p className="text-sm text-gp-muted">{t.v10.pages.tracking.noHistory}</p>}
        <ol className="space-y-3 border-s-2 border-border ps-4 empty:hidden">
          {view.events.map((e) => (
            <li key={e.id} className="relative text-sm">
              <span className="absolute -start-[21px] top-1.5 size-2.5 rounded-full bg-gp-accent ring-4 ring-gp-card" aria-hidden />
              <p className="font-medium">{eventLabel(e, t)}</p>
              {e.body && <p className="mt-0.5 whitespace-pre-line text-muted-foreground">{e.body}</p>}
              <time className="text-xs text-muted-foreground">{formatDateTime(e.createdAt, lang)}</time>
            </li>
          ))}
        </ol>
      </section>
    </div>
    </div>
  );
}
