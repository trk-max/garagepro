import Link from "next/link";
import { redirect } from "next/navigation";
import { PlateChip, StatusBadge } from "@/components/garage/badges";
import { Card, CardTitle, Table, Td, Th } from "@/components/ui/field";
import { formatDate, formatDateTime, formatKm, formatMoney, woNumber } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { canSeeMoney, companyOverview, companyWorkOrders } from "@/server/company-portal";
import { getCompanyViewer } from "@/server/company-session";

/** Company portal home: this company's vehicles, repairs in progress, history. */
export default async function CompanyHome() {
  const viewer = await getCompanyViewer();
  if (!viewer) redirect("/entreprise/connexion");
  const [{ t, lang }, overview, history] = await Promise.all([getI18n(), companyOverview(viewer), companyWorkOrders(viewer)]);
  const c = t.v7.company;
  const money = canSeeMoney(viewer.role);
  return (
    <div className="space-y-6">
      <h1 className="f-display text-2xl">{overview.companyName}</h1>

      <Card>
        <CardTitle>{c.active}</CardTitle>
        {overview.active.length === 0 ? (
          <p className="text-sm text-muted-foreground">{c.none}</p>
        ) : (
          <ul className="divide-y">
            {overview.active.map((w) => (
              <li key={w.id} className="flex flex-wrap items-center gap-2 py-2.5 text-sm">
                <Link href={`/entreprise/ordres/${w.id}`} className="font-mono underline-offset-4 hover:underline">
                  {woNumber(w.number)}
                </Link>
                <PlateChip plate={w.vehicle.plate} />
                <span>
                  {w.vehicle.make} {w.vehicle.model}
                </span>
                <StatusBadge status={w.status} t={t} />
                {w.promisedAt && <span className="ms-auto text-xs text-muted-foreground">{formatDateTime(w.promisedAt, lang)}</span>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardTitle>
          {c.vehicles} ({overview.vehicles.length})
        </CardTitle>
        <Table>
          <thead>
            <tr>
              <Th>{t.workOrders.vehicle}</Th>
              <Th>{t.customers.mileage}</Th>
              <Th>{c.lastVisit}</Th>
            </tr>
          </thead>
          <tbody>
            {overview.vehicles.map((v) => (
              <tr key={v.id}>
                <Td>
                  <PlateChip plate={v.plate} /> {v.make} {v.model} {v.year ?? ""}
                </Td>
                <Td dir="ltr">{formatKm(v.mileage, lang)}</Td>
                <Td>
                  {v.workOrders[0] ? (
                    <Link href={`/entreprise/ordres/${v.workOrders[0].id}`} className="underline-offset-4 hover:underline">
                      {formatDate(v.workOrders[0].createdAt, lang)} · {t.status[v.workOrders[0].status]}
                    </Link>
                  ) : (
                    "—"
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <Card>
        <CardTitle>{c.history}</CardTitle>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">{c.none}</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>N°</Th>
                <Th>{t.workOrders.vehicle}</Th>
                <Th>{t.v7.leave.date}</Th>
                <Th>{t.workOrders.complaint}</Th>
                {money && <Th className="text-end">{c.invoice}</Th>}
              </tr>
            </thead>
            <tbody>
              {history.map((w) => (
                <tr key={w.id}>
                  <Td>
                    <Link href={`/entreprise/ordres/${w.id}`} className="font-mono underline-offset-4 hover:underline">
                      {woNumber(w.number)}
                    </Link>
                  </Td>
                  <Td>{w.vehicle.plate}</Td>
                  <Td>{formatDate(w.createdAt, lang)}</Td>
                  <Td className="max-w-xs truncate">{w.complaint}</Td>
                  {money && <Td className="text-end tabular-nums">{"invoice" in w && w.invoice ? formatMoney(w.invoice.totalTtc, lang) : "—"}</Td>}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
