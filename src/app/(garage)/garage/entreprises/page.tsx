import Link from "next/link";
import { Building2, Search } from "lucide-react";
import { Card, CardTitle, PageHeader } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { fmt, formatDateTime } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { prisma } from "@/lib/prisma";
import { requirePageAccess } from "@/lib/session";

type PageProps = { searchParams: Promise<{ q?: string }> };

/**
 * Company portal accounts in one place: companies that already have access,
 * and a search to give access to any other customer (the accounts themselves
 * are created on the customer's page, card "Accès portail entreprise").
 */
export default async function CompaniesPage({ searchParams }: PageProps) {
  await requirePageAccess("manageCompanyAccess");
  const { q: raw } = await searchParams;
  const q = raw?.trim().slice(0, 80) ?? "";
  const [{ t, lang }, companies, found] = await Promise.all([
    getI18n(),
    prisma.customer.findMany({
      where: { isCompany: true },
      orderBy: { name: "asc" },
      take: 300,
      select: {
        id: true,
        name: true,
        phone: true,
        _count: { select: { vehicles: true } },
        companyUsers: { orderBy: { createdAt: "asc" }, select: { id: true, name: true, email: true, isActive: true, lastLoginAt: true } },
      },
    }),
    q.length >= 2
      ? prisma.customer.findMany({
          where: { OR: [{ name: { contains: q, mode: "insensitive" } }, { phone: { contains: q.replace(/\s/g, "") } }, { taxId: { contains: q, mode: "insensitive" } }] },
          orderBy: { name: "asc" },
          take: 30,
          select: { id: true, name: true, phone: true, isCompany: true },
        })
      : Promise.resolve([]),
  ]);
  const c = t.v7.company;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <PageHeader title={t.v7.nav.companies} />
      <p className="text-sm text-muted-foreground">{c.companiesIntro}</p>

      <Card>
        <CardTitle>{c.addCompany}</CardTitle>
        <form method="get" className="flex flex-wrap items-center gap-2">
          <Input name="q" defaultValue={q} placeholder={c.searchCustomer} className="max-w-sm" minLength={2} maxLength={80} />
          <Button type="submit" variant="outline">
            <Search className="size-4" aria-hidden /> {t.common.search}
          </Button>
        </form>
        {q.length >= 2 && (
          <ul className="mt-4 divide-y text-sm">
            {found.length === 0 && <li className="py-2 text-muted-foreground">{c.noResult}</li>}
            {found.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center gap-3 py-2">
                <span className="font-medium">{f.name}</span>
                <span className="text-muted-foreground" dir="ltr">
                  {f.phone}
                </span>
                {f.isCompany && <span className="f-label border px-1.5 py-0.5 text-[0.625rem]">{c.portalTitle}</span>}
                <Link href={`/garage/customers/${f.id}#acces-entreprise`} className="ms-auto f-label border px-3 py-1.5 text-xs hover:border-foreground">
                  {f.isCompany ? c.manage : c.giveAccess}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {companies.length === 0 ? (
        <p className="border border-dashed p-10 text-center text-muted-foreground">{c.noCompanies}</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {companies.map((co) => (
            <Card key={co.id}>
              <div className="flex items-start gap-3">
                <Building2 className="mt-0.5 size-5 shrink-0" strokeWidth={1.5} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{co.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {fmt(c.accountsCount, { n: co.companyUsers.length })} · {fmt(c.vehiclesCount, { n: co._count.vehicles })}
                  </p>
                </div>
                <Link href={`/garage/customers/${co.id}#acces-entreprise`} className="f-label border px-3 py-1.5 text-xs hover:border-foreground">
                  {c.manage}
                </Link>
              </div>
              {co.companyUsers.length > 0 && (
                <ul className="mt-3 space-y-1 text-sm">
                  {co.companyUsers.map((u) => (
                    <li key={u.id} className={u.isActive ? "" : "text-muted-foreground line-through"}>
                      {u.name} <span className="text-xs text-muted-foreground" dir="ltr">{u.email}</span>
                      <span className="block text-xs text-muted-foreground">
                        {c.lastLogin} : {u.lastLoginAt ? formatDateTime(u.lastLoginAt, lang) : c.never}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
