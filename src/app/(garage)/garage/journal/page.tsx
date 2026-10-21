import Link from "next/link";
import { Card, PageHeader, Table, Td, Th } from "@/components/ui/field";
import { formatDateTime } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { requirePageAccess } from "@/lib/session";
import { listAudit } from "@/server/audit";
import { getSettings } from "@/server/settings";
import { cn } from "@/lib/utils";

type PageProps = { searchParams: Promise<{ before?: string; entity?: string }> };

const short = (v: unknown) => {
  if (v === null || v === undefined) return "";
  const s = JSON.stringify(v);
  return s.length > 220 ? `${s.slice(0, 220)}…` : s;
};

/** Administrator: read-only audit journal. */
export default async function AuditPage({ searchParams }: PageProps) {
  await requirePageAccess("viewAuditLog");
  const sp = await searchParams;
  const before = sp.before && !Number.isNaN(Date.parse(sp.before)) ? new Date(sp.before) : undefined;
  const entity = sp.entity && /^[A-Za-z]{2,40}$/.test(sp.entity) ? sp.entity : undefined;
  const [{ t, lang }, rows, settings] = await Promise.all([getI18n(), listAudit({ before, entity, take: 100 }), getSettings()]);
  const a = t.v7.audit;
  const label = (e: string) => (a.entities as Record<string, string>)[e] ?? e;
  const chip = (active: boolean) => cn("f-label border px-3 py-1.5 text-xs hover:border-foreground", active && "border-foreground bg-foreground text-background");
  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 sm:p-6">
      <PageHeader title={a.title} />
      <p className="text-sm text-muted-foreground">{a.intro}</p>
      <nav className="flex flex-wrap gap-2">
        <Link href="/garage/journal" className={chip(!entity)}>
          {a.all}
        </Link>
        {Object.keys(a.entities).map((e) => (
          <Link key={e} href={`/garage/journal?entity=${e}`} className={chip(entity === e)}>
            {label(e)}
          </Link>
        ))}
      </nav>
      <Card className="p-0 sm:p-0">
        {rows.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">{a.none}</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{a.when}</Th>
                <Th>{a.who}</Th>
                <Th>{a.what}</Th>
                <Th>{a.item}</Th>
                <Th>{a.details}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <Td className="whitespace-nowrap tabular-nums">{formatDateTime(r.createdAt, lang, settings.timezone)}</Td>
                  <Td>{r.actorName}</Td>
                  <Td className="font-mono text-xs">{r.action}</Td>
                  <Td className="text-xs">
                    <Link href={`/garage/journal?entity=${r.entity}`} className="underline-offset-4 hover:underline">
                      {label(r.entity)}
                    </Link>
                    {r.entityId ? <span className="block font-mono text-muted-foreground">{r.entityId.slice(0, 12)}</span> : null}
                  </Td>
                  <Td className="max-w-md font-mono text-[11px] break-all text-muted-foreground">
                    {r.before ? <span className="block">− {short(r.before)}</span> : null}
                    {r.after ? <span className="block text-foreground">+ {short(r.after)}</span> : null}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      {rows.length === 100 && (
        <Link href={`/garage/journal?before=${rows.at(-1)!.createdAt.toISOString()}${entity ? `&entity=${entity}` : ""}`} className="f-label inline-block border px-3 py-2 hover:border-foreground">
          {a.more} →
        </Link>
      )}
    </div>
  );
}
