import Link from "next/link";
import { ChevronRight, Plus, Users } from "lucide-react";
import { createCustomerAction } from "@/actions/catalog";
import { ActionForm } from "@/components/action-form";
import { CustomerCard } from "@/components/customers/customer-card";
import { QuickActions } from "@/components/customers/quick-actions";
import { CustomerFields } from "@/components/garage/customer-fields";
import { SearchForm } from "@/components/garage/search-form";
import { LiveRefresh } from "@/components/live-refresh";
import { Button } from "@/components/ui/button";
import { DialogButton } from "@/components/ui/redesign/dialog";
import { PageHeader } from "@/components/ui/redesign/page-header";
import { EmptyState, PillLink } from "@/components/ui/redesign/surface";
import { getI18n } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { requirePageAccess } from "@/lib/session";
import { cn } from "@/lib/utils";
import { oldestUnpaidInvoice } from "@/server/customer-quick";
import { customerCards, recentCustomers, type CustomerTab } from "@/server/dashboard-v10-customers";

type PageProps = { searchParams: Promise<{ q?: string; tab?: string; sel?: string; cursor?: string }> };
const TABS: CustomerTab[] = ["all", "favourites", "companies"];
const CREATE = "new-customer";

export default async function CustomersPage({ searchParams }: PageProps) {
  const staff = await requirePageAccess("viewCustomers");
  const sp = await searchParams;
  const tab: CustomerTab = TABS.includes(sp.tab as CustomerTab) ? (sp.tab as CustomerTab) : "all";
  const q = sp.q?.trim() || undefined;
  const [{ t, lang }, recent, page] = await Promise.all([getI18n(), recentCustomers(5), customerCards({ tab, q, take: 20, cursor: sp.cursor ?? null })]);
  const selected = recent.find((c) => c.id === sp.sel) ?? recent[0] ?? null;
  const canSeeInvoices = can(staff.role, "viewClientInvoices");
  const unpaid = selected && canSeeInvoices ? await oldestUnpaidInvoice(selected.id) : null;
  const p = t.v10.pages.customers;

  // Every link keeps the other parameters (tab, search, selection).
  const href = (patch: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries({ tab: tab === "all" ? undefined : tab, q, sel: sp.sel, ...patch })) if (v) params.set(k, v);
    const s = params.toString();
    return s ? `/garage/customers?${s}` : "/garage/customers";
  };

  return (
    <div className="mx-auto max-w-[1440px] px-3 pt-4 pb-6 sm:px-5 xl:ps-2 xl:pe-5">
      <PageHeader title={t.customers.title} subtitle={p.subtitle}>
        <LiveRefresh url="/api/staff/live?topic=customers" liveLabel={t.portal.live} reconnectingLabel={t.portal.reconnecting} />
        <DialogButton id={CREATE} label={p.add} title={t.customers.new} closeLabel={t.v10.shell.close} icon={<Plus className="size-4" aria-hidden />}>
          <ActionForm action={createCustomerAction} silent className="space-y-4">
            <CustomerFields t={t} />
            <Button type="submit" className="w-full">
              {t.common.create}
            </Button>
          </ActionForm>
        </DialogButton>
      </PageHeader>

      <div className="gp-stagger space-y-5">
        <QuickActions
          t={t}
          recent={recent}
          selected={selected}
          hrefFor={(id) => href({ sel: id, cursor: undefined })}
          createDialogId={CREATE}
          canCreateOrder={can(staff.role, "viewWorkOrders")}
          unpaid={unpaid}
          canSeeInvoices={canSeeInvoices}
        />

        <div className="flex flex-wrap items-center gap-3">
          <nav aria-label={t.customers.title} className="flex rounded-full border border-gp-line bg-gp-card p-1 shadow-gp">
            {TABS.map((k) => (
              <Link
                key={k}
                href={href({ tab: k === "all" ? undefined : k, cursor: undefined })}
                aria-current={tab === k ? "page" : undefined}
                className={cn("gp-pill-t flex h-10 items-center rounded-full px-4 text-sm font-medium", tab === k ? "bg-gp-primary text-gp-primary-ink" : "hover:bg-gp-hover")}
              >
                {p.tabs[k]}
              </Link>
            ))}
          </nav>
          <div className="ms-auto w-full sm:w-80 [&_form]:max-w-none [&_input]:h-11 [&_input]:bg-gp-card [&_input]:ps-9">
            <SearchForm placeholder={t.customers.searchPlaceholder} defaultValue={q} hidden={{ tab: tab === "all" ? undefined : tab, sel: sp.sel }} />
          </div>
        </div>

        {page.items.length === 0 ? (
          <EmptyState icon={Users} title={t.customers.empty} />
        ) : (
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
            {page.items.map((c) => (
              <CustomerCard key={c.id} c={c} t={t} lang={lang} />
            ))}
          </ul>
        )}

        {(sp.cursor || page.nextCursor) && (
          <nav className="flex justify-center gap-2" aria-label={t.customers.title}>
            {sp.cursor && (
              <PillLink href={href({ cursor: undefined })} variant="outline">
                {p.first}
              </PillLink>
            )}
            {page.nextCursor && (
              <PillLink href={href({ cursor: page.nextCursor })} variant="primary" icon={ChevronRight}>
                {p.next}
              </PillLink>
            )}
          </nav>
        )}
      </div>
    </div>
  );
}
