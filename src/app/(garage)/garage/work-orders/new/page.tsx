import { CheckInForm } from "@/components/garage/check-in-form";
import { PageHeader } from "@/components/ui/field";
import { getI18n } from "@/lib/i18n/server";
import { requirePageAccess } from "@/lib/session";
import { customerOptions } from "@/server/customers";
import { listMechanics } from "@/server/work-orders";

type PageProps = { searchParams: Promise<{ customerId?: string; vehicleId?: string }> };

export default async function NewWorkOrderPage({ searchParams }: PageProps) {
  await requirePageAccess("viewWorkOrders");
  const preset = await searchParams;
  const [{ t }, customers, staff] = await Promise.all([getI18n(), customerOptions(), listMechanics()]);
  const mechanics = staff.filter((s) => s.role === "MECHANIC" || s.role === "ADMIN");

  return (
    <div className="mx-auto max-w-6xl p-6">
      <PageHeader title={t.workOrders.createTitle} />
      <CheckInForm customers={customers} mechanics={mechanics} preset={preset} />
    </div>
  );
}
