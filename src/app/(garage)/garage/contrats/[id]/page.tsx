import Link from "next/link";
import { notFound } from "next/navigation";
import { FileDown } from "lucide-react";
import { moveContractAction, renewContractAction, terminateContractAction, updateContractAction } from "@/actions/contracts";
import { ActionButton, ActionForm } from "@/components/action-form";
import { InvoiceBadge, PlateChip } from "@/components/garage/badges";
import { ContractScanUpload } from "@/components/garage/contract-scan-upload";
import { categoryLabel, ClauseChoices, ContractDateInputs, ContractEnd, ContractFieldInputs, ContractStatusBadge, fieldLabel, subtypeLabel } from "@/components/garage/contracts";
import { ReasonButton } from "@/components/team/prompt-action";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, Field, PageHeader, Textarea } from "@/components/ui/field";
import { accessForMove, CONTRACT_TRANSITIONS, disguisedEmploymentSigns, type ContractStatus } from "@/lib/contracts";
import { fmt, formatDateTime, formatDay, formatMoney, woNumber } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { AppError } from "@/lib/http";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { requirePageAccess } from "@/lib/session";
import { contractDoc, getContract, partyOptions } from "@/server/contracts";

type PageProps = { params: Promise<{ id: string }> };

async function load(staff: Awaited<ReturnType<typeof requirePageAccess>>, id: string) {
  try {
    return await getContract(staff, id);
  } catch (e) {
    // A contract of a category the viewer may not see is answered like a missing one.
    if (e instanceof AppError && e.code === "forbidden") return null;
    throw e;
  }
}

