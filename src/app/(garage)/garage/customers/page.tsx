import Link from "next/link";
import { createCustomerAction } from "@/actions/catalog";
import { ActionForm } from "@/components/action-form";
import { PlateChip } from "@/components/garage/badges";
import { CustomerFields } from "@/components/garage/customer-fields";
import { SearchForm } from "@/components/garage/search-form";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, PageHeader, Table, Td, Th } from "@/components/ui/field";
import { getI18n } from "@/lib/i18n/server";
import { requirePageAccess } from "@/lib/session";
import { listCustomers } from "@/server/customers";

type PageProps = { searchParams: Promise<{ q?: string }> };

export default async function CustomersPage({ searchParams }: PageProps) {
  await requirePageAccess("viewCustomers");
  const { q } = await searchParams;
  const [{ t }, customers] = await Promise.all([getI18n(), listCustomers(q)]);

  return (
    <div className="mx-auto grid max-w-7xl gap-6 p-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div>
        <PageHeader title={t.customers.title}>
          <SearchForm placeholder={t.customers.searchPlaceholder} defaultValue={q} />
        </PageHeader>

        {customers.length === 0 ? (
          <p className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">{t.customers.empty}</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t.common.name}</Th>
                <Th>{t.common.phone}</Th>
                <Th>{t.customers.vehicles}</Th>
                <Th className="text-end">{t.customers.visits}</Th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id} className="hover:bg-accent/30">
                  <Td>
                    <Link href={`/garage/customers/${c.id}`} className="font-medium hover:underline">
                      {c.name}
                    </Link>
                  </Td>
                  <Td dir="ltr" className="text-start text-muted-foreground">
                    {c.phone}
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1.5">
                      {c.vehicles.map((v) => (
                        <span key={v.id} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                          <PlateChip plate={v.plate} /> {v.make} {v.model}
                        </span>
                      ))}
                    </div>
                  </Td>
                  <Td className="text-end tabular-nums">{c._count.workOrders}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>

      <Card className="h-fit">
        <CardTitle>{t.customers.new}</CardTitle>
        <ActionForm action={createCustomerAction} silent className="space-y-4">
          <CustomerFields t={t} />
          <Button type="submit" className="w-full">
            {t.common.create}
          </Button>
        </ActionForm>
      </Card>
    </div>
  );
}
