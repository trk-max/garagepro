import Link from "next/link";
import { createContractAction } from "@/actions/contracts";
import { ActionForm } from "@/components/action-form";
import { categoryLabel, ClauseChoices, ContractDateInputs, ContractFieldInputs, subtypeLabel } from "@/components/garage/contracts";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, Field, NativeSelect, PageHeader } from "@/components/ui/field";
import { utcToZoned } from "@/lib/booking";
import { CONTRACT_CATEGORIES, TEMPLATE_ID, withDefaults } from "@/lib/contracts";
import { fmt, woNumber } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { requirePageAccess } from "@/lib/session";
import { getTemplate, listTemplates, partyOptions } from "@/server/contracts";
import { getSettings } from "@/server/settings";

type PageProps = { searchParams: Promise<{ template?: string; workOrder?: string; customer?: string; supplier?: string; user?: string; category?: string }> };

const CUID = /^[a-z0-9]{20,40}$/;

/** New contract: choose a template (categories the viewer may create), then the parties and fields. */
export default async function NewContractPage({ searchParams }: PageProps) {
  const staff = await requirePageAccess("viewContracts");
  const sp = await searchParams;
  const pick = (v?: string) => (v && CUID.test(v) ? v : undefined);
  const workOrderId = pick(sp.workOrder);
  const customerId = pick(sp.customer);
  const supplierId = pick(sp.supplier);
  const userId = pick(sp.user);
  const [{ t }, settings] = await Promise.all([getI18n(), getSettings()]);
  const v = t.ctr;
  const carry = new URLSearchParams(Object.entries({ workOrder: workOrderId, customer: customerId, supplier: supplierId, user: userId }).filter((e): e is [string, string] => !!e[1]));

  const tpl = sp.template && TEMPLATE_ID.test(sp.template) ? await getTemplate(staff, sp.template) : null;
  if (!tpl) {
    const templates = await listTemplates(staff, { category: sp.category });
    return (
      <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
        <PageHeader title={v.new}>
          <Link href="/garage/contrats" className="text-sm underline-offset-4 hover:underline">
            {v.title}
          </Link>
        </PageHeader>
        <p className="text-sm text-muted-foreground">{v.chooseTemplate}</p>
        {CONTRACT_CATEGORIES.map((cat) => {
          const list = templates.filter((x) => x.category === cat);
          if (list.length === 0) return null;
          return (
            <Card key={cat}>
              <CardTitle>{categoryLabel(t, cat)}</CardTitle>
              <ul className="grid gap-2 sm:grid-cols-2">
                {list.map((x) => (
                  <li key={x.id}>
                    <Link href={`/garage/contrats/nouveau?template=${x.id}${carry.size ? `&${carry}` : ""}`} className="block border p-3 hover:bg-accent/40">
                      <span className="font-medium">{x.subtype ? subtypeLabel(t, x.subtype) : x.title}</span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {fmt(v.version, { n: x.version })} · {v.reviewState[x.reviewStatus as keyof typeof v.reviewState] ?? x.reviewStatus}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}
      </div>
    );
  }

  const opts = await partyOptions(staff, tpl.category, { customerId });
  const today = utcToZoned(new Date(), settings.timezone).date;
  // Template defaults only (French document text, e.g. CDI, job title and duties of the job template).
  const values = withDefaults(tpl.fields, {});

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
      <PageHeader title={`${v.new} — ${tpl.subtype ? subtypeLabel(t, tpl.subtype) : categoryLabel(t, tpl.category)}`}>
        <Link href={`/garage/contrats/nouveau${carry.size ? `?${carry}` : ""}`} className="text-sm underline-offset-4 hover:underline">
          {v.chooseTemplate}
        </Link>
      </PageHeader>
      <p className="border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
        <strong>{tpl.reviewStatus === "REVIEWED" ? v.reviewState.REVIEWED : v.legalNotReviewed}</strong> — {tpl.legalRefs.map((r) => r.ref).join(" ; ")} · {fmt(v.verifiedOn, { date: tpl.verifiedDay.split("-").reverse().join("/") })}
      </p>

      {tpl.category === "FLEET" && (
        <Card>
          <CardTitle>{v.companyCustomer}</CardTitle>
          <form action="/garage/contrats/nouveau" className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="template" value={tpl.id} />
            <NativeSelect name="customer" defaultValue={customerId ?? ""} aria-label={v.chooseCompany} className="w-auto min-w-64" required>
              <option value="">{v.chooseCompany}</option>
              {opts.companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </NativeSelect>
            <Button type="submit" variant="outline" size="sm">
              {v.filter}
            </Button>
          </form>
        </Card>
      )}

      <ActionForm action={createContractAction} reset={false} className="space-y-4">
        <input type="hidden" name="templateId" value={tpl.id} />
        <Card>
          <CardTitle>{v.parties}</CardTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            {tpl.category === "REPAIR" && (
              <Field label={v.workOrder}>
                <NativeSelect name="workOrderId" defaultValue={workOrderId ?? ""} required>
                  <option value="">{v.chooseWorkOrder}</option>
                  {opts.workOrders.map((w) => (
                    <option key={w.id} value={w.id}>
                      {woNumber(w.number)} · {w.vehicle.plate} · {w.customer.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            )}
            {tpl.category === "FLEET" && customerId && (
              <fieldset className="space-y-1 sm:col-span-2">
                <input type="hidden" name="customerId" value={customerId} />
                <legend className="text-sm font-medium">{v.vehicles}</legend>
                <p className="text-xs text-muted-foreground">{v.vehiclesHint}</p>
                {opts.vehicles.length === 0 && <p className="text-sm text-muted-foreground">{v.noVehicles}</p>}
                {opts.vehicles.map((x) => (
                  <label key={x.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="vehicleIds" value={x.id} defaultChecked className="size-4" />
                    <span className="font-mono">{x.plate}</span> {x.make} {x.model}
                  </label>
                ))}
              </fieldset>
            )}
            {tpl.category === "EMPLOYMENT" && (
              <Field label={v.chooseEmployee}>
                <NativeSelect name="userId" defaultValue={userId ?? ""}>
                  <option value="">{v.noneSelected}</option>
                  {opts.users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                      {u.jobTitle ? ` · ${u.jobTitle}` : ""}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            )}
            {(tpl.category === "SUPPLIER" || tpl.category === "BLANK") && (
              <Field label={v.supplier}>
                <NativeSelect name="supplierId" defaultValue={supplierId ?? ""} required={tpl.category === "SUPPLIER"}>
                  <option value="">{tpl.category === "SUPPLIER" ? v.chooseSupplier : v.noneSelected}</option>
                  {opts.suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            )}
            {tpl.category === "BLANK" && (
              <Field label={v.customer}>
                <NativeSelect name="customerId" defaultValue={customerId ?? ""}>
                  <option value="">{v.noneSelected}</option>
                  {opts.customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            )}
          </div>
        </Card>

        <Card>
          <CardTitle>{v.dates}</CardTitle>
          <ContractDateInputs category={tpl.category} startDay={today} t={t} />
        </Card>

        <Card>
          <CardTitle>{v.fieldsTitle}</CardTitle>
          <p className="mb-3 text-xs text-muted-foreground">{v.draftHint}</p>
          <ContractFieldInputs fields={tpl.fields} values={values} t={t} />
          <div className="mt-4">
            <ClauseChoices clauses={tpl.clauses} excluded={[]} t={t} />
          </div>
        </Card>

        <Button type="submit" disabled={tpl.category === "FLEET" && !customerId}>
          {v.create}
        </Button>
      </ActionForm>
    </div>
  );
}
