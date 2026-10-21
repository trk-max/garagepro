import Link from "next/link";
import { contractAlertDaysAction } from "@/actions/contracts";
import { ActionForm } from "@/components/action-form";
import { categoryLabel, ContractEnd, ContractStatusBadge, subtypeLabel } from "@/components/garage/contracts";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, Field, NativeSelect, PageHeader, Table, Td, Th } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { CONTRACT_ALERT_LIMITS, CONTRACT_STATUSES, contractCategoriesFor, isContractCategory, isContractStatus } from "@/lib/contracts";
import { fmt, formatDay } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { can } from "@/lib/permissions";
import { requirePageAccess } from "@/lib/session";
import { cn } from "@/lib/utils";
import { contractExpiryAlerts, listContracts } from "@/server/contracts";
import { getSettings } from "@/server/settings";

type PageProps = { searchParams: Promise<{ c?: string; s?: string; e?: string }> };

/** Contracts the viewer may see (by category), with filters and the ones ending soon. */
export default async function ContractsPage({ searchParams }: PageProps) {
  const staff = await requirePageAccess("viewContracts");
  const sp = await searchParams;
  const visible = contractCategoriesFor(staff.role, "view");
  const category = isContractCategory(sp.c) && visible.includes(sp.c) ? sp.c : undefined;
  const status = isContractStatus(sp.s) ? sp.s : undefined;
  const expiring = sp.e === "1";
  const [{ t, lang }, rows, soon, settings] = await Promise.all([
    getI18n(),
    listContracts(staff, { category, status, expiring }),
    contractExpiryAlerts(staff.role),
    getSettings(),
  ]);
  const v = t.ctr;
  const canCreate = contractCategoriesFor(staff.role, "manage").length > 0;
  const qs = (o: { c?: string; s?: string; e?: string }) => {
    const p = new URLSearchParams();
    const c = "c" in o ? o.c : category;
    const s = "s" in o ? o.s : status;
    const e = "e" in o ? o.e : expiring ? "1" : undefined;
    if (c) p.set("c", c);
    if (s) p.set("s", s);
    if (e) p.set("e", e);
    const q = p.toString();
    return `/garage/contrats${q ? `?${q}` : ""}`;
  };
  const tab = (active: boolean) => cn("f-label border px-3 py-2", active ? "border-foreground text-foreground" : "border-border text-muted-foreground hover:text-foreground");

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
      <PageHeader title={v.title}>
        {can(staff.role, "reviewContractTemplates") && (
          <Link href="/garage/contrats/modeles" className="text-sm underline-offset-4 hover:underline">
            {v.templates}
          </Link>
        )}
        {canCreate && (
          <Button asChild>
            <Link href="/garage/contrats/nouveau">{v.new}</Link>
          </Button>
        )}
      </PageHeader>
      <p className="text-sm text-muted-foreground">{v.intro}</p>
      {!visible.includes("EMPLOYMENT") && <p className="text-xs text-muted-foreground">{v.employmentRestricted}</p>}

      {soon.length > 0 && (
        <Card className="border-amber-500/40">
          <CardTitle>{fmt(v.expiringTitle, { n: settings.contractAlertDays })}</CardTitle>
          <ul className="divide-y text-sm">
            {soon.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2 py-2">
                <Link href={`/garage/contrats/${c.id}`} className="font-mono text-xs underline-offset-4 hover:underline">
                  {c.number}
                </Link>
                <span className="min-w-0 flex-1 truncate">{c.title}</span>
                <ContractEnd endDay={c.endDay} indefinite={false} expiry={c.expiry} t={t} lang={lang} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <nav className="flex flex-wrap gap-1" aria-label={v.title}>
        <Link href={qs({ c: undefined })} aria-current={!category ? "page" : undefined} className={tab(!category)}>
          {v.all}
        </Link>
        {visible.map((c) => (
          <Link key={c} href={qs({ c })} aria-current={c === category ? "page" : undefined} className={tab(c === category)}>
            {categoryLabel(t, c)}
          </Link>
        ))}
        <Link href={qs({ e: expiring ? undefined : "1" })} aria-current={expiring ? "page" : undefined} className={tab(expiring)}>
          {v.expiring}
        </Link>
      </nav>
      <form className="flex flex-wrap items-end gap-2" action="/garage/contrats">
        {category && <input type="hidden" name="c" value={category} />}
        {expiring && <input type="hidden" name="e" value="1" />}
        <NativeSelect name="s" defaultValue={status ?? ""} aria-label={v.anyStatus} className="w-auto">
          <option value="">{v.anyStatus}</option>
          {CONTRACT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {v.status[s]}
            </option>
          ))}
        </NativeSelect>
        <Button type="submit" variant="outline" size="sm">
          {v.filter}
        </Button>
      </form>

      {rows.length === 0 ? (
        <p className="border border-dashed p-10 text-center text-sm text-muted-foreground">{v.none}</p>
      ) : (
        <Card className="p-0 sm:p-0">
          <Table>
            <thead>
              <tr>
                <Th>{v.number}</Th>
                <Th>{v.contract}</Th>
                <Th>{v.party}</Th>
                <Th>{v.start}</Th>
                <Th>{v.end}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="hover:bg-accent/30">
                  <Td>
                    <Link href={`/garage/contrats/${c.id}`} className="font-mono text-xs underline-offset-4 hover:underline">
                      {c.number}
                    </Link>
                    <div className="mt-1">
                      <ContractStatusBadge status={c.status} t={t} />
                    </div>
                  </Td>
                  <Td>
                    <Link href={`/garage/contrats/${c.id}`} className="font-medium underline-offset-4 hover:underline">
                      {c.title}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {categoryLabel(t, c.category)}
                      {c.subtype ? ` · ${subtypeLabel(t, c.subtype)}` : ""}
                      {c.vehicles.length > 0 && ` · ${c.vehicles.map((x) => x.vehicle.plate).join(", ")}`}
                    </div>
                  </Td>
                  <Td className="text-sm">{c.customer?.name ?? c.supplier?.name ?? c.user?.name ?? "—"}</Td>
                  <Td className="text-xs">{formatDay(c.startDay, lang, { day: "numeric", month: "short", year: "numeric" })}</Td>
                  <Td>
                    <ContractEnd endDay={c.endDay} indefinite={c.indefinite} expiry={c.expiry} t={t} lang={lang} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      {can(staff.role, "manageSettings") && (
        <Card>
          <CardTitle>{v.alertDays}</CardTitle>
          <ActionForm action={contractAlertDaysAction} reset={false} className="flex flex-wrap items-end gap-3">
            <Field label={v.alertDays} hint={v.alertDaysHint}>
              <Input name="contractAlertDays" type="number" min={CONTRACT_ALERT_LIMITS.min} max={CONTRACT_ALERT_LIMITS.max} defaultValue={settings.contractAlertDays} required className="w-28" dir="ltr" />
            </Field>
            <Button type="submit" variant="outline">
              {v.saveSetting}
            </Button>
          </ActionForm>
        </Card>
      )}
    </div>
  );
}
