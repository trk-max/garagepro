import Link from "next/link";
import {
  CheckCircle2,
  FileSignature,
  Printer,
  ShieldCheck,
  Warehouse,
} from "lucide-react";
import {
  readyNoticeAction,
  recordHandoverAction,
  signIntakeAction,
  waiveStorageFeeAction,
} from "@/actions/lot4";
import { ActionButton, ActionForm } from "@/components/action-form";
import { SignaturePad } from "@/components/garage/signature-pad";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardTitle,
  Field,
  NativeSelect,
  Textarea,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { fmt, formatDateTime, formatMoney, type Lang } from "@/lib/format";
import { OLD_PARTS, type HandoverChecklist } from "@/lib/handover";
import type { Dictionary } from "@/lib/i18n/fr";
import { FUEL_LEVELS } from "@/lib/repair-order";

/**
 * V16 Lot 4 — cards of the order page: intake signature (frozen document), vehicle handover (bon de restitution
 * signed on the tablet) and storage fee (gardiennage) before invoicing.
 */

type Sig = {
  id: string;
  signerName: string;
  signedAt: Date;
  documentHash: string;
  documentKey: string | null;
};

function Fingerprint({
  sig,
  intact,
  t,
}: {
  sig: Sig;
  intact: boolean | null;
  t: Dictionary;
}) {
  const s = t.v16.lot4.signature;
  return (
    <p className="text-xs text-muted-foreground" dir="ltr">
      {s.fingerprint}{" "}
      <span className="font-mono">{sig.documentHash.slice(0, 16)}…</span>{" "}
      {intact !== null && (
        <span
          className={
            intact ? "text-gp-success-ink" : "font-medium text-gp-danger-ink"
          }
        >
          ({intact ? s.intact : s.altered})
        </span>
      )}
    </p>
  );
}

