import { Card, CardTitle, PageHeader, Table, Td, Th } from "@/components/ui/field";
import { fmt, formatDateTime } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { requirePageAccess } from "@/lib/session";
import { cn } from "@/lib/utils";
import { STALE_HOURS, readBackupState } from "@/server/backups";
import { isHubLocal } from "@/server/hub";

const size = (b: number) => (b > 1_048_576 ? `${(b / 1_048_576).toFixed(1)} Mo` : `${Math.max(1, Math.round(b / 1024))} Ko`);

/** Administrator: state of the automatic backups made on the garage PC. */
export default async function BackupsPage() {
  await requirePageAccess("manageSettings");
  const [{ t, lang }, s] = await Promise.all([getI18n(), readBackupState()]);
  const b = t.v7.backups;
  const st = s.status;
  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
      <PageHeader title={b.title} />
      <p className="text-sm text-muted-foreground">{b.intro}</p>

      {!s.configured ? (
        <Card>
          <p className="text-sm">{isHubLocal() ? b.notYet : b.notHere}</p>
          <p className="mt-2 text-xs text-muted-foreground">{b.howTo}</p>
        </Card>
      ) : (
        <Card className={cn(s.problem && "border-red-500")}>
          <CardTitle>{b.state}</CardTitle>
          <ul className="space-y-1 text-sm">
            <li>
              {b.lastRun} : {st?.lastRun ? formatDateTime(st.lastRun, lang) : "—"}{" "}
              <strong className={st?.ok ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}>{st?.ok ? b.ok : b.failed}</strong>
            </li>
            {st?.error && <li className="text-red-600 dark:text-red-400">{st.error}</li>}
            <li>
              {b.lastSuccess} : {st?.lastSuccess ? formatDateTime(st.lastSuccess, lang) : "—"}
              {s.stale && <strong className="ms-2 text-red-600 dark:text-red-400">{fmt(b.stale, { h: STALE_HOURS })}</strong>}
            </li>
            <li>
              {b.verification} :{" "}
              <strong className={st?.verification === "restore" ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"}>
                {st?.verification === "restore" ? b.restoreTested : b.integrityOnly}
              </strong>
            </li>
            <li>
              {b.copies} : {st?.copies?.length ? st.copies.join(", ") : <span className="text-amber-700 dark:text-amber-400">{b.noCopy}</span>}
            </li>
            <li className="text-muted-foreground">
              {b.folder} : <span dir="ltr">{s.dir}</span> · {fmt(b.keep, { n: st?.keep ?? "—" })}
            </li>
          </ul>
        </Card>
      )}

      {s.manifests.length > 0 && (
        <Card className="p-0 sm:p-0">
          <Table>
            <thead>
              <tr>
                <Th>{b.file}</Th>
                <Th>{b.date}</Th>
                <Th className="text-end">{b.size}</Th>
                <Th className="text-end">{b.rows}</Th>
                <Th>{b.verification}</Th>
              </tr>
            </thead>
            <tbody>
              {s.manifests.map((m) => (
                <tr key={m.file}>
                  <Td className="font-mono text-xs">{m.file}</Td>
                  <Td className="text-xs">{formatDateTime(m.createdAt, lang)}</Td>
                  <Td className="text-end text-xs tabular-nums">{size(m.sizeEncrypted)}</Td>
                  <Td className="text-end text-xs tabular-nums">
                    {m.rows} ({m.tables} tables)
                  </Td>
                  <Td className="text-xs">{m.verification === "restore" ? b.restoreTested : b.integrityOnly}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
      <p className="text-xs text-muted-foreground">{b.procedure}</p>
    </div>
  );
}
