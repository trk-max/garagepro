import Link from "next/link";
import { createSupplierAction, updateSupplierAction } from "@/actions/purchasing";
import { ActionForm } from "@/components/action-form";
import { SearchForm } from "@/components/garage/search-form";
import { SupplierFields } from "@/components/garage/supplier-fields";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, PageHeader, Table, Td, Th } from "@/components/ui/field";
import { canContract } from "@/lib/contracts";
import { formatMoney } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { requirePageAccess } from "@/lib/session";
import { listSuppliers } from "@/server/purchasing";

type PageProps = { searchParams: Promise<{ q?: string }> };

export default async function SuppliersPage({ searchParams }: PageProps) {
  const staff = await requirePageAccess("viewSuppliers");
  const showContracts = canContract(staff.role, "SUPPLIER", "view");
  const { q } = await searchParams;
  const [{ t, lang }, suppliers] = await Promise.all([getI18n(), listSuppliers(q)]);

  return (
    <div className="mx-auto grid max-w-7xl gap-6 p-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-w-0">
        <PageHeader title={t.suppliers.title}>
          <SearchForm placeholder={t.suppliers.searchPlaceholder} defaultValue={q} />
        </PageHeader>
        {suppliers.length === 0 ? (
          <p className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">{t.suppliers.empty}</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t.common.name}</Th>
                <Th>{t.suppliers.contact}</Th>
                <Th className="text-end">{t.suppliers.orders}</Th>
                <Th className="text-end">{t.suppliers.balance}</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s.id} className="align-top">
                  <Td>
                    <div className="font-medium">{s.name}</div>
                    {s.taxId && <div className="font-mono text-xs text-muted-foreground" dir="ltr">{s.taxId}</div>}
                    {/* V9: supplier / partner contracts (administrator, manager; accountant reads). */}
                    {showContracts && (
                      <Link href={`/garage/contrats?c=SUPPLIER&supplier=${s.id}`} className="text-xs text-primary hover:underline">
                        {t.ctr.nav}
                      </Link>
                    )}
                  </Td>
                  <Td className="text-muted-foreground">
                    {s.contact && <div>{s.contact}</div>}
                    {s.phone && <div dir="ltr">{s.phone}</div>}
                    {s.email && <div dir="ltr">{s.email}</div>}
                  </Td>
                  <Td className="text-end tabular-nums">
                    <Link href={`/garage/purchase-orders?supplier=${s.id}`} className="hover:underline">
                      {s._count.purchaseOrders}
                    </Link>
                  </Td>
                  <Td className="text-end tabular-nums" dir="ltr">
                    <Link href={`/garage/supplier-invoices?supplier=${s.id}&filter=unpaid`} className={s.balance ? "font-medium text-amber-700 dark:text-amber-400 hover:underline" : "text-muted-foreground"}>
                      {formatMoney(s.balance, lang)}
                    </Link>
                  </Td>
                  <Td className="w-64">
                    <details>
                      <summary className="cursor-pointer text-xs text-primary">{t.common.edit}</summary>
                      <ActionForm action={updateSupplierAction.bind(null, s.id)} reset={false} className="mt-2 space-y-2">
                        <SupplierFields t={t} defaults={s} />
                        <Button type="submit" size="sm" className="w-full">
                          {t.common.save}
                        </Button>
                      </ActionForm>
                    </details>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>

      <Card className="h-fit">
        <CardTitle>{t.suppliers.new}</CardTitle>
        <ActionForm action={createSupplierAction} className="space-y-4">
          <SupplierFields t={t} />
          <Button type="submit" className="w-full">
            {t.common.create}
          </Button>
        </ActionForm>
      </Card>
    </div>
  );
}
