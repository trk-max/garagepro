import Link from "next/link";
import { notFound } from "next/navigation";
import { ClipboardList, Plus } from "lucide-react";
import { RelatedContracts } from "@/components/garage/contracts";
import { canContract } from "@/lib/contracts";
import { updateCustomerAction } from "@/actions/catalog";
import { ActionForm } from "@/components/action-form";
import { PlateChip } from "@/components/garage/badges";
import { CustomerFields } from "@/components/garage/customer-fields";
import { CustomerAvatar } from "@/components/customers/customer-avatar";
import { VehicleTiles } from "@/components/customers/vehicle-tiles";
import { STATUS_DOT } from "@/components/overview/recent-orders";
import { Button } from "@/components/ui/button";
import { Table, Td, Th } from "@/components/ui/field";
import { Chip, StatusDot } from "@/components/ui/redesign/chip";
import { EmptyState, PillLink, Surface, SurfaceHeader } from "@/components/ui/redesign/surface";
import { formatDate, formatMoney, woNumber } from "@/lib/format";
import { LiveRefresh } from "@/components/live-refresh";
import { getI18n } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { requirePageAccess } from "@/lib/session";
import { CompanyAccess } from "@/components/garage/company-access";
import { getCustomer } from "@/server/customers";

type PageProps = { params: Promise<{ id: string }> };

export default async function CustomerPage({ params }: PageProps) {
  const staff = await requirePageAccess("viewCustomers");
  const showMoney = can(staff, "viewFinance");
  const { id } = await params;
  const [customer, { t, lang }] = await Promise.all([getCustomer(id), getI18n()]);
  if (!customer) notFound();
  const p = t.v10.pages.customers;

  return (
    <div className="mx-auto max-w-[1440px] px-3 pt-4 pb-6 sm:px-5 xl:ps-2 xl:pe-5">
      {/* Header: avatar, name, contact, person / company, total invoiced (finance roles), new order. */}
      <header className="mb-6 flex flex-wrap items-center gap-4">
        <CustomerAvatar name={customer.name} size={64} />
        <div className="min-w-0 flex-1 basis-60">
          <h1 className="text-[28px] leading-tight font-semibold tracking-tight sm:text-4xl">{customer.name}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gp-muted">
            <span dir="ltr">{customer.phone}</span>
            {customer.email && <span dir="ltr">· {customer.email}</span>}
            <Chip tone={customer.isCompany ? "accent" : "neutral"}>{customer.isCompany ? p.company : p.person}</Chip>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LiveRefresh url="/api/staff/live?topic=customers" liveLabel={t.portal.live} reconnectingLabel={t.portal.reconnecting} />
          {showMoney && (
            <span className="rounded-full bg-gp-card px-4 py-2.5 text-sm text-gp-muted">
              {t.customers.totalSpent} : <b className="font-semibold text-gp-ink" dir="ltr">{formatMoney(customer.totalInvoiced, lang)}</b>
            </span>
          )}
          <PillLink href={`/garage/work-orders/new?customerId=${customer.id}`} icon={Plus}>
            {t.workOrders.new}
          </PillLink>
        </div>
      </header>

      <div className="gp-stagger grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0 space-y-5">
          <VehicleTiles customer={customer} who={staff} t={t} lang={lang} />

          <Surface aria-labelledby="cu-orders">
            <SurfaceHeader id="cu-orders" title={t.workOrders.title} />
            {customer.workOrders.length === 0 ? (
              <EmptyState icon={ClipboardList} title={t.workOrders.empty} />
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
                    <tr key={wo.id} className="transition-colors duration-150 hover:bg-gp-hover">
                      <Td>
                        <Link href={`/garage/work-orders/${wo.id}`} className="font-mono text-xs font-medium whitespace-nowrap hover:underline">
                          {woNumber(wo.number)}
                        </Link>
                      </Td>
                      <Td className="text-xs text-gp-muted">{formatDate(wo.createdAt, lang)}</Td>
                      <Td>
                        <PlateChip plate={wo.vehicle.plate} />
                      </Td>
                      <Td className="max-w-xs">
                        <span className="line-clamp-1">{wo.complaint}</span>
                      </Td>
                      <Td>
                        <StatusDot color={STATUS_DOT[wo.status]}>{t.status[wo.status]}</StatusDot>
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
          </Surface>
        </div>

        <div className="space-y-5">
          {/* V9: contracts of this customer (repair, fleet…), only the categories the viewer may see. */}
          <RelatedContracts
            staff={staff}
            filter={{ customerId: customer.id }}
            t={t}
            lang={lang}
            newHref={customer.isCompany && canContract(staff, "FLEET", "manage") ? `/garage/contrats/nouveau?category=FLEET&customer=${customer.id}` : null}
            newLabel={t.ctr.createFleet}
          />
          <Surface aria-labelledby="cu-edit">
            <SurfaceHeader id="cu-edit" title={t.common.edit} />
            <ActionForm action={updateCustomerAction.bind(null, customer.id)} reset={false} className="space-y-4">
              <CustomerFields t={t} defaults={customer} />
              <Button type="submit" className="w-full">
                {t.common.save}
              </Button>
            </ActionForm>
          </Surface>
          {can(staff, "manageCompanyAccess") && <CompanyAccess customerId={customer.id} t={t} lang={lang} />}
        </div>
      </div>
    </div>
  );
}
