import Link from "next/link";
import { Plus } from "lucide-react";
import { ListingStatusBadge } from "@/components/showroom/badges";
import { buttonVariants } from "@/components/ui/button";
import { Card, PageHeader, Table, Td, Th } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { formatDateTime, formatKm, displayPlate } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { requirePageAccess } from "@/lib/session";
import { formatPriceDt, listingNumber } from "@/lib/showroom";
import { cn } from "@/lib/utils";
import { listStaffListings } from "@/server/showroom";

type PageProps = { searchParams: Promise<{ f?: string; q?: string }> };
const FILTERS = ["active", "mine", "archived"] as const;
type Filter = (typeof FILTERS)[number];

/** Showroom inventory (V9). Everyone with viewShowroom sees it; editing is checked per listing. */
export default async function ShowroomStaffPage({ searchParams }: PageProps) {
  const staff = await requirePageAccess("viewShowroom");
  const sp = await searchParams;
  const filter: Filter = (FILTERS as readonly string[]).includes(sp.f ?? "") ? (sp.f as Filter) : can(staff, "manageAllListings") ? "active" : can(staff, "createListing") ? "mine" : "active";
  const q = sp.q?.trim().slice(0, 60) || undefined;
  const [{ t, lang }, rows] = await Promise.all([
    getI18n(),
    listStaffListings(staff, { mine: filter === "mine", status: filter === "archived" ? "ARCHIVED" : undefined, q }),
  ]);
  const s = t.showroom.staff;
  const visibleFilters = FILTERS.filter((f) => f !== "mine" || can(staff, "createListing"));

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6">
      <PageHeader title={s.title}>
        <Link href="/showroom" className="text-sm underline-offset-4 hover:underline" target="_blank">
          {s.viewPublic}
        </Link>
        {can(staff, "createListing") && (
          <Link href="/garage/showroom/new" className={buttonVariants({ size: "sm" })}>
            <Plus aria-hidden /> {s.new}
          </Link>
        )}
      </PageHeader>

      <div className="flex flex-wrap items-center gap-2">
        <nav className="flex flex-wrap gap-1" aria-label={s.title}>
          {visibleFilters.map((f) => (
            <Link
              key={f}
              href={`/garage/showroom?f=${f}`}
              aria-current={f === filter ? "page" : undefined}
              className={cn("f-label border px-3 py-2", f === filter ? "border-foreground text-foreground" : "border-border text-muted-foreground hover:text-foreground")}
            >
              {s.filters[f]}
            </Link>
          ))}
        </nav>
        <form className="ms-auto flex gap-2" action="/garage/showroom">
          <input type="hidden" name="f" value={filter} />
          <Input name="q" defaultValue={q} placeholder={s.search} aria-label={s.search} className="h-9 w-64 max-w-full" />
        </form>
      </div>

      {rows.length === 0 ? (
        <p className="border border-dashed p-10 text-center text-sm text-muted-foreground">{s.none}</p>
      ) : (
        <Card className="p-0 sm:p-0">
          <Table>
            <thead>
              <tr>
                <Th>{s.vehicle}</Th>
                <Th>{s.price}</Th>
                <Th>{t.showroom.fields.mileage}</Th>
                <Th>{s.status}</Th>
                <Th>{t.showroom.fields.seller}</Th>
                <Th>{s.updated}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-accent/30">
                  <Td>
                    <div className="flex items-center gap-3">
                      {r.coverId ? (
                        // eslint-disable-next-line @next/next/no-img-element -- private file streamed after an access check
                        <img src={`/api/showroom/media/${r.coverId}`} alt="" loading="lazy" className="h-12 w-16 shrink-0 object-cover" />
                      ) : (
                        <span className="h-12 w-16 shrink-0 border border-dashed" aria-hidden />
                      )}
                      <span className="min-w-0">
                        <Link href={`/garage/showroom/${r.id}`} className="font-medium underline-offset-4 hover:underline">
                          {r.make} {r.model} {r.version ?? ""} {r.year ?? ""}
                        </Link>
                        <span className="block font-mono text-xs text-muted-foreground">
                          {listingNumber(r.number)}
                          {r.plate ? ` · ${displayPlate(r.plate)}` : ""}
                        </span>
                      </span>
                    </div>
                  </Td>
                  <Td className="whitespace-nowrap">{r.price != null ? formatPriceDt(r.price, lang) : "—"}</Td>
                  <Td className="whitespace-nowrap">{formatKm(r.mileage, lang)}</Td>
                  <Td>
                    <ListingStatusBadge status={r.status} t={t} />
                  </Td>
                  <Td className="text-sm">{r.sellerName}</Td>
                  <Td className="text-xs text-muted-foreground">{formatDateTime(r.updatedAt, lang)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}
