import { createListingAction } from "@/actions/showroom";
import { ListingForm } from "@/components/showroom/listing-form";
import { Card, PageHeader } from "@/components/ui/field";
import { getI18n } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { requirePageAccess } from "@/lib/session";
import { listSellers } from "@/server/showroom";

/** New listing, saved as a draft. A seller's listing is always theirs; managers may pick the seller. */
export default async function NewListingPage() {
  const staff = await requirePageAccess("createListing");
  const [{ t }, sellers] = await Promise.all([getI18n(), can(staff.role, "manageAllListings") ? listSellers() : null]);
  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <PageHeader title={t.showroom.staff.new} />
      <Card>
        <ListingForm action={createListingAction} sellers={sellers ?? undefined} submitLabel={t.showroom.staff.create} />
      </Card>
    </div>
  );
}
