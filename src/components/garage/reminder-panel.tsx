"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Mail, MessageCircle, MessageSquareText } from "lucide-react";
import { toast } from "sonner";
import type { ReminderChannel } from "@prisma/client";
import { recordReminderAction } from "@/actions/purchasing";
import { sendReminderEmailAction } from "@/actions/workshop";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { useI18n } from "@/lib/i18n/client";

/** Tunisian numbers: "20 111 222" → "21620111222" (international, digits only). */
function intlPhone(phone: string): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 8) digits = `216${digits}`;
  return digits;
}

export function ReminderPanel({
  invoiceId,
  invoiceNumber,
  phone,
  email,
  defaultMessage,
  emailViaResend = false,
}: {
  invoiceId: string;
  invoiceNumber: string;
  phone: string | null;
  email: string | null;
  defaultMessage: string;
  /** true = the e-mail is sent by the server (Resend) instead of opening the mail app. */
  emailViaResend?: boolean;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [message, setMessage] = useState(defaultMessage);
  const [pending, startTransition] = useTransition();

  const send = (channel: ReminderChannel) => {
    const text = encodeURIComponent(message);
    let url: string;
    if (channel === "EMAIL" && emailViaResend) {
      if (!email) return toast.error(t.errors.noEmail);
      startTransition(async () => {
        const result = await sendReminderEmailAction(invoiceId, message);
        if (result.ok) {
          toast.success(t.emailSettings.sent);
          router.refresh();
        } else toast.error(result.error);
      });
      return;
    }
    if (channel === "EMAIL") {
      if (!email) return toast.error(t.errors.noEmail);
      url = `mailto:${email}?subject=${encodeURIComponent(`${t.invoices.invoice} ${invoiceNumber}`)}&body=${text}`;
    } else {
      if (!phone) return toast.error(t.errors.noPhone);
      url = channel === "WHATSAPP" ? `https://wa.me/${intlPhone(phone)}?text=${text}` : `sms:+${intlPhone(phone)}?body=${text}`;
    }
    window.open(url, "_blank", "noopener");

    startTransition(async () => {
      const result = await recordReminderAction(invoiceId, channel, message);
      if (result.ok) toast.success(t.reminders.sent);
      else toast.error(result.error);
    });
  };

  const buttons: { channel: ReminderChannel; icon: typeof Mail; disabled: boolean }[] = [
    { channel: "WHATSAPP", icon: MessageCircle, disabled: !phone },
    { channel: "SMS", icon: MessageSquareText, disabled: !phone },
    { channel: "EMAIL", icon: Mail, disabled: !email },
  ];

  return (
    <div className="space-y-3">
      <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={5} aria-label={t.reminders.send} />
      <p className="text-xs text-muted-foreground">{t.reminders.via}</p>
      <div className="grid grid-cols-3 gap-2">
        {buttons.map(({ channel, icon: Icon, disabled }) => (
          <Button key={channel} type="button" variant={channel === "WHATSAPP" ? "default" : "outline"} size="sm" disabled={disabled || pending} onClick={() => send(channel)}>
            <Icon className="size-4" aria-hidden /> {t.reminders.channels[channel]}
          </Button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{t.reminders.hint}</p>
    </div>
  );
}