export default async function ContractPage({ params }: PageProps) {
  const { id } = await params;
  const staff = await requirePageAccess("viewContracts");
  const [{ t, lang }, c] = await Promise.all([getI18n(), load(staff, id)]);
  if (!c) notFound();
  const v = t.ctr;
  const doc = contractDoc(c);
  const day = (d: string) => formatDay(d, lang, { day: "numeric", month: "long", year: "numeric" });
  const reviewer = c.template.reviewedById ? await prisma.user.findUnique({ where: { id: c.template.reviewedById }, select: { name: true } }) : null;
  const fleetVehicles = c.status === "DRAFT" && c.can.manage && c.category === "FLEET" && c.customerId ? (await partyOptions(staff, "FLEET", { customerId: c.customerId })).vehicles : [];
  const linked = new Set(c.vehicles.map((x) => x.vehicle.id));
  const signs = c.category === "SUPPLIER" ? disguisedEmploymentSigns(c.subtype, c.data.fields) : [];
  const status = c.status as ContractStatus;
  // Buttons for the moves this viewer may make (checked again on the server). SIGNED = scan upload only.
  const moves = (CONTRACT_TRANSITIONS[status] ?? []).filter((to) => to !== "SIGNED" && (accessForMove(to) === "approve" ? c.can.approve : c.can.manage));
  const canSeeInvoice = can(staff.role, "viewClientInvoices");
  const inv = c.workOrder?.invoice ?? null;

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
      <PageHeader title={c.title}>
        <ContractStatusBadge status={c.status} t={t} />
        <Link href="/garage/contrats" className="text-sm underline-offset-4 hover:underline">
          {v.title}
        </Link>
      </PageHeader>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm text-muted-foreground">{c.number}</span>
        <span className="text-sm text-muted-foreground">
          {categoryLabel(t, c.category)}
          {c.subtype ? ` · ${subtypeLabel(t, c.subtype)}` : ""}
        </span>
        <Button asChild variant="outline" size="sm" className="ms-auto">
          <a href={`/api/contracts/${c.id}/pdf`} target="_blank" rel="noopener">
            <FileDown className="size-4" aria-hidden /> {v.pdf}
          </a>
        </Button>
      </div>

      {/* Why a legal / HR review is needed — never "compliant". */}
      {c.liveFlags.length > 0 && (
        <ul className="space-y-1 border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          {c.liveFlags.map((f) => (
            <li key={f}>{v.flags[f]}</li>
          ))}
        </ul>
      )}
      {signs.length > 0 && (
        <div className="border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm">
          <p className="font-semibold">{v.disguisedTitle}</p>
          <p>{fmt(v.disguisedBody, { signs: signs.map((s) => v.disguisedSigns[s]).join(" ; ") })}</p>
        </div>
      )}
      {c.category === "EMPLOYMENT" && c.data.fields.employmentType === "CDD" && <p className="border border-amber-500/40 px-3 py-2 text-sm">{v.cddWarning}</p>}
      {c.status === "DRAFT" && c.missing.length > 0 && (
        <p className="text-sm text-amber-700 dark:text-amber-400">{fmt(v.missing, { fields: c.missing.map((k) => fieldLabel(t, k)).join(", ") })}</p>
      )}

      {moves.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {moves.map((to) =>
            to === "TERMINATED" ? (
              <ReasonButton key={to} question={v.terminateReason} action={terminateContractAction.bind(null, c.id)}>
                {v.moveTo.TERMINATED}
              </ReasonButton>
            ) : (
              <ActionButton
                key={to}
                variant={to === "DRAFT" || to === "ARCHIVED" ? "outline" : "default"}
                size="sm"
                action={moveContractAction.bind(null, c.id, to)}
                confirm={c.status === "LEGAL_REVIEW" && to === "APPROVED" ? v.confirmApproveLegal : undefined}
              >
                {v.moveTo[to]}
              </ActionButton>
            ),
          )}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardTitle>{v.links}</CardTitle>
          <dl className="space-y-2 text-sm">
            <div className="grid grid-cols-[9rem_1fr] gap-2">
              <dt className="text-muted-foreground">{v.start}</dt>
              <dd>{day(c.startDay)}</dd>
            </div>
            <div className="grid grid-cols-[9rem_1fr] gap-2">
              <dt className="text-muted-foreground">{v.end}</dt>
              <dd>
                <ContractEnd endDay={c.endDay} indefinite={c.indefinite} expiry={c.expiry} t={t} lang={lang} />
              </dd>
            </div>
            {c.customer && (
              <div className="grid grid-cols-[9rem_1fr] gap-2">
                <dt className="text-muted-foreground">{v.customer}</dt>
                <dd>
                  <Link href={`/garage/customers/${c.customer.id}`} className="underline-offset-4 hover:underline">
                    {c.customer.name}
                  </Link>
                </dd>
              </div>
            )}
            {c.vehicles.length > 0 && (
              <div className="grid grid-cols-[9rem_1fr] gap-2">
                <dt className="text-muted-foreground">{v.vehicles}</dt>
                <dd className="flex flex-wrap gap-2">
                  {c.vehicles.map((x) => (
                    <PlateChip key={x.vehicle.id} plate={x.vehicle.plate} />
                  ))}
                </dd>
              </div>
            )}
            {c.workOrder && (
              <div className="grid grid-cols-[9rem_1fr] gap-2">
                <dt className="text-muted-foreground">{v.workOrder}</dt>
                <dd>
                  <Link href={`/garage/work-orders/${c.workOrder.id}`} className="font-mono underline-offset-4 hover:underline">
                    {woNumber(c.workOrder.number)}
                  </Link>
                </dd>
              </div>
            )}
            {inv && canSeeInvoice && (
              <div className="grid grid-cols-[9rem_1fr] gap-2">
                <dt className="text-muted-foreground">{v.invoice}</dt>
                <dd className="flex flex-wrap items-center gap-2">
                  <Link href={`/garage/invoices/${inv.id}`} className="font-mono underline-offset-4 hover:underline">
                    {inv.number}
                  </Link>
                  <InvoiceBadge status={inv.status} t={t} />
                  <span className="text-xs text-muted-foreground">{fmt(v.paid, { paid: formatMoney(inv.paidAmount, lang), total: formatMoney(inv.totalTtc, lang) })}</span>
                </dd>
              </div>
            )}
            {c.supplier && (
              <div className="grid grid-cols-[9rem_1fr] gap-2">
                <dt className="text-muted-foreground">{v.supplier}</dt>
                <dd>{c.supplier.name}</dd>
              </div>
            )}
            {c.user && (
              <div className="grid grid-cols-[9rem_1fr] gap-2">
                <dt className="text-muted-foreground">{v.employee}</dt>
                <dd>
                  <Link href={`/garage/equipe/${c.user.id}`} className="underline-offset-4 hover:underline">
                    {c.user.name}
                  </Link>
                </dd>
              </div>
            )}
            {c.previous && (
              <div className="grid grid-cols-[9rem_1fr] gap-2">
                <dt className="text-muted-foreground">{v.renewTitle}</dt>
                <dd>
                  <Link href={`/garage/contrats/${c.previous.id}`} className="font-mono underline-offset-4 hover:underline">
                    {c.previous.number}
                  </Link>
                  {c.renewalBasis && <span className="block text-xs text-muted-foreground">{v.renewBasis} : {c.renewalBasis}</span>}
                </dd>
              </div>
            )}
            {c.renewals.length > 0 && (
              <div className="grid grid-cols-[9rem_1fr] gap-2">
                <dt className="text-muted-foreground">{v.renewedBy}</dt>
                <dd className="flex flex-wrap gap-2">
                  {c.renewals.map((r) => (
                    <Link key={r.id} href={`/garage/contrats/${r.id}`} className="font-mono underline-offset-4 hover:underline">
                      {r.number}
                    </Link>
                  ))}
                </dd>
              </div>
            )}
            {c.terminationReason && (
              <div className="grid grid-cols-[9rem_1fr] gap-2">
                <dt className="text-muted-foreground">{v.status.TERMINATED}</dt>
                <dd>{c.terminationReason}</dd>
              </div>
            )}
          </dl>
        </Card>

        <Card>
          <CardTitle>{v.scanTitle}</CardTitle>
          <p className="mb-3 text-xs text-muted-foreground">{v.scanHint}</p>
          {c.signedScanKey ? (
            <p className="mb-3 flex flex-wrap items-center gap-2 text-sm">
              <a href={`/api/contracts/${c.id}/scan`} target="_blank" rel="noopener" className="font-medium underline-offset-4 hover:underline">
                {v.scanOpen}
              </a>
              {c.signedAt && <span className="text-xs text-muted-foreground">{fmt(v.scanSigned, { date: formatDateTime(c.signedAt, lang) })}</span>}
            </p>
          ) : (
            <p className="mb-3 text-sm text-muted-foreground">{v.scanNone}</p>
          )}
          {c.can.manage && ["PENDING_SIGNATURE", "SIGNED", "ACTIVE"].includes(c.status) && <ContractScanUpload contractId={c.id} label={c.signedScanKey ? v.scanReplace : v.scanUpload} />}
        </Card>
      </div>

      {c.status === "DRAFT" && c.can.manage && (
        <Card>
          <CardTitle>{v.edit}</CardTitle>
          <ActionForm action={updateContractAction.bind(null, c.id)} reset={false} className="space-y-4">
            <ContractDateInputs category={c.category} startDay={c.startDay} endDay={c.durationMonths ? null : c.endDay} durationMonths={c.durationMonths} t={t} />
            {c.category === "FLEET" && (
              <fieldset className="space-y-1">
                <input type="hidden" name="vehiclesPosted" value="1" />
                <legend className="text-sm font-medium">{v.vehicles}</legend>
                {fleetVehicles.map((x) => (
                  <label key={x.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="vehicleIds" value={x.id} defaultChecked={linked.has(x.id)} className="size-4" />
                    <span className="font-mono">{x.plate}</span> {x.make} {x.model}
                  </label>
                ))}
              </fieldset>
            )}
            <ContractFieldInputs fields={c.template.fields} values={c.data.fields} t={t} />
            <ClauseChoices clauses={c.template.clauses} excluded={c.data.excluded} t={t} />
            <Button type="submit">{v.save}</Button>
          </ActionForm>
        </Card>
      )}

      {c.can.manage && ["SIGNED", "ACTIVE", "EXPIRED"].includes(c.status) && (
        <Card>
          <CardTitle>{v.renewTitle}</CardTitle>
          <p className="mb-3 text-xs text-muted-foreground">{v.renewHint}</p>
          <ActionForm action={renewContractAction.bind(null, c.id)} className="space-y-3">
            <ContractDateInputs category={c.category} startDay={c.endDay ?? c.today} durationMonths={c.durationMonths} t={t} />
            <Field label={v.renewBasis}>
              <Textarea name="basis" required minLength={3} maxLength={500} rows={2} placeholder={v.renewBasisPlaceholder} />
            </Field>
            <Button type="submit" variant="outline">
              {v.renew}
            </Button>
          </ActionForm>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardTitle>{v.legalTitle}</CardTitle>
          <p className="mb-2 text-sm font-medium">
            {c.template.reviewStatus === "REVIEWED" && c.template.reviewedAt
              ? fmt(v.legalReviewed, { date: formatDateTime(c.template.reviewedAt, lang), name: reviewer?.name ?? "—" })
              : v.legalNotReviewed}
          </p>
          <ul className="mb-2 list-disc space-y-1 ps-5 text-sm">
            {c.template.legalRefs.map((r) => (
              <li key={r.ref}>
                <span className="font-medium">{r.ref}</span> — {r.subject} <span className="text-xs text-muted-foreground">({v.confidence[r.confidence]})</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            {fmt(v.verifiedOn, { date: formatDay(c.template.verifiedDay, lang, { day: "numeric", month: "long", year: "numeric" }) })} · {fmt(v.version, { n: c.templateVersion })}
          </p>
          {c.template.reviewStatus !== "REVIEWED" && c.template.unverified.length > 0 && (
            <>
              <p className="mt-3 text-xs font-medium">{v.unverifiedTitle}</p>
              <ul className="list-disc ps-5 text-xs text-muted-foreground">
                {c.template.unverified.map((u) => (
                  <li key={u}>{u}</li>
                ))}
              </ul>
            </>
          )}
        </Card>

        <Card>
          <CardTitle>{v.history}</CardTitle>
          <ol className="space-y-2 text-sm">
            {c.events.map((e) => {
              const after = (e.after ?? {}) as { fields?: Record<string, unknown> };
              const changed = e.type === "UPDATED" && after.fields ? Object.keys(after.fields) : [];
              return (
                <li key={e.id} className="border-s-2 ps-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{v.event[e.type as keyof typeof v.event] ?? e.type}</span>
                    {e.fromStatus && e.toStatus && (
                      <span className="text-xs">
                        {v.status[e.fromStatus as ContractStatus] ?? e.fromStatus} → {v.status[e.toStatus as ContractStatus] ?? e.toStatus}
                      </span>
                    )}
                    <span className="ms-auto text-xs text-muted-foreground">
                      {e.actorName} · {formatDateTime(e.createdAt, lang)}
                    </span>
                  </div>
                  {changed.length > 0 && <p className="text-xs text-muted-foreground">{fmt(v.changedFields, { fields: changed.map((k) => fieldLabel(t, k)).join(", ") })}</p>}
                  {e.note && <p className="text-xs">{e.note}</p>}
                </li>
              );
            })}
          </ol>
        </Card>
      </div>

      <details className="border p-4">
        <summary className="cursor-pointer text-sm font-medium">{v.preview}</summary>
        <div lang="fr" dir="ltr" className="mt-3 space-y-3 text-sm">
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">{doc.legalNotice}</p>
          {doc.parties.map((p) => (
            <div key={p.label}>
              <p className="font-semibold">{p.label}</p>
              {p.lines.map((l) => (
                <p key={l}>{l}</p>
              ))}
            </div>
          ))}
          {doc.vehicles.map((x) => (
            <p key={x}>{x}</p>
          ))}
          {doc.clauses.map((cl, i) => (
            <div key={cl.title}>
              <p className="font-semibold">
                Article {i + 1} — {cl.title}
              </p>
              <p className="whitespace-pre-line">{cl.text}</p>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
