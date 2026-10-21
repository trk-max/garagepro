"use client";

import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { useI18n } from "@/lib/i18n/client";
import { MESSAGE_MAX } from "@/lib/showroom";

type Result = { ok: true; data: { redirectTo?: string; message?: string } | null } | { ok: false; error: string };

/** Answer box of a conversation (team or buyer). */
export function ReplyForm({ action, placeholder }: { action: (form: FormData) => Promise<Result>; placeholder: string }) {
  const { t } = useI18n();
  return (
    <ActionForm action={action} silent className="space-y-2">
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      <label className="block">
        <span className="sr-only">{t.showroom.messages.reply}</span>
        <Textarea name="body" required maxLength={MESSAGE_MAX} rows={3} placeholder={placeholder} />
      </label>
      <div className="flex justify-end">
        <Button type="submit">{t.showroom.messages.send}</Button>
      </div>
    </ActionForm>
  );
}
