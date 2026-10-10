import { CheckInForm } from "@/components/garage/check-in-form";
import { PageHeader } from "@/components/ui/field";
import { getI18n } from "@/lib/i18n/server";
import { requirePageAccess } from "@/lib/session";
import { customerOption } from "@/server/customers";
import { listMechanics } from "@/server/work-orders";

type PageProps = { searchParams: Promise<{ customerId?: string; vehicleId?: string }> };

export default async function NewWorkOrderPage({ searchParams }: PageProps) {
  await requirePageAccess("viewWorkOrders");
  const preset = await searchParams;
  // Only the pre-selected customer is loaded; the others are searched on demand.
  const [{ t }, initialCustomer, staff] = await Promise.all([getI18n(), preset.customerId ? customerOption(preset.customerId) : null, listMechanics()]);
  const mechanics = staff.filter((s) => s.role === "MECHANIC" || s.role === "ADMIN");

  return (
    <div className="mx-auto max-w-6xl p-6">
      <PageHeader title={t.workOrders.createTitle} />
      <CheckInForm initialCustomer={initialCustomer} mechanics={mechanics} preset={{ vehicleId: preset.vehicleId }} />
    </div>
  );
}