export function IntakeSignatureCard({
  workOrderId,
  signature,
  intact,
  signerDefault,
  canSign,
  final,
  t,
  lang,
}: {
  workOrderId: string;
  signature: Sig | null;
  intact: boolean | null;
  signerDefault: string;
  canSign: boolean;
  final: boolean;
  t: Dictionary;
  lang: Lang;
}) {
  const s = t.v16.lot4.signature;
  return (
    <Card>
      <CardTitle className="flex items-center gap-2">
        <FileSignature className="size-4" aria-hidden /> {s.intakeTitle}
      </CardTitle>
      {signature ? (
        <div className="space-y-2 text-sm" data-testid="intake-signed">
          <p className="flex items-center gap-2 rounded-[14px] bg-gp-success-bg px-3 py-2 text-gp-success-ink">
            <CheckCircle2 className="size-4" aria-hidden />{" "}
            {fmt(s.intakeSigned, {
              name: signature.signerName,
              date: formatDateTime(signature.signedAt, lang),
            })}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/signatures/${signature.id}/image`}
              alt={s.image}
              className="h-16 rounded-md border border-gp-line bg-white"
            />
            {signature.documentKey && (
              <Button asChild variant="outline" size="sm">
                <a
                  href={`/api/signatures/${signature.id}/document`}
                  target="_blank"
                  rel="noopener"
                >
                  <ShieldCheck className="size-4" aria-hidden /> {s.document}
                </a>
              </Button>
            )}
          </div>
          <Fingerprint sig={signature} intact={intact} t={t} />
        </div>
      ) : (
        <div className="space-y-3" data-testid="intake-sign">
          <p className="text-xs text-muted-foreground">{s.intakeHint}</p>
          {final ? (
            <p className="text-sm text-muted-foreground">{s.notSigned}</p>
          ) : canSign ? (
            <ActionForm
              action={signIntakeAction.bind(null, workOrderId)}
              reset={false}
              className="grid gap-3"
            >
              <Field label={s.signerName}>
                <Input
                  name="signerName"
                  required
                  minLength={2}
                  maxLength={120}
                  defaultValue={signerDefault}
                />
              </Field>
              <SignaturePad required />
              <div>
                <Button type="submit">{s.submit}</Button>
              </div>
            </ActionForm>
          ) : (
            <p className="text-sm text-muted-foreground">{s.noPermission}</p>
          )}
        </div>
      )}
    </Card>
  );
}

type HandoverRow = {
  id: string;
  createdAt: Date;
  mileageOut: number;
  fuelLevelOut: number | null;
  checklist: HandoverChecklist;
  notes: string | null;
  by: string | null;
  signature: {
    id: string;
    signerName: string;
    signedAt: Date;
    documentHash: string;
    documentKey: string | null;
  } | null;
};

export function HandoverCard({
  workOrderId,
  ready,
  required,
  handovers,
  canRecord,
  defaults,
  t,
  lang,
}: {
  workOrderId: string;
  ready: boolean;
  required: boolean;
  handovers: HandoverRow[];
  canRecord: boolean;
  defaults: {
    mileage: number | null;
    fuelLevel: number | null;
    signer: string;
  };
  t: Dictionary;
  lang: Lang;
}) {
  const h = t.v16.lot4.handover;
  const s = t.v16.lot4.signature;
  return (
    <Card>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <CardTitle className="mb-0">{h.title}</CardTitle>
        {handovers.length > 0 && (
          <Button asChild variant="outline" size="sm" className="ms-auto">
            <Link
              href={`/garage/work-orders/${workOrderId}/restitution`}
              target="_blank"
            >
              <Printer className="size-4" aria-hidden /> {h.print}
            </Link>
          </Button>
        )}
      </div>
      <p className="mb-3 text-xs text-muted-foreground">{h.intro}</p>
      {handovers.length > 0 && (
        <ul className="mb-3 space-y-2 text-sm" data-testid="handovers">
          {handovers.map((r) => (
            <li
              key={r.id}
              className="rounded-[14px] border border-gp-line px-3 py-2"
            >
              <p className="font-medium">
                {fmt(h.done, {
                  date: formatDateTime(r.createdAt, lang),
                  name: r.signature?.signerName ?? "—",
                })}
              </p>
              <p className="text-xs text-muted-foreground">
                {fmt(h.km, { km: r.mileageOut })}
                {r.fuelLevelOut ? ` · ${r.fuelLevelOut}/4` : ""} ·{" "}
                {h.oldPartsOptions[r.checklist.oldParts]}
                {r.by ? ` · ${fmt(h.by, { name: r.by })}` : ""}
              </p>
              {r.signature && (
                <Fingerprint sig={r.signature} intact={null} t={t} />
              )}
            </li>
          ))}
        </ul>
      )}
      {!ready ? (
        handovers.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {required ? h.required : h.none}
          </p>
        )
      ) : canRecord ? (
        <div data-testid="handover-form">
          <ActionForm
            action={recordHandoverAction.bind(null, workOrderId)}
            reset={false}
            className="grid gap-3 sm:grid-cols-2"
          >
            <Field label={h.mileageOut}>
              <Input
                name="mileageOut"
                type="number"
                min={defaults.mileage ?? 0}
                max={10_000_000}
                required
                dir="ltr"
                defaultValue={defaults.mileage ?? ""}
              />
            </Field>
            <Field label={h.fuelOut}>
              <NativeSelect
                name="fuelLevelOut"
                defaultValue={
                  defaults.fuelLevel ? String(defaults.fuelLevel) : ""
                }
              >
                <option value="">{h.fuelUnknown}</option>
                {FUEL_LEVELS.map((q) => (
                  <option key={q} value={q}>
                    {q}/4
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label={h.oldParts}>
              <NativeSelect name="oldParts" defaultValue="RETURNED">
                {OLD_PARTS.map((o) => (
                  <option key={o} value={o}>
                    {h.oldPartsOptions[o]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <div className="grid gap-1 text-sm">
              {(["workExplained", "keysReturned", "clean"] as const).map(
                (k) => (
                  <label key={k} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      name={k}
                      defaultChecked
                      className="size-4"
                    />{" "}
                    {h[k]}
                  </label>
                ),
              )}
            </div>
            <Field label={h.notes} className="sm:col-span-2">
              <Textarea name="notes" rows={2} maxLength={1000} />
            </Field>
            <Field label={s.signerName} className="sm:col-span-2">
              <Input
                name="signerName"
                required
                minLength={2}
                maxLength={120}
                defaultValue={defaults.signer}
              />
            </Field>
            <div className="sm:col-span-2">
              <SignaturePad required />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit">{h.submit}</Button>
            </div>
          </ActionForm>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{s.noPermission}</p>
      )}
    </Card>
  );
}

export type StorageFeeView = {
  reason: "notReady" | "notNotified" | "inGrace" | "due";
  days: number;
  amount: number;
  start: Date | null;
  feePerDay: number;
  graceHours: number;
  auto: boolean;
  waived: { reason: string; at: Date } | null;
};

export function StorageFeeCard({
  workOrderId,
  fee,
  notices,
  canWaive,
  canNotify,
  t,
  lang,
}: {
  workOrderId: string;
  fee: StorageFeeView;
  notices: Date[];
  canWaive: boolean;
  canNotify: boolean;
  t: Dictionary;
  lang: Lang;
}) {
  const g = t.v16.lot4.storage;
  return (
    <Card>
      <CardTitle className="flex items-center gap-2">
        <Warehouse className="size-4" aria-hidden /> {g.title}
      </CardTitle>
      <div className="space-y-2 text-sm" data-testid="storage-fee">
        {fee.waived ? (
          <p>
            {fmt(g.waived, {
              reason: fee.waived.reason,
              date: formatDateTime(fee.waived.at, lang),
            })}
          </p>
        ) : fee.reason === "due" ? (
          <>
            <p className="font-medium" dir="auto">
              {fmt(g.due, {
                days: fee.days,
                fee: formatMoney(fee.feePerDay, lang),
                amount: formatMoney(fee.amount, lang),
              })}
            </p>
            {fee.start && (
              <p className="text-xs text-muted-foreground">
                {fmt(g.since, {
                  date: formatDateTime(fee.start, lang),
                  hours: fee.graceHours,
                })}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              {fee.auto ? g.auto : g.off}
            </p>
          </>
        ) : fee.reason === "notNotified" ? (
          <p className="text-muted-foreground">{g.notNotified}</p>
        ) : fee.reason === "inGrace" ? (
          <p className="text-muted-foreground">
            {fmt(g.inGrace, { hours: fee.graceHours })}
          </p>
        ) : (
          <p className="text-muted-foreground">{g.none}</p>
        )}
        {notices.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {fmt(g.notified, { date: formatDateTime(notices[0]!, lang) })}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {canNotify && notices.length === 0 && (
            <ActionButton
              size="sm"
              variant="outline"
              action={readyNoticeAction.bind(null, workOrderId)}
            >
              {g.notify}
            </ActionButton>
          )}
        </div>
        {canWaive && !fee.waived && fee.reason === "due" && (
          <details className="rounded-[14px] border border-gp-line p-3">
            <summary className="cursor-pointer text-sm font-medium">
              {g.waive}
            </summary>
            <ActionForm
              action={waiveStorageFeeAction.bind(null, workOrderId)}
              className="mt-2 grid gap-2"
            >
              <p className="text-xs text-muted-foreground">{g.waiveHint}</p>
              <Field label={t.v16.status.reason}>
                <Input name="reason" required minLength={3} maxLength={500} />
              </Field>
              <div>
                <Button type="submit" size="sm" variant="secondary">
                  {g.waive}
                </Button>
              </div>
            </ActionForm>
          </details>
        )}
      </div>
    </Card>
  );
}
