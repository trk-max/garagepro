"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type ReactNode } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

type Result = { ok: true; data: { redirectTo?: string; warning?: string; message?: string } | null | undefined } | { ok: false; error: string };

export type StatusChoice = {
  to: string;
  label: string;
  /** A reason is mandatory for this move. */
  reason: boolean;
  /** Delivery refused as it is (V16): "noInvoice" | "balanceDue" (a manager may override); V16 Lot 2: "approvalMissing" (no override: record the agreement first). */
  block?: "noInvoice" | "balanceDue" | "approvalMissing" | null;
  /** V16 Lot 3 — refused quote → « Prêt »: ask whether the car was put back together. */
  reassembly?: boolean;
  /** V16 Lot 3 — a refused SAFETY line: the signed waiver must be confirmed (by someone allowed to). */
  waiver?: { canSign: boolean; href: string } | null;
};

/** Native <dialog> shell shared by the status and the line dialogs (Escape / click outside close). */
function DialogShell({ dialogRef, title, children }: { dialogRef: React.RefObject<HTMLDialogElement | null>; title: string; children: ReactNode }) {
  const { t } = useI18n();
  return (
    <dialog
      ref={dialogRef}
      aria-label={title}
      onClick={(e) => e.target === e.currentTarget && dialogRef.current?.close()}
      className="gp-enter m-auto max-h-[calc(100dvh-2rem)] w-[min(32rem,calc(100vw-1.5rem))] rounded-[28px] border border-gp-line bg-gp-card p-0 text-gp-ink shadow-2xl backdrop:bg-black/40 backdrop:backdrop-blur-sm"
    >
      <div className="flex items-center gap-3 p-5 pb-3">
        <h2 className="flex-1 text-lg font-semibold tracking-tight">{title}</h2>
        <button type="button" onClick={() => dialogRef.current?.close()} aria-label={t.common.close} className="grid size-10 place-items-center rounded-full bg-gp-panel hover:bg-gp-hover">
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <div className="px-5 pb-5">{children}</div>
    </dialog>
  );
}

function useSubmit(action: (form: FormData) => Promise<Result>, onDone: () => void) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const submit = (form: FormData) =>
    startTransition(async () => {
      const result = await action(form);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (result.data?.warning) toast.warning(result.data.warning);
      onDone();
      if (result.data?.redirectTo) router.push(result.data.redirectTo);
      else router.refresh();
    });
  return { pending, submit };
}

/**
 * V16 — « Changer le statut » : only the moves this user may make (computed by the server page), the
 * reason box when the move requires one (always internal), and « livrer quand même » for a manager when
 * the delivery is refused (no invoice / balance due). The server checks everything again.
 */
