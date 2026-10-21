"use client";

import { startConversationAction } from "@/actions/messaging";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n/client";
import { MESSAGE_MAX } from "@/lib/showroom";

/** "Contacter le vendeur" — no account: name, phone and/or e-mail, message → private conversation link. */
export function ContactSellerForm({ listingNumber }: { listingNumber: number }) {
  const { t } = useI18n();
  const c = t.showroom.contact;
  const field = "block space-y-1.5";
  const label = "f-label text-muted-foreground";
  return (
    <ActionForm action={startConversationAction.bind(null, listingNumber)} className="space-y-3">
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      <label className={field}>
        <span className={label}>{c.name}</span>
        <Input name="name" required maxLength={80} autoComplete="name" />
      </label>
      <label className={field}>
        <span className={label}>{c.phone}</span>
        <Input name="phone" type="tel" inputMode="tel" dir="ltr" placeholder="+216 …" autoComplete="tel" maxLength={20} />
      </label>
      <label className={field}>
        <span className={label}>{c.email}</span>
        <Input name="email" type="email" dir="ltr" autoComplete="email" maxLength={120} />
      </label>
      <p className="text-xs text-muted-foreground">{c.oneOf}</p>
      <label className={field}>
        <span className={label}>{c.message}</span>
        <Textarea name="message" required maxLength={MESSAGE_MAX} rows={4} placeholder={c.placeholder} />
      </label>
      <Button type="submit" className="h-12 w-full">
        {c.send}
      </Button>
      <p className="text-xs text-muted-foreground">{c.privacy}</p>
    </ActionForm>
  );
}
