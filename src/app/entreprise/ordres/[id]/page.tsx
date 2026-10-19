import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Play } from "lucide-react";
import { PlateChip, StatusBadge } from "@/components/garage/badges";
import { Card, CardTitle, Table, Td, Th } from "@/components/ui/field";
import { formatDate, formatDateTime, formatKm, formatMoney, formatQty, lineTotalHt, woNumber } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { companyWorkOrder } from "@/server/company-portal";
import { getCompanyViewer } from "@/server/company-session";

type PageProps = { params: Promise<{ id: string }> };

/** One repair of the signed-in company (404 for any other company's repair). */
export default async function CompanyWorkOrderPage({ params }: PageProps) {
  const viewer = await getCompanyViewer();
  if (!viewer) redirect("/entreprise/connexion");
  const { id } = await params;
  const [{ t, lang }, wo] = await Promise.all([getI18n(), companyWorkOrder(viewer, id)]);
  if (!wo) notFound();
  const c = t.v7.company;
  const invoice = "invoice" in wo ? wo.invoice : null;
  return (
    <div className="space-y-6">
      <Link href="/entreprise" className="text-sm text-muted-foreground hover:text-foreground">
        ← {c.back}
      </Link>
      <header className="flex flex-wrap items-center gap-3">
        <span className="font-mono text-muted-foreground">{woNumber(wo.number)}</span>
        <PlateChip plate={wo.vehicle.plate} />
        <h1 className="text-xl font-semibold">
          {wo.vehicle.make} {wo.vehicle.model}
        </h1>
        <StatusBadge status={wo.status} t={t} />
      </header>
      <Card>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="label-tech">{t.workOrders.complaint}</dt>
            <dd>{wo.complaint}</dd>
          </div>
          {wo.diagnosis && (
            <div>
              <dt className="label-tech">{t.workOrders.diagnosis}</dt>
              <dd className="whitespace-pre-line">{wo.diagnosis}</dd>
            </div>
          )}
          <div>
            <dt className="label-tech">{t.customers.mileage}</dt>
            <dd dir="ltr">{formatKm(wo.mileageIn, lang)}</dd>
          </div>
          <div>
            <dt className="label-tech">{t.v7.leave.date}</dt>
            <dd>
              {formatDate(wo.createdAt, lang)}
              {wo.deliveredAt && ` → ${formatDate(wo.deliveredAt, lang)}`}
              {!wo.deliveredAt && wo.promisedAt && ` · ${formatDateTime(wo.promisedAt, lang)}`}
            </dd>
          </div>
        </dl>
      </Card>

      <Card>
        <CardTitle>{c.works}</CardTitle>
        <Table>
          <thead>
            <tr>
              <Th>{t.workOrders.lines}</Th>
              <Th className="text-end">Qté</Th>
              {invoice !== null || wo.lines.some((l) => "unitPrice" in l) ? <Th className="text-end">{c.amounts}</Th> : null}
            </tr>
          </thead>
          <tbody>
            {wo.lines.map((l) => (
              <tr key={l.id}>
                <Td>
                  {l.description} <span className="text-xs text-muted-foreground">({t.lineType[l.type]})</span>
                </Td>
                <Td className="text-end tabular-nums">{formatQty(l.quantityX100, lang)}</Td>
                {"unitPrice" in l && typeof l.unitPrice === "number" ? <Td className="text-end tabular-nums">{formatMoney(lineTotalHt({ quantityX100: l.quantityX100, unitPrice: l.unitPrice }), lang)}</Td> : null}
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      {invoice && (
        <Card>
          <CardTitle>
            {c.invoice} {invoice.number}
          </CardTitle>
          <dl className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <dt className="label-tech">TTC</dt>
              <dd className="tabular-nums">{formatMoney(invoice.totalTtc, lang)}</dd>
            </div>
            <div>
              <dt className="label-tech">{c.paid}</dt>
              <dd className="tabular-nums">{formatMoney(invoice.paidAmount, lang)}</dd>
            </div>
            <div>
              <dt className="label-tech">{c.due}</dt>
              <dd className="tabular-nums">{formatMoney(invoice.totalTtc - invoice.paidAmount, lang)}</dd>
            </div>
          </dl>
        </Card>
      )}

      {wo.media.length > 0 && (
        <Card>
          <CardTitle>{c.photos}</CardTitle>
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {wo.media.map((m) => (
              <li key={m.id} className="aspect-square overflow-hidden border bg-muted">
                <a href={`/api/media/${m.id}`} target="_blank" rel="noopener" className="block size-full">
                  {m.kind === "PHOTO" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/media/${m.id}`} alt={m.caption ?? ""} loading="lazy" className="size-full object-cover" />
                  ) : (
                    <span className="grid size-full place-items-center bg-black text-white">
                      <Play className="size-6" aria-hidden />
                    </span>
                  )}
                </a>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
