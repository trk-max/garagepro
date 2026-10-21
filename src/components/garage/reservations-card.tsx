import { releaseReservationAction, reservePartAction } from "@/actions/stock";
import { ActionForm } from "@/components/action-form";
import { ReasonButton } from "@/components/team/prompt-action";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, Field, NativeSelect } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { formatDateTime, formatQty, type Lang } from "@/lib/format";
import type { Dictionary } from "@/lib/i18n/fr";
import { can } from "@/lib/permissions";
import type { StaffUser } from "@/lib/session";
import { cn } from "@/lib/utils";
import { listReservations } from "@/server/parts";
import { prisma } from "@/lib/prisma";

/** Work order page: parts put aside for this repair (still on the shelf, no longer free for others). */
export async function ReservationsCard({ workOrderId, closed, staff, t, lang }: { workOrderId: string; closed: boolean; staff: StaffUser; t: Dictionary; lang: Lang }) {
  const canReserve = can(staff.role, "reserveStock");
  const [reservations, parts] = await Promise.all([
    listReservations(workOrderId),
    canReserve && !closed
      ? prisma.part.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, sku: true, name: true, unit: true, stockX100: true, reservedX100: true } })
      : [],
  ]);
  if (!canReserve && reservations.length === 0) return null;
  const v = t.v7.stock;
  return (
    <Card>
      <CardTitle>{v.reservationsTitle}</CardTitle>
      <p className="mb-3 text-xs text-muted-foreground">{v.reservationsIntro}</p>
      {reservations.length === 0 ? (
        <p className="mb-3 text-sm text-muted-foreground">{v.noReservations}</p>
      ) : (
        <ul className="mb-3 divide-y text-sm">
          {reservations.map((r) => (
            <li key={r.id} className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 py-2", r.status !== "ACTIVE" && "text-muted-foreground")}>
              <span className="font-mono text-xs">{r.part.sku}</span>
              <span className="font-medium">{r.part.name}</span>
              <span className="tabular-nums">
                {formatQty(r.quantityX100, lang)} {r.part.unit}
              </span>
              <span className="text-xs">{v.status[r.status as keyof typeof v.status] ?? r.status}</span>
              <span className="text-xs text-muted-foreground">{formatDateTime(r.createdAt, lang)}</span>
              {r.closedNote && <span className="w-full text-xs">({r.closedNote})</span>}
              {r.status === "ACTIVE" && canReserve && (
                <ReasonButton className="ms-auto h-6" question={v.releaseReason} action={releaseReservationAction.bind(null, r.id)}>
                  {v.release}
                </ReasonButton>
              )}
            </li>
          ))}
        </ul>
      )}
      {canReserve && !closed && (
        <ActionForm action={reservePartAction.bind(null, workOrderId)} className="grid gap-2 sm:grid-cols-[1fr_7rem_auto] sm:items-end">
          <Field label={v.part}>
            <NativeSelect name="partId" required defaultValue="">
              <option value="" disabled>
                —
              </option>
              {parts.map((p) => (
                <option key={p.id} value={p.id} disabled={p.stockX100 - p.reservedX100 <= 0}>
                  {p.sku} · {p.name} — {v.available} {formatQty(p.stockX100 - p.reservedX100, lang)} {p.unit}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label={v.quantity}>
            <Input name="quantity" inputMode="decimal" required defaultValue="1" dir="ltr" />
          </Field>
          <Button type="submit" variant="outline">
            {v.reserve}
          </Button>
        </ActionForm>
      )}
    </Card>
  );
}
