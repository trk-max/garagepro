import { CheckCircle2, Mail, XCircle } from "lucide-react";
import { sendTestEmailAction } from "@/actions/workshop";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { Dictionary } from "@/lib/i18n/fr";
import { emailConfigured, emailSender } from "@/server/email";

/** Settings card: is Resend configured, from which address, and a one-click test. */
export function EmailSettings({ t, defaultTo }: { t: Dictionary; defaultTo: string }) {
  const e = t.emailSettings;
  const ok = emailConfigured();
  const sender = emailSender();
  const sandbox = sender?.includes("@resend.dev");

  return (
    <Card>
      <CardTitle className="flex items-center gap-2">
        <Mail className="size-4" aria-hidden /> {e.title}
        <span
          className={`ms-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
            ok ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-zinc-500/10 text-muted-foreground"
          }`}
        >
          {ok ? <CheckCircle2 className="size-3.5" aria-hidden /> : <XCircle className="size-3.5" aria-hidden />}
          {ok ? e.configured : e.notConfigured}
        </span>
      </CardTitle>

      {ok ? (
        <>
          <p className="text-sm">
            <span className="text-muted-foreground">{e.sender} : </span>
            <span className="font-mono text-xs" dir="ltr">{sender}</span>
          </p>
          {sandbox && <p className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">{e.sandboxHint}</p>}
          <ActionForm action={sendTestEmailAction} reset={false} successMessage={e.sent} className="mt-4 flex flex-wrap items-end gap-2">
            <label className="flex min-w-60 flex-1 flex-col gap-1.5 text-sm">
              <span className="font-medium">{e.testTo}</span>
              <Input name="to" type="email" required defaultValue={defaultTo} dir="ltr" />
            </label>
            <Button type="submit">{e.sendTest}</Button>
          </ActionForm>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">{e.help}</p>
      )}
    </Card>
  );
}
