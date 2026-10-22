"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createDeviceAction, renameDeviceAction, revokeDeviceAction } from "@/actions/accueil";
import { ActionButton, ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, Field, NativeSelect } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { copyText } from "@/lib/clipboard";
import { fmt, formatDateTime } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";

export type DeviceRow = { id: string; name: string; kind: string; revokedAt: string | null; lastSeenAt: string | null };

/**
 * V15 — Paramètres › Accueil: device tokens of the kiosk tablet and the waiting-room TV.
 * The token comes back once from the server action; the activation link and its QR code are shown
 * until the page is left, never stored in the browser.
 */
export function QueueDevicesCard({ devices, linkBase, canConfigure }: { devices: DeviceRow[]; linkBase: string; canConfigure: boolean }) {
  const { t, lang } = useI18n();
  const v = t.v15.devices;
  const router = useRouter();
  const [pending, start] = useTransition();
  const [created, setCreated] = useState<{ name: string; link: string; qr: string } | null>(null);

  return (
    <Card id="accueil-appareils" className="scroll-mt-20">
      <CardTitle>{v.title}</CardTitle>
      <p className="-mt-2 mb-4 text-sm text-muted-foreground">{v.hint}</p>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const data = new FormData(form);
          start(async () => {
            const r = await createDeviceAction(data);
            if (!r.ok) {
              toast.error(r.error);
              return;
            }
            const link = `${linkBase}/accueil/activer?t=${r.data.token}`;
            const qr = await QRCode.toString(link, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
            setCreated({ name: r.data.name, link, qr });
            form.reset();
            router.refresh();
          });
        }}
      >
        <Field label={v.name} className="min-w-56 flex-1">
          <Input name="name" required maxLength={60} placeholder={v.namePlaceholder} className="h-9" />
        </Field>
        <Field label={v.kind}>
          <NativeSelect name="kind" defaultValue="KIOSK">
            <option value="KIOSK">{v.KIOSK}</option>
            <option value="SCREEN">{v.SCREEN}</option>
          </NativeSelect>
        </Field>
        <Button type="submit" disabled={pending}>
          {v.create}
        </Button>
      </form>

      {created && (
        <div className="mt-4 grid gap-4 rounded-lg border border-amber-500/60 bg-amber-50 p-4 sm:grid-cols-[10rem_1fr] dark:bg-amber-950/30" role="status" data-testid="device-link">
          <div className="rounded bg-white p-2 [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: created.qr }} />
          <div className="min-w-0 text-sm">
            <p className="font-medium">{created.name}</p>
            <p className="mt-1">{v.created}</p>
            <p className="mt-2 break-all rounded bg-background p-2 font-mono text-xs" dir="ltr">
              {created.link}
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-2"
              onClick={async () => {
                if (await copyText(created.link)) toast.success(t.common.saved);
              }}
            >
              {v.copy}
            </Button>
          </div>
        </div>
      )}

      <ul className="mt-4 divide-y rounded-md border">
        {devices.length === 0 && <li className="p-3 text-sm text-muted-foreground">{v.none}</li>}
        {devices.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
            <ActionForm action={renameDeviceAction.bind(null, d.id)} reset={false} silent className="flex min-w-0 flex-1 items-center gap-2">
              <Input name="name" defaultValue={d.name} maxLength={60} aria-label={v.name} className="h-8 max-w-56" disabled={!!d.revokedAt} />
              {!d.revokedAt && (
                <Button type="submit" size="sm" variant="ghost">
                  {v.rename}
                </Button>
              )}
            </ActionForm>
            <span className="text-muted-foreground">{d.kind === "SCREEN" ? v.SCREEN : v.KIOSK}</span>
            <span className="text-xs text-muted-foreground">{d.lastSeenAt ? fmt(v.lastSeen, { when: formatDateTime(d.lastSeenAt, lang) }) : v.never}</span>
            {d.revokedAt ? (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{v.revoked}</span>
            ) : (
              <ActionButton size="sm" variant="destructive" confirm={v.revokeConfirm} action={revokeDeviceAction.bind(null, d.id)}>
                {v.revoke}
              </ActionButton>
            )}
          </li>
        ))}
      </ul>
      {canConfigure && (
        <p className="mt-3 text-sm">
          <Link href="/garage/accueil/reglages" className="underline underline-offset-4">
            {v.settingsLink}
          </Link>
        </p>
      )}
    </Card>
  );
}
