import Link from "next/link";
import type { WorkOrderStatus } from "@prisma/client";
import { PlateChip, PriorityBadge, StatusBadge } from "@/components/garage/badges";
import { SearchForm } from "@/components/garage/search-form";
import { Button } from "@/components/ui/button";
import { PageHeader, Table, Td, Th } from "@/components/ui/field";
import { PlateSearch } from "@/components/garage/plate-search";
import { formatDate, woNumber } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { requirePageAccess } from "@/lib/session";
import { cn } from "@/lib/utils";
import { listWorkOrders, type WorkOrderFilter } from "@/server/work-orders";
import { STATUS_ORDER } from "@/server/workflow";

type PageProps = { searchParams: Promise<{ status?: string; q?: string }> };

function parseFilter(value: string | undefined): WorkOrderFilter {
  if (value === "all") return "all";
  if (value && (STATUS_ORDER as string[]).includes(value)) return value as WorkOrderStatus;
  return "active";
}

export default async function WorkOrdersPage({ searchParams }: PageProps) {
  await requirePageAccess("viewWorkOrders");
  const params = await searchParams;
  const filter = parseFilter(params.status);
  const [{ t, lang }, orders] = await Promise.all([getI18n(), listWorkOrders(filter, params.q)]);

  const chips: { value: WorkOrderFilter; label: string }[] = [
    { value: "active", label: t.workOrders.active },
    ...STATUS_ORDER.map((s) => ({ value: s, label: t.status[s] })),
    { value: "all", label: t.common.all },
  ];

  const href = (value: WorkOrderFilter) => {
    const sp = new URLSearchParams();
    if (value !== "active") sp.set("status", value);
    if (params.q) sp.set("q", params.q);
    const qs = sp.toString();
    return `/garage/work-orders${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="mx-auto max-w-7xl px-3 pt-4 pb-6 lg:p-6">
      <PageHeader title={t.workOrders.title}>
        <SearchForm placeholder={t.workOrders.searchPlaceholder} defaultValue={params.q} hidden={{ status: params.status }} />
        <PlateSearch className="w-48" placeholder={t.plateLookup.quick} label={t.plateLookup.title} />
        <Button asChild>
          <Link href="/garage/work-orders/new">{t.workOrders.new}</Link>
        </Button>
      </PageHeader>

      {/* Phones: the status chips scroll sideways on one row. */}
      <nav className="gp-scroll-x mb-4 flex gap-1.5 overflow-x-auto pb-1 lg:flex-wrap lg:overflow-visible" aria-label={t.workOrders.status}>
        {chips.map((chip) => (
          <Link
            key={chip.value}
            href={href(chip.value)}
            aria-current={filter === chip.value ? "page" : undefined}
            className={cn(
              "chip-tap shrink-0 rounded-full border px-3 py-1 text-xs whitespace-nowrap transition-colors",
              filter === chip.value ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent",
            )}
          >
            {chip.label}
          </Link>
        ))}
      </nav>

      {orders.length === 0 ? (
        <p className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">{t.workOrders.empty}</p>
      ) : (
        <>
        {/* Phones and tablets: one card per order (big touch target), same data as the table. */}
        <ul className="space-y-3 lg:hidden" data-testid="work-order-cards">
          {orders.map((wo) => (
            <li key={wo.id}>
              <Link href={`/garage/work-orders/${wo.id}`} className="block rounded-[22px] border border-gp-line bg-gp-card p-4 shadow-gp hover:bg-gp-hover">
                <div className="flex flex-wrap items-center gap-2">
                  <PlateChip plate={wo.vehicle.plate} />
                  <span className="font-semibold">
                    {wo.vehicle.make} {wo.vehicle.model}
                  </span>
                  <span className="ms-auto">
                    <StatusBadge status={wo.status} t={t} />
                  </span>
                </div>
                <p className="mt-2 line-clamp-2 text-sm text-gp-muted">{wo.complaint}</p>
                <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gp-muted">
                  <span className="font-mono">{woNumber(wo.number)}</span>
                  <span>{wo.customer.name}</span>
                  <span>{wo.mechanic?.name ?? t.workOrders.unassigned}</span>
                  {wo.promisedAt && <span>{formatDate(wo.promisedAt, lang)}</span>}
                  <PriorityBadge priority={wo.priority} t={t} />
                </p>
              </Link>
            </li>
          ))}
        </ul>
        <div className="hidden lg:block">
        <Table>
          <thead>
            <tr>
              <Th>{t.workOrders.number}</Th>
              <Th>{t.workOrders.vehicle}</Th>
              <Th>{t.workOrders.customer}</Th>
              <Th>{t.workOrders.complaint}</Th>
              <Th>{t.workOrders.mechanic}</Th>
              <Th>{t.workOrders.status}</Th>
              <Th>{t.workOrders.promisedAt}</Th>
            </tr>
          </thead>
          <tbody>
            {orders.map((wo) => (
              <tr key={wo.id} className="hover:bg-accent/30">
                <Td>
                  <Link href={`/garage/work-orders/${wo.id}`} className="whitespace-nowrap font-mono text-xs font-medium hover:underline">
                    {woNumber(wo.number)}
                  </Link>
                </Td>
                <Td>
                  <Link href={`/garage/work-orders/${wo.id}`} className="flex flex-col items-start gap-1">
                    <PlateChip plate={wo.vehicle.plate} />
                    <span className="text-xs text-muted-foreground">{wo.vehicle.make} {wo.vehicle.model}</span>
                  </Link>
                </Td>
                <Td>
                  <div>{wo.customer.name}</div>
                  <div className="text-xs text-muted-foreground" dir="ltr">{wo.customer.phone}</div>
                </Td>
                <Td className="max-w-xs">
                  <span className="line-clamp-2">{wo.complaint}</span>
                </Td>
                <Td className="text-muted-foreground">{wo.mechanic?.name ?? t.workOrders.unassigned}</Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    <StatusBadge status={wo.status} t={t} />
                    <PriorityBadge priority={wo.priority} t={t} />
                  </div>
                </Td>
                <Td className="text-xs text-muted-foreground">{wo.promisedAt ? formatDate(wo.promisedAt, lang) : t.common.none}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
        </div>
        </>
      )}
    </div>
  );
}
