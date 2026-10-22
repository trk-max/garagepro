import Link from "next/link";
import { Send } from "lucide-react";
import { sendAgendaAction } from "@/actions/agenda";
import { ActionButton } from "@/components/action-form";
import { StatusChip } from "@/components/agenda/agenda-ui";
import { PageHeader } from "@/components/ui/redesign/page-header";
import { Surface } from "@/components/ui/redesign/surface";
import { displayPlate } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { requirePageAccess } from "@/lib/session";
import { cn } from "@/lib/utils";
import { prepareMessages } from "@/server/agenda";

type PageProps = { searchParams: Promise<{ ids?: string; lang?: string }> };

/**
 * V12 — "Préparer le message": the garage reads every message before sending. Only validated
 * forecasts are sent (checked again on the server), in French or Arabic.
 */
export default async function AgendaMessagesPage({ searchParams }: PageProps) {
  await requirePageAccess("manageAgenda");
  const sp = await searchParams;
  const ids = (sp.ids ?? "")
    .split(",")
    .filter((x) => /^[\w-]{1,64}$/.test(x))
    .slice(0, 200);
  const msgLang = sp.lang === "ar" ? "ar" : "fr";
  const [{ t }, rows] = await Promise.all([getI18n(), prepareMessages(ids, msgLang)]);
  const m = t.v12.messages;
  const sendable = rows.filter((r) => r.status === "VALIDATED" && !r.customer.reminderOptOut);
  const qs = (lang: string) => `/garage/agenda/messages?ids=${ids.join(",")}&lang=${lang}`;

  return (
    <div className="mx-auto max-w-4xl px-3 pt-4 pb-6 sm:px-5">
      <PageHeader title={m.title} subtitle={m.intro}>
        <Link href="/garage/agenda" className="text-sm underline-offset-4 hover:underline">
          {m.back}
        </Link>
      </PageHeader>
      <div className="mb-4 flex items-center gap-2 text-sm">
        <span className="text-gp-muted">{m.lang} :</span>
        {(["fr", "ar"] as const).map((l) => (
          <Link key={l} href={qs(l)} className={cn("rounded-full border px-3 py-1", l === msgLang && "bg-gp-primary text-gp-primary-ink")}>
            {m.langs[l]}
          </Link>
        ))}
      </div>
      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.id}>
            <Surface className="space-y-2 p-4">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-mono text-xs" dir="ltr">
                  {displayPlate(r.plate)}
                </span>
                <span className="font-medium">{r.customer.name}</span>
                <span className="text-xs text-gp-muted" dir="ltr">
                  {m.to} : {[r.customer.phone, r.customer.email].filter(Boolean).join(" · ")}
                </span>
                <span className="ms-auto">
                  <StatusChip value={r.status} t={t} />
                </span>
              </div>
              <p className="rounded-[14px] bg-gp-panel p-3 text-sm whitespace-pre-line" dir={msgLang === "ar" ? "rtl" : "ltr"} lang={msgLang}>
                {r.body}
              </p>
              {r.customer.reminderOptOut && <p className="text-xs text-gp-danger-ink">{m.optOut}</p>}
              {r.status !== "VALIDATED" && !r.customer.reminderOptOut && <p className="text-xs text-gp-muted">{m.notValidated}</p>}
            </Surface>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex justify-end">
        <ActionButton action={sendAgendaAction.bind(null, sendable.map((r) => r.id), msgLang)} disabled={sendable.length === 0} className="h-11 rounded-full px-5">
          <Send className="size-4" aria-hidden /> {m.send} ({sendable.length})
        </ActionButton>
      </div>
    </div>
  );
}
