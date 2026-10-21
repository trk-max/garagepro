import Link from "next/link";
import { notFound } from "next/navigation";
import { Wrench, QrCode, Plus, Activity } from "lucide-react";
import { addVehicleAction, updateCustomerAction } from "@/actions/catalog";
import { ActionForm } from "@/components/action-form";
import { PlateChip, StatusBadge } from "@/components/garage/badges";
import { CustomerFields } from "@/components/garage/customer-fields";
import { VehicleFields } from "@/components/garage/vehicle-fields";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, PageHeader, Table, Td, Th } from "@/components/ui/field";
import { formatDate, formatKm, formatMoney, woNumber } from "@/lib/format";
import { LiveRefresh } from "@/components/live-refresh";
import { getI18n } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { requirePageAccess } from "@/lib/session";
import { CompanyAccess } from "@/components/garage/company-access";
import { getCustomer } from "@/server/customers";

type PageProps = { params: Promise<{ id: string }> };

export default async function CustomerPage({ params }: PageProps) {
  const staff = await requirePageAccess("viewCustomers");
  const showMoney = can(staff.role, "viewFinance");
  const { id } = await params;
  const [customer, { t, lang }] = await Promise.all([getCustomer(id), getI18n()]);
  if (!customer) notFound();

  return (
    <div className="mx-auto max-w-7xl p-6">
      <PageHeader title={customer.name}>
        <LiveRefresh url="/api/staff/live?topic=customers" liveLabel={t.portal.live} reconnectingLabel={t.portal.reconnecting} />
        {showMoney && (
          <span className="text-sm text-muted-foreground">
            {t.customers.totalSpent}: <span className="font-medium text-foreground" dir="ltr">{formatMoney(customer.totalInvoiced, lang)}</span>
          </span>
        )}
        <Button asChild>
          <Link href={`/garage/work-orders/new?customerId=${customer.id}`}>{t.workOrders.new}</Link>
        </Button>
      </PageHeader>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <Card>
            <CardTitle>{t.customers.vehicles}</CardTitle>
            {customer.vehicles.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t.customers.noVehicles}</p>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {customer.vehicles.map((v) => (
                  <li key={v.id} id={`vehicule-${v.id}`} className="scroll-mt-20 rounded-md border p-3 target:border-brand-500">
                    <div className="flex items-center gap-2">
                      <PlateChip plate={v.plate} />
                      <span className="font-medium">
                        {v.make} {v.model}
                      </span>
                      {v.year && <span className="text-xs text-muted-foreground">{v.year}</span>}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {v.fuel ? t.fuel[v.fuel] : ""} · <span dir="ltr">{formatKm(v.mileage, lang)}</span>
                      {v.vin && <span className="ms-1 font-mono" dir="ltr">· {v.vin}</span>}
                    </p>
                    <Button asChild size="sm" variant="outline" className="mt-2">
                      <Link href={`/garage/work-orders/new?customerId=${customer.id}&vehicleId=${v.id}`}>
                        <Plus className="size-3.5" aria-hidden /> {t.customers.newWorkOrder}
                      </Link>
                    </Button>
                    {can(staff.role, "manageMaintenance") && (
                      <Button asChild size="sm" variant="outline" className="ms-2 mt-2">
                        <Link href={`/garage/vehicules/${v.id}/entretien`}>
                          <Wrench className="size-3.5" aria-hidden /> {t.v7.maintenance.button}
                        </Link>
                      </Button>
                    )}
                    {can(staff.role, "manageVehicleQr") && (
                      <Button asChild size="sm" variant="outline" className="ms-2 mt-2">
                        <Link href={`/garage/vehicules/${v.id}/qr`}>
                          <QrCode className="size-3.5" aria-hidden /> {t.v7.qr.button}
                        </Link>
                      </Button>
                    )}
                    {can(staff.role, "obdDiagnose") && (
                      <Button asChild size="sm" variant="outline" className="ms-2 mt-2">
                        <Link href={`/garage/vehicules/${v.id}/obd`}>
                          <Activity className="size-3.5" aria-hidden /> {t.v7.obd.button}
                        </Link>
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}

            <details className="mt-4 rounded-md border border-dashed p-3">
              <summary className="cursor-pointer text-sm font-medium">{t.customers.addVehicle}</summary>
              <ActionForm action={addVehicleAction.bind(null, customer.id)} className="mt-3 space-y-3">
                <VehicleFields t={t} />
                <Button type="submit">{t.common.add}</Button>
              </ActionForm>
            </details>
          </Card>

          <Card>
            <CardTitle>{t.workOrders.title}</CardTitle>
            {customer.workOrders.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t.workOrders.empty}</p>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>{t.workOrders.number}</Th>
                    <Th>{t.workOrders.createdAt}</Th>
                    <Th>{t.workOrders.vehicle}</Th>
                    <Th>{t.workOrders.complaint}</Th>
                    <Th>{t.workOrders.status}</Th>
                    {showMoney && <Th className="text-end">{t.invoices.totalTtc}</Th>}
                  </tr>
                </thead>
                <tbody>
                  {customer.workOrders.map((wo) => (
                    <tr key={wo.id} className="hover:bg-accent/30">
                      <Td>
                        <Link href={`/garage/work-orders/${wo.id}`} className="font-mono text-xs hover:underline">
                          {woNumber(wo.number)}
                        </Link>
                      </Td>
                      <Td className="text-xs text-muted-foreground">{formatDate(wo.createdAt, lang)}</Td>
                      <Td>
                        <PlateChip plate={wo.vehicle.plate} />
                      </Td>
                      <Td className="max-w-xs">
                        <span className="line-clamp-1">{wo.complaint}</span>
                      </Td>
                      <Td>
                        <StatusBadge status={wo.status} t={t} />
                      </Td>
                      {showMoney && (
                        <Td className="text-end tabular-nums" dir="ltr">
                          {wo.invoice ? formatMoney(wo.invoice.totalTtc, lang) : t.common.none}
                        </Td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </div>

        <div className="space-y-6">
        <Card className="h-fit">
          <CardTitle>{t.common.edit}</CardTitle>
          <ActionForm action={updateCustomerAction.bind(null, customer.id)} reset={false} className="space-y-4">
            <CustomerFields t={t} defaults={customer} />
            <Button type="submit" className="w-full">
              {t.common.save}
            </Button>
          </ActionForm>
        </Card>
        {can(staff.role, "manageCompanyAccess") && <CompanyAccess customerId={customer.id} t={t} lang={lang} />}
        </div>
      </div>
    </div>
  );
}
