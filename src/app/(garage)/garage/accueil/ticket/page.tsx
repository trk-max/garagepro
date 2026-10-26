import Link from "next/link";
import QRCode from "qrcode";
import { ArrowLeft, Plus, Ticket } from "lucide-react";
import { deskManualTicketAction } from "@/actions/accueil";
import { ActionForm } from "@/components/action-form";
import { PrintButton } from "@/components/garage/print-button";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, Field, NativeSelect, PageHeader } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { formatTime, type Lang } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { requirePageAccess } from "@/lib/session";
import { deskTicketView, listReasons } from "@/server/accueil";
import { getSettings } from "@/server/settings";

export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ t?: string }> };
type ReasonName = { nameFr: string; nameAr: string | null; nameEn: string | null };
const reasonName = (r: ReasonName | null, lang: Lang) => (r ? (lang === "ar" ? r.nameAr || r.nameFr : lang === "en" ? r.nameEn || r.nameFr : r.nameFr) : "—");

/**
 * staff-ux — « Ticket manuel » of the reception (V15 queue), on its own page: a customer who did not use the
 * kiosk gets a ticket; with consent, the number and the public tracking link go to their phone / e-mail. After
 * creation: the number in big and a QR of the tracking link the customer can scan.
 */
export default async function ManualTicketPage({ searchParams }: PageProps) {
  const staff = await requirePageAccess("useReception");
  const { t: token } = await searchParams;
  const [{ t, lang }, reasons, settings] = await Promise.all([getI18n(), listReasons(), getSettings()]);
  const v = t.v15.desk;
  const s = t.staffUx.ticket;
  const ticket = token && token.length <= 64 ? await deskTicketView(staff, token) : null;
  const qr = ticket?.link ? await QRCode.toString(ticket.link, { type: "svg", margin: 1, errorCorrectionLevel: "M" }) : null;

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
      <PageHeader title={s.title} subtitle={s.subtitle}>
        <Link href="/garage/accueil" className="inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm hover:bg-muted print:hidden">
          <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden /> {s.back}
        </Link>
      </PageHeader>

      {ticket && (
        <Card className="text-center print:border-0 print:shadow-none" data-testid="manual-ticket-result">
          <p className="label-tech">{settings.garageName}</p>
          <p className="mt-2 text-sm text-muted-foreground">{reasonName(ticket.reason, lang)} · {formatTime(ticket.takenAt, lang, settings.timezone)}</p>
          <p className="my-3 font-mono text-7xl font-bold tracking-tight sm:text-8xl" dir="ltr" data-testid="manual-ticket-number">
            {ticket.label}
          </p>
          {qr && ticket.link ? (
            <div className="mx-auto flex max-w-xs flex-col items-center gap-2">
              <div className="w-48 rounded-md bg-white p-2 [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: qr }} data-testid="manual-ticket-qr" />
              <p className="text-xs text-muted-foreground">{s.scan}</p>
              <a href={ticket.link} target="_blank" rel="noopener" className="break-all font-mono text-[0.6875rem] text-muted-foreground underline-offset-4 hover:underline print:hidden" dir="ltr">
                {ticket.link}
              </a>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{s.noLink}</p>
          )}
          <p
            className={`mx-auto mt-4 max-w-md rounded-[14px] px-3 py-2 text-sm print:hidden ${ticket.message === "SENT" ? "bg-gp-success-bg text-gp-success-ink" : ticket.message === "NONE" ? "bg-gp-panel" : "bg-gp-accent-tint text-gp-accent-ink"}`}
            data-testid="manual-ticket-message"
            role="status"
          >
            {s.sent[ticket.message]}
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2 print:hidden">
            <PrintButton />
            <Button asChild variant="outline">
              <Link href="/garage/accueil/ticket">
                <Plus className="size-4" aria-hidden /> {s.another}
              </Link>
            </Button>
          </div>
        </Card>
      )}

      {!ticket && (
        <Card>
          <CardTitle className="flex items-center gap-2">
            <Ticket className="size-4" aria-hidden /> {v.manual}
          </CardTitle>
          <ActionForm action={deskManualTicketAction} className="grid gap-4" data-testid="manual-ticket-form">
            <Field label={v.reason}>
              <NativeSelect name="reasonId" required className="h-11">
                {reasons
                  .filter((r) => r.isActive)
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.prefix} · {reasonName(r, lang)}
                    </option>
                  ))}
              </NativeSelect>
            </Field>
            <Field label={v.plate}>
              <Input name="plate" maxLength={20} dir="ltr" autoCapitalize="characters" className="h-11 font-mono uppercase" />
            </Field>
            <fieldset className="grid gap-3 rounded-[18px] border border-gp-line p-4">
              <legend className="px-1 text-sm font-medium">{s.phoneTitle}</legend>
              <p className="text-xs text-muted-foreground">{s.phoneHint}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={v.phone}>
                  <Input name="phone" type="tel" inputMode="tel" autoComplete="off" maxLength={20} dir="ltr" className="h-11 text-base" />
                </Field>
                <Field label={s.email}>
                  <Input name="email" type="email" inputMode="email" autoComplete="off" maxLength={200} dir="ltr" className="h-11 text-base" />
                </Field>
              </div>
              <Field label={s.lang}>
                <NativeSelect name="lang" defaultValue={lang} className="h-11">
                  {(["fr", "ar", "en"] as const).map((l) => (
                    <option key={l} value={l}>
                      {s.langs[l]}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <label className="flex min-h-11 items-start gap-3 text-sm">
                <input type="checkbox" name="consent" className="mt-0.5 size-5 shrink-0" data-testid="manual-ticket-consent" /> {s.consent}
              </label>
            </fieldset>
            <Button type="submit" size="lg" className="h-12 text-base">
              {v.create}
            </Button>
          </ActionForm>
        </Card>
      )}
    </div>
  );
}
