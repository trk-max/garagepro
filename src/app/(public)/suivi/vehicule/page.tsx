import { redirect } from "next/navigation";
import { CalendarClock, CheckCircle2, FileText, Gauge, LogOut, MessageCircle, Phone, PartyPopper, UserRound } from "lucide-react";
import { approveQuoteAction, customerMessageAction, portalLogoutAction } from "@/actions/portal";
import { ActionButton, ActionForm } from "@/components/action-form";
import { PlateChip } from "@/components/garage/badges";
import { LiveRefresh } from "@/components/live-refresh";
import { MediaGallery } from "@/components/portal/media-gallery";
import { RepairStepper } from "@/components/portal/repair-stepper";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { displayPlate, fmt, formatDateTime, formatKm, formatMoney, formatQty, woNumber } from "@/lib/format";
import type { Dictionary } from "@/lib/i18n/fr";
import { getI18n } from "@/lib/i18n/server";
import { getTrackingView, type TrackingView } from "@/server/portal";
import { getPortalWorkOrderId } from "@/server/portal-session";

export const dynamic = "force-dynamic";

function eventLabel(e: TrackingView["events"][number], t: Dictionary): string {
  if (e.type === "STATUS_CHANGED") {
    const to = (e.data as { to?: keyof Dictionary["status"] } | null)?.to;
    return to ? t.status[to] : "";
  }
  return t.portal.timeline[e.type as keyof Dictionary["portal"]["timeline"]] ?? "";
}

export default async function TrackerPage() {
  const workOrderId = await getPortalWorkOrderId();
  if (!workOrderId) redirect("/suivi");

  const [view, { t, lang }] = await Promise.all([getTrackingView(workOrderId), getI18n()]);
  if (!view) redirect("/suivi");

  const ready = view.status === "READY";
  const delivered = view.status === "DELIVERED";
  const phone = view.garage.phone?.replace(/\s/g, "");
  const waNumber = phone?.replace(/\D/g, "").replace(/^00/, "");
  const waText = encodeURIComponent(`${woNumber(view.number)} – ${displayPlate(view.vehicle.plate)} : `);

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
      {/* ── Vehicle header ── */}
      <section className="rounded-lg bg-navy p-5 text-white shadow-sm ring-1 ring-white/10">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-wide text-slate-300">{woNumber(view.number)}</p>
            <h1 className="mt-1 text-xl font-bold">
              {view.vehicle.make} {view.vehicle.model}
              {view.vehicle.year && <span className="ms-2 text-base font-normal text-slate-300">{view.vehicle.year}</span>}
            </h1>
            <div className="mt-2">
              <PlateChip plate={view.vehicle.plate} />
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <LiveRefresh url="/api/portal/stream" liveLabel={t.portal.live} reconnectingLabel={t.portal.reconnecting} onGone="/suivi" tone="dark" />
            <form action={portalLogoutAction}>
              <button type="submit" className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-sm text-slate-200 hover:bg-white/10 hover:text-white">
                <LogOut className="size-4 rtl:rotate-180" aria-hidden /> {t.portal.logout}
              </button>
            </form>
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          <div className="rounded-md bg-white/5 p-3">
            <dt className="flex items-center gap-1.5 text-xs text-slate-300">
              <UserRound className="size-3.5" aria-hidden /> {t.portal.technician}
            </dt>
            <dd className="mt-1 font-medium">{view.mechanicName ?? t.portal.notAssigned}</dd>
          </div>
          <div className="rounded-md bg-white/5 p-3">
            <dt className="flex items-center gap-1.5 text-xs text-slate-300">
              <CalendarClock className="size-3.5" aria-hidden /> {t.portal.eta}
            </dt>
            <dd className="mt-1 font-medium">{view.promisedAt ? formatDateTime(view.promisedAt, lang) : t.portal.etaUnknown}</dd>
          </div>
          {view.mileageIn != null && (
            <div className="col-span-2 rounded-md bg-white/5 p-3 sm:col-span-1">
              <dt className="flex items-center gap-1.5 text-xs text-slate-300">
                <Gauge className="size-3.5" aria-hidden /> {t.customers.mileage}
              </dt>
              <dd className="mt-1 font-medium" dir="ltr">{formatKm(view.mileageIn, lang)}</dd>
            </div>
          )}
        </dl>
      </section>

      {/* ── Banners ── */}
      {ready && (
        <p className="flex items-center gap-3 rounded-lg bg-emerald-500 p-4 font-medium text-white shadow-sm">
          <CheckCircle2 className="size-6 shrink-0" aria-hidden /> {t.portal.readyBanner}
        </p>
      )}
      {delivered && (
        <p className="flex items-center gap-3 rounded-lg bg-slate-800 p-4 font-medium text-white">
          <PartyPopper className="size-6 shrink-0" aria-hidden /> {t.portal.delivered}
        </p>
      )}

      <RepairStepper steps={view.stepper.steps} progress={view.stepper.progress} ready={ready || delivered} t={t} />

      {/* ── Quote to approve ── */}
      {view.quote && (
        <section className="rounded-lg bg-card p-5 shadow-sm ring-2 ring-brand-400">
          <h2 className="font-semibold text-brand-700 dark:text-brand-400">{t.portal.quoteTitle}</h2>
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
              className="h-11 flex-1 bg-emerald-600 text-base hover:bg-emerald-700"
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

      {/* ── Invoice ── */}
      {view.invoice && (
        <section className="flex items-center gap-3 rounded-lg bg-card p-4 shadow-sm ring-1 ring-border">
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
              <p className="font-semibold text-brand-700 dark:text-brand-400" dir="ltr">{formatMoney(view.invoice.totalTtc - view.invoice.paidAmount, lang)}</p>
            </div>
          )}
        </section>
      )}

      {/* ── Photos & videos ── */}
      <section className="rounded-lg bg-card p-5 shadow-sm ring-1 ring-border">
        <h2 className="mb-3 font-semibold">{t.portal.gallery}</h2>
        <MediaGallery
          emptyLabel={t.portal.galleryEmpty}
          items={view.media.map((m) => ({ id: m.id, kind: m.kind, caption: m.caption, createdAt: m.createdAt.toISOString() }))}
        />
      </section>

      {/* ── Contact ── */}
      <section className="rounded-lg bg-card p-5 shadow-sm ring-1 ring-border">
        <h2 className="font-semibold">{t.portal.contactTitle}</h2>
        {phone && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button asChild className="h-11 bg-anthracite hover:bg-black">
              <a href={`tel:${phone}`}>
                <Phone className="size-4" aria-hidden /> {t.portal.call}
              </a>
            </Button>
            {waNumber && (
              <Button asChild className="h-11 bg-emerald-600 hover:bg-emerald-700">
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

      {/* ── History ── */}
      <section className="rounded-lg bg-card p-5 shadow-sm ring-1 ring-border">
        <h2 className="mb-3 font-semibold">{t.portal.history}</h2>
        <ol className="space-y-3 border-s-2 border-border ps-4">
          {view.events.map((e) => (
            <li key={e.id} className="relative text-sm">
              <span className="absolute -start-[21px] top-1.5 size-2.5 rounded-full bg-brand-400 ring-4 ring-white" aria-hidden />
              <p className="font-medium">{eventLabel(e, t)}</p>
              {e.body && <p className="mt-0.5 whitespace-pre-line text-muted-foreground">{e.body}</p>}
              <time className="text-xs text-muted-foreground">{formatDateTime(e.createdAt, lang)}</time>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