export function StatusDialog({
  action,
  choices,
  defaultTo,
  canOverride,
  balanceText,
  trigger,
  triggerClassName,
  variant = "outline",
}: {
  action: (form: FormData) => Promise<Result>;
  choices: StatusChoice[];
  defaultTo?: string;
  canOverride: boolean;
  /** Formatted balance due (shown when the delivery is refused for a balance). */
  balanceText?: string;
  trigger: ReactNode;
  triggerClassName?: string;
  variant?: "default" | "outline" | "secondary";
}) {
  const { t } = useI18n();
  const v = t.v16.status;
  const ref = useRef<HTMLDialogElement>(null);
  const [to, setTo] = useState(defaultTo ?? choices[0]?.to ?? "");
  const [override, setOverride] = useState(false);
  const { pending, submit } = useSubmit(action, () => ref.current?.close());
  const choice = choices.find((c) => c.to === to);
  const blocked = choice?.block ?? null;
  const overridable = blocked === "noInvoice" || blocked === "balanceDue";
  const needReason = !!choice?.reason || (overridable && override);
  const [waiverSigned, setWaiverSigned] = useState(false);
  const refused = (blocked !== null && !(overridable && override)) || (!!choice?.waiver && !waiverSigned);

  return (
    <>
      <Button
        type="button"
        variant={variant}
        className={triggerClassName}
        aria-haspopup="dialog"
        onClick={() => {
          setTo(defaultTo ?? choices[0]?.to ?? "");
          setOverride(false);
          setWaiverSigned(false);
          ref.current?.showModal();
        }}
      >
        {trigger}
      </Button>
      <DialogShell dialogRef={ref} title={v.title}>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit(new FormData(e.currentTarget));
          }}
        >
          <label className="grid gap-1.5 text-sm font-medium">
            {v.to}
            <select
              name="status"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setOverride(false);
                setWaiverSigned(false);
              }}
              className="h-11 rounded-[14px] border border-gp-line bg-gp-card px-3 text-sm"
            >
              {choices.map((c) => (
                <option key={c.to} value={c.to}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>

          {blocked && (
            <div role="alert" className="grid gap-2 rounded-[14px] bg-gp-accent-tint px-3 py-2 text-sm text-gp-accent-ink">
              <p>{blocked === "approvalMissing" ? t.v16.quote.approvalMissing : blocked === "noInvoice" ? v.noInvoice : v.balanceDue.replace("{amount}", balanceText ?? "")}</p>
              {!overridable ? null : canOverride ? (
                <label className="flex items-start gap-2 font-medium">
                  <input type="checkbox" name="override" checked={override} onChange={(e) => setOverride(e.target.checked)} className="mt-0.5 size-4" />
                  {v.override}
                </label>
              ) : (
                <p className="text-xs">{v.overrideOnlyManager}</p>
              )}
            </div>
          )}

          {choice?.reassembly && (
            <label className="flex items-start gap-2 text-sm font-medium">
              <input type="checkbox" name="reassembled" defaultChecked className="mt-0.5 size-4" />
              {t.v16.lot3.refusal.reassembled}
            </label>
          )}

          {choice?.waiver && (
            <div role="alert" className="grid gap-2 rounded-[14px] bg-gp-danger-bg px-3 py-2 text-sm text-gp-danger-ink">
              <p>{t.v16.lot3.refusal.waiverNeeded}</p>
              <a href={choice.waiver.href} target="_blank" rel="noopener" className="font-medium underline">
                {t.v16.lot3.refusal.waiverPrint}
              </a>
              {choice.waiver.canSign ? (
                <label className="flex items-start gap-2 font-medium">
                  <input type="checkbox" name="safetyWaiver" checked={waiverSigned} onChange={(e) => setWaiverSigned(e.target.checked)} className="mt-0.5 size-4" />
                  {t.v16.lot3.refusal.waiverSigned}
                </label>
              ) : (
                <p className="text-xs">{t.v16.lot3.refusal.waiverOnlyStaff}</p>
              )}
            </div>
          )}

          {needReason && (
            <label className="grid gap-1.5 text-sm font-medium">
              <span>
                {v.reason} <span className="text-gp-danger-ink">*</span>
              </span>
              <textarea
                name="reason"
                required
                minLength={3}
                maxLength={500}
                rows={3}
                placeholder={v.reasonPlaceholder}
                className="rounded-[14px] border border-gp-line bg-gp-card px-3 py-2 text-sm"
              />
              <span className="text-xs font-normal text-gp-muted">
                {v.reasonRequired}. {v.reasonHint}
              </span>
            </label>
          )}

          <div className="flex justify-end gap-2">
            <Button type="submit" disabled={pending || refused || !choice} className={cn(pending && "opacity-70")}>
              {v.submit}
            </Button>
          </div>
        </form>
      </DialogShell>
    </>
  );
}

/** V16 — voiding a line of the accepted quote: reason mandatory, the line is kept (struck through). */
export function VoidLineDialog({ action, trigger, label }: { action: (form: FormData) => Promise<Result>; trigger: ReactNode; label: string }) {
  const { t } = useI18n();
  const v = t.v16.line;
  const ref = useRef<HTMLDialogElement>(null);
  const { pending, submit } = useSubmit(action, () => ref.current?.close());
  return (
    <>
      <Button type="button" variant="ghost" size="icon-sm" aria-label={label} title={label} aria-haspopup="dialog" onClick={() => ref.current?.showModal()}>
        {trigger}
      </Button>
      <DialogShell dialogRef={ref} title={v.voidTitle}>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit(new FormData(e.currentTarget));
          }}
        >
          <p className="text-sm text-gp-muted">{v.voidHint}</p>
          <label className="grid gap-1.5 text-sm font-medium">
            <span>
              {t.v16.status.reason} <span className="text-gp-danger-ink">*</span>
            </span>
            <textarea name="reason" required minLength={3} maxLength={500} rows={3} className="rounded-[14px] border border-gp-line bg-gp-card px-3 py-2 text-sm" />
            <span className="text-xs font-normal text-gp-muted">{t.v16.status.reasonHint}</span>
          </label>
          <div className="flex justify-end">
            <Button type="submit" variant="destructive" disabled={pending}>
              {v.void}
            </Button>
          </div>
        </form>
      </DialogShell>
    </>
  );
}
