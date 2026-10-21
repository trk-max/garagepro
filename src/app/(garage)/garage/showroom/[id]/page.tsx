import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, FileWarning } from "lucide-react";
import { setListingStatusAction, updateListingAction } from "@/actions/showroom";
import { ActionButton } from "@/components/action-form";
import { FactBadge, ListingStatusBadge } from "@/components/showroom/badges";
import { ListingForm } from "@/components/showroom/listing-form";
import { ListingMediaManager } from "@/components/showroom/media-manager";
import { Card, CardTitle, PageHeader } from "@/components/ui/field";
import { displayPlate, fmt, formatDateTime, formatKm, type Lang } from "@/lib/format";
import type { Dictionary } from "@/lib/i18n/fr";
import { getI18n } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { requirePageAccess } from "@/lib/session";
import { LISTING_TRANSITIONS, formatPriceDt, isListingStatus, isPubliclyVisible, listingNumber, listingSlug, readFacts, readSpecs, readStringList } from "@/lib/showroom";
import { getStaffListing, listSellers } from "@/server/showroom";

type PageProps = { params: Promise<{ id: string }> };

/** One listing: form, photos and documents, status, history. Read-only for people who cannot edit it. */
export default async function ListingStaffPage({ params }: PageProps) {
  const staff = await requirePageAccess("viewShowroom");
  const { id } = await params;
  if (!/^[a-z0-9]{20,40}$/.test(id)) notFound();
  const [{ t, lang }, l] = await Promise.all([getI18n(), getStaffListing(staff, id)]);
  if (!l) notFound();
  const sellers = l.canEdit && can(staff.role, "manageAllListings") ? await listSellers() : null;
  const s = t.showroom.staff;
  const facts = readFacts(l.facts);
  const next = isListingStatus(l.status) ? LISTING_TRANSITIONS[l.status] : [];

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6">
      <PageHeader title={`${listingNumber(l.number)} · ${l.make} ${l.model} ${l.version ?? ""}`}>
        <ListingStatusBadge status={l.status} t={t} />
        {isPubliclyVisible(l) && (
          <Link href={`/showroom/${listingSlug(l)}`} target="_blank" className="inline-flex items-center gap-1 text-sm underline-offset-4 hover:underline">
            {s.viewPublic} <ExternalLink className="size-3.5" aria-hidden />
          </Link>
        )}
      </PageHeader>
      {!l.canEdit && <p className="border border-dashed p-3 text-sm text-muted-foreground">{s.readOnly}</p>}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <Card>
            <ListingForm
              action={updateListingAction.bind(null, l.id)}
              listingId={l.id}
              readOnly={!l.canEdit}
              sellers={sellers ?? undefined}
              submitLabel={s.save}
              defaults={{
                make: l.make,
                model: l.model,
                version: l.version,
                year: l.year,
                mileage: l.mileage,
                fuel: l.fuel,
                gearbox: l.gearbox,
                engineCc: l.engineCc,
                powerHp: l.powerHp,
                fiscalHp: l.fiscalHp,
                doors: l.doors,
                seats: l.seats,
                colorExt: l.colorExt,
                colorInt: l.colorInt,
                condition: l.condition,
                price: l.price,
                description: l.description,
                equipment: readStringList(l.equipment),
                specs: readSpecs(l.specs),
                historySummary: l.historySummary,
                historyPublic: l.historyPublic,
                plate: l.plate,
                vin: l.vin,
                sellerId: l.sellerId,
              }}
            />
          </Card>
          <Card>
            <CardTitle>
              {s.photos} · {s.documents}
            </CardTitle>
            <ListingMediaManager
              listingId={l.id}
              canEdit={l.canEdit}
              items={l.media.map((m) => ({ id: m.id, kind: m.kind, caption: m.caption, isCover: m.isCover, isPublic: m.isPublic }))}
            />
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardTitle>{s.status}</CardTitle>
            <p className="mb-3 text-sm">
              <ListingStatusBadge status={l.status} t={t} /> <span className="ms-2 text-muted-foreground">{t.showroom.fields.seller} : {l.sellerName}</span>
            </p>
            {l.canEdit && next.length > 0 && (
              <div className="flex flex-col gap-2">
                {next.map((to) => (
                  <ActionButton key={to} size="sm" variant={to === "PUBLISHED" ? "default" : "outline"} action={setListingStatusAction.bind(null, l.id, to)}>
                    {to === "PUBLISHED" && l.status !== "DRAFT" ? t.showroom.republish : t.showroom.statusActions[to]}
                  </ActionButton>
                ))}
              </div>
            )}
            {l.canEdit && can(staff.role, "useShowroomMessages") && (
              <Link href={`/garage/messages?listing=${l.id}`} className="mt-3 block text-sm underline-offset-4 hover:underline">
                {s.conversations}
              </Link>
            )}
            {l.status === "SOLD" && (
              // TODO(module Contrats) : documents de vente (contrat de vente, attestation de cession) générés ici.
              <p className="mt-3 flex gap-2 border-s-2 border-amber-500 ps-2 text-xs text-muted-foreground">
                <FileWarning className="size-4 shrink-0" aria-hidden />
                {s.saleDocs}
              </p>
            )}
          </Card>

          <Card>
            <CardTitle>{s.facts}</CardTitle>
            <p className="mb-2 text-sm">{l.vehicle ? fmt(s.linkedVehicle, { plate: displayPlate(l.vehicle.plate) }) : s.notLinked}</p>
            <ul className="space-y-1 text-sm">
              <FactRow label={t.showroom.facts.identity} value={`${l.make} ${l.model}`} fact={facts.identity} t={t} lang={lang} />
              <FactRow label={t.showroom.fields.mileage} value={formatKm(l.mileage, lang)} fact={facts.mileage} t={t} lang={lang} />
              <FactRow label={t.showroom.fields.year} value={l.year ? String(l.year) : "—"} fact={facts.year} t={t} lang={lang} />
              <FactRow label={t.showroom.fields.fuel} value={l.fuel ? t.fuel[l.fuel as keyof Dictionary["fuel"]] : "—"} fact={facts.fuel} t={t} lang={lang} />
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">{t.showroom.facts.legend}</p>
          </Card>

          <Card>
            <CardTitle>{s.history}</CardTitle>
            <ol className="space-y-2 text-sm">
              {l.events.map((e) => (
                <li key={e.id} className="border-s-2 border-border ps-2">
                  <span className="font-medium">{s.events[e.type as keyof typeof s.events] ?? e.type}</span>{" "}
                  <EventDetail type={e.type} before={e.before} after={e.after} t={t} lang={lang} />
                  <span className="block text-xs text-muted-foreground">
                    {formatDateTime(e.createdAt, lang)} · {e.actorName ?? "—"}
                  </span>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </div>
  );
}

function FactRow({ label, value, fact, t, lang }: { label: string; value: string; fact: Parameters<typeof FactBadge>[0]["fact"]; t: Dictionary; lang: Lang }) {
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-end">
        {value}
        <span className="block">
          <FactBadge fact={fact} t={t} lang={lang} />
        </span>
      </span>
    </li>
  );
}

function EventDetail({ type, before, after, t, lang }: { type: string; before: unknown; after: unknown; t: Dictionary; lang: Lang }) {
  const b = (before ?? {}) as Record<string, unknown>;
  const a = (after ?? {}) as Record<string, unknown>;
  const price = (v: unknown) => (typeof v === "number" ? formatPriceDt(v, lang) : "—");
  const km = (v: unknown) => (typeof v === "number" ? formatKm(v, lang) : "—");
  const status = (v: unknown) => t.showroom.statuses[v as keyof Dictionary["showroom"]["statuses"]] ?? String(v ?? "—");
  if (type === "PRICE_CHANGED") return <span>{`${price(b.price)} → ${price(a.price)}`}</span>;
  if (type === "MILEAGE_CHANGED") return <span>{`${km(b.mileage)} → ${km(a.mileage)}`}</span>;
  if (type === "STATUS_CHANGED") return <span>{`${status(b.status)} → ${status(a.status)}`}</span>;
  if (type === "UPDATED") {
    const labels = Object.keys(a).map((k) => (k === "vehicleId" ? t.showroom.staff.vehicle : (t.showroom.fields[k as keyof Dictionary["showroom"]["fields"]] ?? k)));
    return <span className="text-muted-foreground">{fmt(t.showroom.staff.changedFields, { fields: labels.join(", ") })}</span>;
  }
  return null;
}
